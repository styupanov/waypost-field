"""Read-only SQL verification of a loaded processed S3 object."""

import argparse
import json

import psycopg
from psycopg.rows import dict_row

from waypost_etl.database import database_url, DEFAULT_ENV_FILE
from pathlib import Path

VERIFY_SQL = """
SELECT provider, route_index, section_count, distance_meters, duration_seconds,
       base_duration_seconds,
       ST_GeometryType(geometry) AS geometry_type,
       ST_SRID(geometry) AS srid,
       ST_NPoints(geometry) AS coordinate_count,
       ST_IsValid(geometry) AS geometry_valid
FROM public.provider_routing_ingestion
WHERE processed_s3_bucket = %s AND processed_s3_key = %s
ORDER BY route_index
"""


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--bucket", required=True)
    parser.add_argument("--key", required=True)
    parser.add_argument("--target", choices=("local", "rds"), default="local")
    parser.add_argument("--env-file", type=Path, default=DEFAULT_ENV_FILE)
    args = parser.parse_args()
    with psycopg.connect(database_url(args.env_file, target=args.target), row_factory=dict_row) as connection:
        connection.execute("SET TRANSACTION READ ONLY")
        database = connection.execute("SELECT current_database() AS name, current_setting('server_version') AS server_version, (SELECT extversion FROM pg_extension WHERE extname='postgis') AS postgis_version, (SELECT ssl FROM pg_stat_ssl WHERE pid=pg_backend_pid()) AS tls").fetchone()
        rows = connection.execute(VERIFY_SQL, (args.bucket, args.key)).fetchall()
        indexes = connection.execute("SELECT indexname,indexdef FROM pg_indexes WHERE schemaname='public' AND tablename='provider_routing_ingestion'").fetchall()
    print(json.dumps({"event": "loaded_rows_verified", "databaseTarget": args.target, "database": database, "rowCount": len(rows), "rows": rows, "indexes": indexes}))


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(json.dumps({"event": "verification_failed", "errorType": type(error).__name__, "sqlState": getattr(error, "sqlstate", None)}))
        raise SystemExit(1)
