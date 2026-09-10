import copy
import io
import json
import unittest
from unittest.mock import Mock, patch

import pyarrow.parquet as pq
from shapely import from_wkb

from tests.test_etl import BUCKET, KEY, fixture
from waypost_etl.errors import ValidationError
from waypost_etl.analytics_cli import main
from waypost_etl.pipeline import processed_key
from waypost_etl.providers.here import transform
from waypost_etl.route_analytics import (
    ANALYTICS_SCHEMA_VERSION,
    analytics_key,
    build_geoparquet,
    write_route_analytics,
)

PROCESSED_KEY = processed_key(KEY)
ANALYTICS_KEY = (
    "analytics/routing/routes/year=2026/month=09/day=06/"
    "2026-09-06T23-03-21.654Z-920f5e8e-8148-4578-94dd-6a8d11295693.parquet"
)


def one_route_processed():
    raw = fixture()
    raw["payload"]["routes"] = raw["payload"]["routes"][:1]
    return transform(raw, BUCKET, KEY)


def read_table(data):
    return pq.read_table(io.BytesIO(data))


class RouteAnalyticsTests(unittest.TestCase):
    def test_one_route_round_trip_schema_metrics_lineage_geometry_and_crs(self):
        record = one_route_processed()
        before = copy.deepcopy(record)
        data, count = build_geoparquet(record, BUCKET, PROCESSED_KEY)
        table = read_table(data)
        self.assertEqual(count, 1)
        self.assertEqual(table.num_rows, 1)
        row = table.to_pylist()[0]
        self.assertEqual(row["analytics_schema_version"], 1)
        self.assertEqual(row["provider"], "here")
        self.assertEqual(row["route_index"], 0)
        self.assertEqual(row["section_count"], 2)
        self.assertEqual(row["distance_meters"], 3000)
        self.assertEqual(row["duration_seconds"], 300)
        self.assertEqual(row["base_duration_seconds"], 270)
        self.assertEqual(row["raw_s3_bucket"], BUCKET)
        self.assertEqual(row["raw_s3_key"], KEY)
        self.assertEqual(row["processed_s3_bucket"], BUCKET)
        self.assertEqual(row["processed_s3_key"], PROCESSED_KEY)
        self.assertEqual(str(table.schema.field("fetched_at").type), "timestamp[us, tz=UTC]")
        self.assertEqual(str(table.schema.field("processed_at").type), "timestamp[us, tz=UTC]")
        geometry = from_wkb(row["geometry"])
        self.assertEqual(geometry.geom_type, "LineString")
        self.assertTrue(geometry.is_valid)
        self.assertEqual(list(geometry.coords)[0], tuple(record["routes"][0]["geometry"]["coordinates"][0]))
        metadata = table.schema.metadata
        geo = json.loads(metadata[b"geo"])
        self.assertEqual(geo["version"], "1.1.0")
        self.assertEqual(geo["primary_column"], "geometry")
        self.assertEqual(geo["columns"]["geometry"]["encoding"], "WKB")
        self.assertEqual(geo["columns"]["geometry"]["geometry_types"], ["LineString"])
        self.assertEqual(geo["columns"]["geometry"]["crs"]["id"], {"authority": "EPSG", "code": 4326})
        self.assertEqual(metadata[b"waypost:analytics_schema_version"], b"1")
        self.assertEqual(record, before)

    def test_multi_route_creates_one_row_per_route_and_preserves_null(self):
        data, count = build_geoparquet(transform(fixture(), BUCKET, KEY), BUCKET, PROCESSED_KEY)
        rows = read_table(data).to_pylist()
        self.assertEqual((count, len(rows)), (2, 2))
        self.assertEqual([row["route_index"] for row in rows], [0, 1])
        self.assertIsNone(rows[1]["base_duration_seconds"])

    def test_key_is_deterministic_and_partitioned_by_fetched_date(self):
        self.assertEqual(analytics_key(PROCESSED_KEY), ANALYTICS_KEY)
        self.assertEqual(analytics_key(PROCESSED_KEY), analytics_key(PROCESSED_KEY))
        for key in [KEY, "processed/routing/here/year=2026/month=09/day=06/x.csv",
                    "processed/routing/here/year=2026/month=13/day=06/x.json",
                    "processed/other.json"]:
            with self.subTest(key=key), self.assertRaises(ValidationError):
                analytics_key(key)

    def test_write_reads_once_and_reruns_to_same_key(self):
        record = one_route_processed()
        client = Mock(spec=["get_object", "put_object"])
        client.get_object.side_effect = [
            {"Body": io.BytesIO(json.dumps(record).encode())},
            {"Body": io.BytesIO(json.dumps(record).encode())},
        ]
        with self.assertLogs("waypost_etl", level="INFO") as logs:
            first = write_route_analytics(client, BUCKET, PROCESSED_KEY)
        second = write_route_analytics(client, BUCKET, PROCESSED_KEY)
        self.assertEqual(first[0], ANALYTICS_KEY)
        self.assertEqual(second[0], first[0])
        self.assertEqual([call.kwargs["Key"] for call in client.put_object.call_args_list], [ANALYTICS_KEY] * 2)
        self.assertTrue(all(call.kwargs["ContentType"] == "application/vnd.apache.parquet" for call in client.put_object.call_args_list))
        self.assertEqual(
            [entry.getMessage() for entry in logs.records],
            ["analytics_started", "processed_validated", "parquet_built", "analytics_written"],
        )

    def test_invalid_processed_input_never_writes(self):
        record = one_route_processed()
        record["geometryCrs"] = "EPSG:3857"
        body = io.BytesIO(json.dumps(record).encode())
        client = Mock(spec=["get_object", "put_object"])
        client.get_object.return_value = {"Body": body}
        with self.assertRaises(ValidationError):
            write_route_analytics(client, BUCKET, PROCESSED_KEY)
        self.assertTrue(body.closed)
        client.put_object.assert_not_called()

    def test_non_integral_analytics_metric_fails(self):
        record = one_route_processed()
        record["routes"][0]["summary"]["distanceMeters"] = 1.5
        with self.assertRaisesRegex(ValidationError, "integer"):
            build_geoparquet(record, BUCKET, PROCESSED_KEY)


