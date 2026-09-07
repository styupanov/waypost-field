import copy
from datetime import datetime, timezone
import io
import json
import logging
import os
import unittest
from unittest.mock import Mock, patch

from botocore.exceptions import ClientError, NoCredentialsError
import boto3
from botocore import UNSIGNED
from botocore.config import Config
from botocore.stub import ANY, Stubber

from waypost_etl.cli import JsonFormatter, main
from waypost_etl.errors import ValidationError
from waypost_etl.pipeline import process_object, processed_key
from waypost_etl.providers.here import transform

POLYLINE = "BFoz5xJ67i1B1B7PzIhaxL7Y"
COORDINATES = [[8.69821, 50.10228], [8.69567, 50.10201], [8.6915, 50.10063], [8.68752, 50.09878]]

BUCKET = "test-bucket"
KEY = "raw/routing/here/year=2026/month=09/day=06/2026-09-06T23-03-21.654Z-920f5e8e-8148-4578-94dd-6a8d11295693.json"


def fixture():
    return {
        "schemaVersion": 1, "provider": "here", "domain": "routing",
        "fetchedAt": "2026-09-06T23:03:21.654Z",
        "payload": {"routes": [
            {"sections": [{"polyline": POLYLINE, "summary": {"length": 1000, "duration": 100, "baseDuration": 90}},
                          {"polyline": POLYLINE, "summary": {"length": 2000, "duration": 200, "baseDuration": 180}}]},
            {"sections": [{"polyline": POLYLINE, "summary": {"length": 500, "duration": 50}}]},
        ]},
    }


def mock_s3(raw=None, data=None):
    client = Mock(spec=["get_object", "put_object", "close"])
    body = io.BytesIO(data if data is not None else json.dumps(raw if raw is not None else fixture()).encode())
    client.get_object.return_value = {"Body": body}
    return client, body


class TransformationTests(unittest.TestCase):
    def test_all_routes_totals_and_traceability_without_mutation(self):
        raw = fixture()
        before = copy.deepcopy(raw)
        raw["payload"]["unused"] = "not copied"
        result = transform(raw, BUCKET, KEY)
        self.assertEqual(result["schemaVersion"], 2)
        self.assertEqual(result["transformation"], {"name": "here-routing", "version": "2.0.0"})
        self.assertEqual(result["geometryCrs"], "EPSG:4326")
        self.assertIsNotNone(datetime.fromisoformat(result["processedAt"]).tzinfo)
        self.assertEqual(result["source"], {"bucket": BUCKET, "key": KEY, "schemaVersion": 1})
        self.assertEqual(result["fetchedAt"], raw["fetchedAt"])
        self.assertEqual((result["routeCount"], result["sectionCount"]), (2, 3))
        self.assertEqual(result["routes"][0], {
            "routeIndex": 0, "sectionCount": 2,
            "geometry": {"type": "LineString", "coordinates": COORDINATES * 2},
            "summary": {"distanceMeters": 3000, "durationSeconds": 300, "baseDurationSeconds": 270},
            "summarySectionCounts": {"distanceMeters": 2, "durationSeconds": 2, "baseDurationSeconds": 2},
        })
        self.assertIsNone(result["routes"][1]["summary"]["baseDurationSeconds"])
        self.assertNotIn("not copied", json.dumps(result))
        del raw["payload"]["unused"]
        self.assertEqual(raw, before)

    def test_missing_null_and_zero_metrics(self):
        raw = fixture()
        raw["payload"]["routes"] = [{"sections": [{"polyline": POLYLINE, "summary": {"length": 0, "duration": None}}, {"polyline": POLYLINE}]}]
        route = transform(raw, BUCKET, KEY)["routes"][0]
        self.assertEqual(route["summary"], {"distanceMeters": None, "durationSeconds": None, "baseDurationSeconds": None})
        self.assertEqual(route["summarySectionCounts"]["distanceMeters"], 1)
        raw["payload"]["routes"][0]["sections"].pop()
        self.assertEqual(transform(raw, BUCKET, KEY)["routes"][0]["summary"]["distanceMeters"], 0)

    def test_invalid_wrappers(self):
        cases = [("schemaVersion", value) for value in [None, True, 1.0, 2, "1"]]
        cases += [("provider", "other"), ("domain", "places")]
        cases += [("fetchedAt", value) for value in [None, 123, "2026-09-06", "2026-09-06T23:03:21", "2026-02-30T00:00:00Z", "2026-09-06T00:00:00+01:99"]]
        cases += [("payload", value) for value in [None, [], {}, {"routes": []}, {"routes": {}}, {"routes": [None]}]]
        for field, value in cases:
            with self.subTest(field=field, value=value):
                raw = fixture()
                raw[field] = value
                with self.assertRaises(ValidationError):
                    transform(raw, BUCKET, KEY)
        for field in fixture():
            raw = fixture()
            del raw[field]
            with self.subTest(missing=field), self.assertRaises(ValidationError):
                transform(raw, BUCKET, KEY)
        for value in [None, [], "text"]:
            with self.assertRaises(ValidationError):
                transform(value, BUCKET, KEY)

    def test_malformed_sections_and_metrics(self):
        for sections in [None, [], {}, [None], [{"summary": None}], [{"summary": []}]]:
            raw = fixture()
            raw["payload"]["routes"][0]["sections"] = sections
            with self.subTest(sections=sections), self.assertRaises(ValidationError):
                transform(raw, BUCKET, KEY)
        for field in ["length", "duration", "baseDuration"]:
            for value in [-1, True, "100", [], float("inf"), float("nan")]:
                raw = fixture()
                raw["payload"]["routes"][0]["sections"][0]["summary"][field] = value
                with self.subTest(field=field, value=value), self.assertRaises(ValidationError):
                    transform(raw, BUCKET, KEY)
        raw = fixture()
        for section in raw["payload"]["routes"][0]["sections"]:
            section["summary"]["length"] = 1e308
        with self.assertRaisesRegex(ValidationError, "overflow"):
            transform(raw, BUCKET, KEY)


