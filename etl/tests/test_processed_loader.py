import copy
import io
import json
import logging
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import MagicMock, Mock, patch

import psycopg
from botocore.exceptions import ClientError

from tests.test_etl import fixture, BUCKET, KEY
from waypost_etl.database import database_url
from waypost_etl.errors import ValidationError
from waypost_etl.load_cli import main
from waypost_etl.pipeline import processed_key
from waypost_etl.processed_loader import load_object, upsert_routes, UPSERT
from waypost_etl.providers.here import transform
from waypost_etl.providers.processed_here import validate_processed

PROCESSED_KEY = processed_key(KEY)


def processed():
    return transform(fixture(), BUCKET, KEY)


def s3_response(record=None, data=None):
    body = io.BytesIO(data if data is not None else json.dumps(record if record is not None else processed()).encode())
    client = Mock(spec=["get_object", "close"])
    client.get_object.return_value = {"Body": body}
    return client, body


class ProcessedValidationTests(unittest.TestCase):
    def test_preserves_metrics_lineage_geometry_and_nulls(self):
        record = processed()
        before = copy.deepcopy(record)
        rows = validate_processed(record, BUCKET, PROCESSED_KEY)
        self.assertEqual(len(rows), 2)
        self.assertEqual(rows[0]["raw_s3_key"], KEY)
        self.assertEqual(rows[0]["processed_s3_key"], PROCESSED_KEY)
        self.assertEqual(rows[0]["distance_meters"], 3000)
        self.assertEqual(rows[0]["duration_seconds"], 300)
        self.assertEqual(rows[0]["base_duration_seconds"], 270)
        self.assertIsNone(rows[1]["base_duration_seconds"])
        self.assertEqual(json.loads(rows[0]["geometry"]), record["routes"][0]["geometry"])
        self.assertEqual(record, before)

    def test_rejects_contract_and_lineage_errors(self):
        changes = [("schemaVersion", 1), ("schemaVersion", True), ("provider", "other"), ("domain", "other"),
                   ("transformation", {"name": "here-routing", "version": "3.0.0"}),
                   ("transformation", {"name": "other", "version": "2.0.0"}), ("geometryCrs", "EPSG:3857"),
                   ("fetchedAt", "2026-09-06"), ("processedAt", "bad"), ("routeCount", 3), ("sectionCount", 99),
                   ("routes", []), ("source", {"schemaVersion": 1, "bucket": BUCKET}),
                   ("source", {"schemaVersion": True, "bucket": BUCKET, "key": KEY})]
        for field, value in changes:
            record = processed()
            record[field] = value
            with self.subTest(field=field, value=value), self.assertRaises(ValidationError):
                validate_processed(record, BUCKET, PROCESSED_KEY)
        for field in processed():
            record = processed()
            del record[field]
            with self.subTest(missing=field), self.assertRaises(ValidationError):
                validate_processed(record, BUCKET, PROCESSED_KEY)
        for bucket, key in [("", PROCESSED_KEY), (BUCKET, KEY), (BUCKET, PROCESSED_KEY + "wrong")]:
            with self.assertRaises(ValidationError):
                validate_processed(processed(), bucket, key)

    def test_rejects_malformed_geometry_and_metrics(self):
        invalid = [None, {}, {"type": "Point", "coordinates": [0, 0]},
                   {"type": "LineString", "coordinates": [[0, 0]]},
                   {"type": "LineString", "coordinates": [[0, 0], [0, 0]]}]
        for point in [[181, 0], [0, 91], [float("nan"), 0], [0, float("inf")], [True, 0], ["0", 0], [0, 0, 0]]:
            invalid.append({"type": "LineString", "coordinates": [[1, 1], point]})
        for geometry in invalid:
            record = processed()
            record["routes"][1]["geometry"] = geometry
            with self.subTest(geometry=geometry), self.assertRaises(ValidationError):
                validate_processed(record, BUCKET, PROCESSED_KEY)
        for field, value in [("routeIndex", 0), ("sectionCount", 0), ("summary", {}), ("summarySectionCounts", {})]:
            record = processed()
            record["routes"][1][field] = value
            with self.subTest(field=field), self.assertRaises(ValidationError):
                validate_processed(record, BUCKET, PROCESSED_KEY)
        for value in [-1, True, "100", float("nan"), float("inf"), None]:
            record = processed()
            record["routes"][0]["summary"]["distanceMeters"] = value
            with self.subTest(value=value), self.assertRaises(ValidationError):
                validate_processed(record, BUCKET, PROCESSED_KEY)


