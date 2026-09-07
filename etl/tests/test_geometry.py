import unittest
from datetime import datetime, timezone

from waypost_etl.errors import ValidationError
from waypost_etl.pipeline import process_object
from waypost_etl.providers.flexible_polyline import decode_flexible_polyline, concatenate_section_coordinates
from waypost_etl.providers.here import transform
from tests.test_etl import BUCKET, KEY, POLYLINE, COORDINATES, fixture, mock_s3


class GeometryTests(unittest.TestCase):
    def test_existing_typescript_reference_and_geojson_order(self):
        self.assertEqual(decode_flexible_polyline(POLYLINE), COORDINATES)
        # Precision-zero independent fixture: latitude 0, longitude 1, then +1/+2.
        self.assertEqual(decode_flexible_polyline("BAACCE"), [[1, 0], [3, 1]])

    def test_third_dimension_is_consumed_and_omitted_like_typescript(self):
        self.assertEqual(decode_flexible_polyline("BQACACCA"), [[1, 0], [2, 1]])
        with self.assertRaises(ValidationError):
            decode_flexible_polyline("BQACACC")  # Missing final third ordinate.

    def test_sections_shared_endpoint_and_interior_duplicates(self):
        raw = fixture()
        raw["payload"]["routes"][0]["sections"][0]["polyline"] = "BAACCE"
        raw["payload"]["routes"][0]["sections"][1]["polyline"] = "BACGCE"
        result = transform(raw, BUCKET, KEY)
        self.assertEqual(result["routes"][0]["geometry"], {"type": "LineString", "coordinates": [[1, 0], [3, 1], [5, 2]]})
        self.assertEqual(result["routes"][1]["geometry"]["coordinates"], COORDINATES)
        self.assertEqual(concatenate_section_coordinates([[[1, 2], [1, 2], [3, 4]], [[3, 4], [5, 6]]]), [[1, 2], [3, 4], [5, 6]])

    def test_nonshared_endpoint_is_preserved(self):
        self.assertEqual(concatenate_section_coordinates([[[1, 2], [3, 4]], [[5, 6], [7, 8]]]), [[1, 2], [3, 4], [5, 6], [7, 8]])

    def test_malformed_geometry_fails_before_write_with_field_path(self):
        for encoded in [None, 12, "", "!", "CA", "B", "BA", "BAA", "BAAA", "BAAAAA", "BA2FAAA", "B" + "_" * 12]:
            raw = fixture()
            raw["payload"]["routes"][0]["sections"][0]["polyline"] = encoded
            # For the collapsed route case, all sections must collapse together.
            raw["payload"]["routes"][0]["sections"] = raw["payload"]["routes"][0]["sections"][:1]
            client, _ = mock_s3(raw)
            with self.subTest(encoded=encoded), self.assertRaisesRegex(ValidationError, r"payload.routes\[0\]"):
                process_object(client, BUCKET, KEY)
            client.put_object.assert_not_called()

    def test_processed_timestamp_is_distinct_from_fetched_and_schema_version(self):
        at = datetime(2026, 9, 7, 1, 2, 3, tzinfo=timezone.utc)
        record = transform(fixture(), BUCKET, KEY, processed_at=at)
        self.assertEqual(record["processedAt"], "2026-09-07T01:02:03Z")
        self.assertEqual(record["fetchedAt"], fixture()["fetchedAt"])
        self.assertEqual(record["source"]["schemaVersion"], 1)
        self.assertEqual(record["schemaVersion"], 2)
        with self.assertRaisesRegex(ValidationError, "processedAt"):
            transform(fixture(), BUCKET, KEY, processed_at=datetime(2026, 9, 7))
