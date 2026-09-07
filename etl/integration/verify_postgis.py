"""Offline fixture against real local PostGIS. Every test write is rolled back."""

import copy
import json
import sys
from pathlib import Path
from uuid import uuid4

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import psycopg

from tests.test_etl import fixture
from waypost_etl.database import database_url
from waypost_etl.pipeline import processed_key
from waypost_etl.processed_loader import upsert_routes, SOURCE_COUNT
from waypost_etl.providers.here import transform
from waypost_etl.providers.processed_here import validate_processed


def main():
    bucket = "etl-integration-test"
    key = f"raw/routing/here/year=2026/month=09/day=06/integration-{uuid4()}.json"
    rows = validate_processed(transform(fixture(), bucket, key), bucket, processed_key(key))
    with psycopg.connect(database_url(), autocommit=True) as connection:
        with connection.transaction(force_rollback=True):
            assert upsert_routes(connection, rows) == 2
            rows[0]["distance_meters"] = 3210
            assert upsert_routes(connection, rows) == 2
            result = connection.execute("""SELECT distance_meters, ST_GeometryType(geometry), ST_SRID(geometry),
                ST_NPoints(geometry), ST_IsValid(geometry) FROM public.provider_routing_ingestion
                WHERE raw_s3_bucket=%s AND raw_s3_key=%s ORDER BY route_index""", (bucket, key)).fetchall()
            assert result == [(3210.0, "ST_LineString", 4326, 8, True), (500.0, "ST_LineString", 4326, 4, True)]
            broken = copy.deepcopy(rows)
            broken[0]["distance_meters"] = 9999
            broken[1]["geometry"] = '{"type":"Point","coordinates":[0,0]}'
            try:
                upsert_routes(connection, broken)
            except psycopg.Error:
                pass
            else:
                raise AssertionError("PostGIS accepted an invalid geometry type")
            assert connection.execute("SELECT distance_meters FROM public.provider_routing_ingestion WHERE raw_s3_bucket=%s AND raw_s3_key=%s AND route_index=0", (bucket, key)).fetchone()[0] == 3210
            indexes = connection.execute("SELECT indexdef FROM pg_indexes WHERE schemaname='public' AND tablename='provider_routing_ingestion'").fetchall()
            assert any("USING gist (geometry)" in row[0] for row in indexes)
        assert connection.execute(SOURCE_COUNT, rows[0]).fetchone()[0] == 0
    print(json.dumps({"event": "postgis_integration_passed", "upsert": True, "idempotency": True, "geometry": True, "gistIndex": True, "atomicRollback": True, "fixtureRowsRemaining": 0}))


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(json.dumps({"event": "postgis_integration_failed", "errorType": type(error).__name__, "sqlState": getattr(error, "sqlstate", None)}))
        raise SystemExit(1)