class PipelineTests(unittest.TestCase):
    def test_idempotent_writes_same_bucket_no_raw_mutations(self):
        client, body = mock_s3()
        expected = KEY.replace("raw/", "processed/", 1)
        self.assertEqual(process_object(client, BUCKET, KEY), expected)
        client.get_object.assert_called_once_with(Bucket=BUCKET, Key=KEY)
        self.assertTrue(body.closed)
        first = client.put_object.call_args
        self.assertEqual(first.kwargs["Bucket"], BUCKET)
        self.assertEqual(first.kwargs["Key"], expected)
        self.assertEqual(first.kwargs["ContentType"], "application/json")
        first_record = json.loads(first.kwargs["Body"])
        self.assertEqual(first_record, transform(fixture(), BUCKET, KEY, processed_at=datetime.fromisoformat(first_record["processedAt"])))
        client.get_object.return_value = {"Body": io.BytesIO(json.dumps(fixture()).encode())}
        process_object(client, BUCKET, KEY)
        second = client.put_object.call_args
        self.assertEqual(second.kwargs["Key"], first.kwargs["Key"])
        second_record = json.loads(second.kwargs["Body"])
        self.assertGreaterEqual(second_record.pop("processedAt"), first_record.pop("processedAt"))
        self.assertEqual(second_record, first_record)
        self.assertEqual([call[0] for call in client.mock_calls], ["get_object", "put_object", "get_object", "put_object"])

    def test_invalid_data_never_writes_and_closes_body(self):
        for data in [b"not JSON", b"\xff", b'{"x":NaN}', b'{"x":1,"x":2}', b"null", b"{}"]:
            client, body = mock_s3(data=data)
            with self.subTest(data=data), self.assertRaises(ValidationError):
                process_object(client, BUCKET, KEY)
            client.put_object.assert_not_called()
            self.assertTrue(body.closed)
        raw = fixture()
        raw["payload"]["routes"][1]["sections"] = []
        client, body = mock_s3(raw)
        with self.assertRaises(ValidationError):
            process_object(client, BUCKET, KEY)
        client.put_object.assert_not_called()
        self.assertTrue(body.closed)

    def test_key_validation_and_utc_partition(self):
        for key in ["raw/other.json", KEY.replace("month=09", "month=13"), KEY.replace("raw/", "processed/", 1)]:
            with self.subTest(key=key), self.assertRaises(ValidationError):
                processed_key(key)
        raw = fixture()
        raw["fetchedAt"] = "2026-09-05T23:30:00-04:00"
        client, _ = mock_s3(raw)
        process_object(client, BUCKET, KEY)
        raw["fetchedAt"] = "2026-09-07T00:00:00Z"
        client, _ = mock_s3(raw)
        with self.assertRaisesRegex(ValidationError, "partition"):
            process_object(client, BUCKET, KEY)
        client.put_object.assert_not_called()

    def test_s3_failures_propagate(self):
        for operation in ["get_object", "put_object"]:
            client, _ = mock_s3()
            getattr(client, operation).side_effect = ClientError({"Error": {"Code": "AccessDenied"}}, operation)
            with self.subTest(operation=operation), self.assertRaises(ClientError):
                process_object(client, BUCKET, KEY)
            if operation == "get_object":
                client.put_object.assert_not_called()