class LoaderTests(unittest.TestCase):
    def test_reads_only_s3_and_closes_body_before_atomic_upsert(self):
        client, body = s3_response()
        connect = MagicMock()
        connection = connect.return_value.__enter__.return_value
        cursor = connection.cursor.return_value.__enter__.return_value
        cursor.fetchone.return_value = (2,)
        self.assertEqual(load_object(client, BUCKET, PROCESSED_KEY, "not-a-real-dsn", connect=connect), 2)
        client.get_object.assert_called_once_with(Bucket=BUCKET, Key=PROCESSED_KEY)
        self.assertTrue(body.closed)
        connection.transaction.assert_called_once_with()
        calls = cursor.execute.call_args_list
        self.assertEqual(len(calls), 3)
        self.assertEqual(calls[0].args[0], UPSERT)
        self.assertEqual(calls[0].args[1]["route_index"], 0)
        self.assertEqual(calls[1].args[1]["route_index"], 1)

    def test_invalid_last_route_or_json_never_connects_to_db(self):
        record = processed()
        record["routes"][-1]["geometry"] = None
        cases = [json.dumps(record).encode(), b"not json", b"\xff", b'{"a":1,"a":2}', b'{"a":NaN}']
        for data in cases:
            client, body = s3_response(data=data)
            connect = Mock()
            with self.subTest(data=data[:12]), self.assertRaises(ValidationError):
                load_object(client, BUCKET, PROCESSED_KEY, "unused", connect=connect)
            connect.assert_not_called()
            self.assertTrue(body.closed)

    def test_transaction_receives_error_for_rollback(self):
        connection = MagicMock()
        cursor = connection.cursor.return_value.__enter__.return_value
        cursor.execute.side_effect = [None, psycopg.IntegrityError("private geometry")]
        with self.assertRaises(psycopg.IntegrityError):
            upsert_routes(connection, validate_processed(processed(), BUCKET, PROCESSED_KEY))
        self.assertEqual(connection.transaction.return_value.__exit__.call_args.args[0], psycopg.IntegrityError)

    def test_refuses_stale_extra_source_rows_without_deleting(self):
        connection = MagicMock()
        connection.cursor.return_value.__enter__.return_value.fetchone.return_value = (3,)
        with self.assertRaisesRegex(ValidationError, "route count"):
            upsert_routes(connection, validate_processed(processed(), BUCKET, PROCESSED_KEY))

    def test_s3_failure_never_connects(self):
        client, _ = s3_response()
        client.get_object.side_effect = ClientError({"Error": {"Code": "AccessDenied"}}, "GetObject")
        connect = Mock()
        with self.assertRaises(ClientError):
            load_object(client, BUCKET, PROCESSED_KEY, "unused", connect=connect)
        connect.assert_not_called()


class ConfigurationAndCliTests(unittest.TestCase):
    def tearDown(self):
        logging.getLogger("waypost_etl").handlers = [logging.NullHandler()]

    def test_environment_precedence_and_database_only_file_fallback(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "config"
            path.write_text('DATABASE_URL="file-value"\nHERE_API_KEY=do-not-load\n')
            with patch.dict(os.environ, {"DATABASE_URL": "environment-value"}):
                self.assertEqual(database_url(path), "environment-value")
            with patch.dict(os.environ, {}, clear=True):
                self.assertEqual(database_url(path), "file-value")
                self.assertNotIn("HERE_API_KEY", os.environ)
                with self.assertRaises(ValidationError):
                    database_url(None)

    @patch("waypost_etl.load_cli.database_url", return_value="secret-dsn")
    @patch("waypost_etl.load_cli.boto3.client")
    def test_cli_success_and_sanitized_failure(self, create_client, _url):
        create_client.return_value = Mock(spec=["close"])
        with patch("waypost_etl.load_cli.load_object", return_value=2), patch("sys.stderr", new_callable=io.StringIO) as output:
            self.assertEqual(main(["--bucket", BUCKET, "--key", PROCESSED_KEY]), 0)
        event = json.loads(output.getvalue())
        self.assertEqual((event["event"], event["rowCount"]), ("load_succeeded", 2))
        for error in [psycopg.OperationalError("secret-dsn FULL-GEOMETRY"), ClientError({"Error": {"Code": "AccessDenied", "Message": "FULL-GEOMETRY"}}, "GetObject")]:
            with patch("waypost_etl.load_cli.load_object", side_effect=error), patch("sys.stderr", new_callable=io.StringIO) as output:
                self.assertEqual(main(["--bucket", BUCKET, "--key", PROCESSED_KEY, "--debug"]), 1)
            self.assertEqual(json.loads(output.getvalue())["event"], "load_failed")
            self.assertNotIn("secret-dsn", output.getvalue())
            self.assertNotIn("FULL-GEOMETRY", output.getvalue())