class RouteAnalyticsCliTests(unittest.TestCase):
    @patch("waypost_etl.analytics_cli.boto3.client")
    def test_cli_success_uses_default_credential_chain_without_network(self, create_client):
        client = Mock(spec=["close"])
        create_client.return_value = client
        with patch("waypost_etl.analytics_cli.write_route_analytics",
                   return_value=(ANALYTICS_KEY, 1, 100)), \
             patch("sys.stderr", new_callable=io.StringIO) as output:
            self.assertEqual(main(["--bucket", BUCKET, "--key", PROCESSED_KEY]), 0)
        event = json.loads(output.getvalue())
        self.assertEqual(event["event"], "analytics_succeeded")
        self.assertEqual(event["routeCount"], 1)
        create_client.assert_called_once()
        client.close.assert_called_once_with()

    @patch("waypost_etl.analytics_cli.boto3.client")
    def test_cli_invalid_input_is_nonzero_and_sanitized(self, create_client):
        create_client.return_value = Mock(spec=["close"])
        with patch("waypost_etl.analytics_cli.write_route_analytics",
                   side_effect=ValidationError("invalid processed input")), \
             patch("sys.stderr", new_callable=io.StringIO) as output:
            self.assertEqual(main(["--bucket", BUCKET, "--key", PROCESSED_KEY]), 1)
        event = json.loads(output.getvalue())
        self.assertEqual(event["event"], "analytics_failed")
        self.assertEqual(event["reason"], "invalid processed input")