class CliTests(unittest.TestCase):
    def tearDown(self):
        # CLI logging must not retain a test's closed stderr stream.
        logging.getLogger("waypost_etl").handlers = [logging.NullHandler()]

    @patch("waypost_etl.cli.boto3.client")
    def test_cli_success_default_credentials_and_json_logs(self, create_client):
        client, _ = mock_s3()
        create_client.return_value = client
        with patch("sys.stderr", new_callable=io.StringIO) as output:
            self.assertEqual(main(["--bucket", BUCKET, "--key", KEY, "--region", "us-east-1"]), 0)
        events = [json.loads(line) for line in output.getvalue().splitlines()]
        self.assertEqual([item["event"] for item in events], ["processing_started", "raw_validated", "processed_written"])
        self.assertTrue(all(item["timestamp"] and item["level"] == "INFO" for item in events))
        self.assertEqual(set(create_client.call_args.kwargs), {"region_name", "config"})
        client.close.assert_called_once_with()

    def test_real_boto3_client_lifecycle_with_stubbed_s3(self):
        # Exercise the SDK's actual client interface, with unsigned stubbed requests
        # and no environment profile/credential resolution or real AWS calls.
        with patch.dict(os.environ, {"AWS_EC2_METADATA_DISABLED": "true"}, clear=True):
            client = boto3.session.Session().client("s3", region_name="us-east-1", config=Config(signature_version=UNSIGNED))
        with Stubber(client) as stubber:
            stubber.add_response("get_object", {"Body": io.BytesIO(json.dumps(fixture()).encode())}, {"Bucket": BUCKET, "Key": KEY})
            stubber.add_response("put_object", {}, {"Bucket": BUCKET, "Key": processed_key(KEY), "ContentType": "application/json", "Body": ANY})
            with patch("waypost_etl.cli.boto3.client", return_value=client), patch.object(client, "close", wraps=client.close) as close, patch("sys.stderr", new_callable=io.StringIO):
                self.assertEqual(main(["--bucket", BUCKET, "--key", KEY]), 0)
                close.assert_called_once_with()
            stubber.assert_no_pending_responses()

    @patch("waypost_etl.cli.boto3.client")
    def test_debug_traceback_is_safe_and_client_closes_on_failure(self, create_client):
        for debug in [False, True]:
            client, _ = mock_s3()
            client.get_object.side_effect = TypeError("credential-secret provider-payload https://secret.example")
            create_client.return_value = client
            with patch("sys.stderr", new_callable=io.StringIO) as output:
                self.assertEqual(main(["--bucket", BUCKET, "--key", KEY] + (["--debug"] if debug else [])), 1)
            client.close.assert_called_once_with()
            event = json.loads(output.getvalue().splitlines()[-1])
            self.assertEqual(event["errorType"], "TypeError")
            self.assertEqual("traceback" in event, debug)
            if debug:
                frames = event["traceback"]
                self.assertTrue(any(frame["file"] == "pipeline.py" and frame["function"] == "process_object" for frame in frames))
                self.assertTrue(all(set(frame) == {"file", "line", "function"} and frame["line"] > 0 for frame in frames))
            for secret in ["credential-secret", "provider-payload", "secret.example"]:
                self.assertNotIn(secret, output.getvalue())

    @patch("waypost_etl.cli.boto3.client")
    def test_cli_failure_exit_code_and_safe_logs(self, create_client):
        for error in [ValidationError("payload.routes must be a nonempty array"), NoCredentialsError(), ClientError({"Error": {"Code": "AccessDenied", "Message": "secret request URL"}}, "GetObject")]:
            create_client.side_effect = error
            with self.subTest(error=type(error).__name__), patch("sys.stderr", new_callable=io.StringIO) as output:
                self.assertEqual(main(["--bucket", BUCKET, "--key", KEY]), 1)
            event = json.loads(output.getvalue())
            self.assertEqual(event["event"], "processing_failed")
            self.assertEqual(event["level"], "ERROR")
            self.assertNotIn("secret", output.getvalue())
            if isinstance(error, ValidationError):
                self.assertIn("reason", event)

    def test_formatter_escapes_newlines(self):
        record = logging.LogRecord("waypost_etl", logging.INFO, "", 0, "event", (), None)
        record.fields = {"rawKey": "one\ntwo"}
        line = JsonFormatter().format(record)
        self.assertEqual(len(line.splitlines()), 1)
        self.assertEqual(json.loads(line)["rawKey"], "one\ntwo")


if __name__ == "__main__":
    unittest.main()
