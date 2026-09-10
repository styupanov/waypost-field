"""Mount into the built image and run with --network none; no AWS calls."""

import json
import os
from pathlib import Path
import ssl
import subprocess
import sys

import boto3
import dotenv
import pyarrow
import pyarrow.parquet as pq
import psycopg
import shapely

sys.path.insert(0, "/app/etl")
from waypost_etl import cli, load_cli, secret_database  # noqa: E402,F401
from waypost_etl.route_analytics import build_geoparquet  # noqa: E402

assert os.getuid() == 10001 and os.getgid() == 10001
assert not any(name in os.environ for name in (
    "AWS_PROFILE", "AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "AWS_SESSION_TOKEN",
    "DATABASE_URL", "RDS_DATABASE_URL",
))
assert not list(Path("/app").rglob(".env*"))
assert not Path("/app/etl/.venv").exists()
assert not Path("/app/etl/tests").exists()
certificate = Path("/app/certs/global-bundle.pem")
context = ssl.create_default_context(cafile=str(certificate))
assert context.check_hostname and context.verify_mode == ssl.CERT_REQUIRED
assert context.cert_store_stats()["x509_ca"] > 0
for script in ("process_raw.py", "load_processed.py", "verify_loaded.py", "write_route_parquet.py"):
    result = subprocess.run([sys.executable, f"/app/etl/{script}", "--help"],
                            check=True, capture_output=True, text=True)
    assert "--bucket" in result.stdout and "--key" in result.stdout
raw_key = "raw/routing/here/year=2026/month=09/day=06/source.json"
processed_key = raw_key.replace("raw/", "processed/", 1)
record = {
    "schemaVersion": 2, "provider": "here", "domain": "routing",
    "fetchedAt": "2026-09-06T12:00:00Z", "processedAt": "2026-09-06T12:01:00Z",
    "transformation": {"name": "here-routing", "version": "2.0.0"},
    "geometryCrs": "EPSG:4326",
    "source": {"bucket": "test-bucket", "key": raw_key, "schemaVersion": 1},
    "routeCount": 1, "sectionCount": 1,
    "routes": [{"routeIndex": 0, "sectionCount": 1,
                "summary": {"distanceMeters": 10, "durationSeconds": 2,
                            "baseDurationSeconds": 2},
                "summarySectionCounts": {"distanceMeters": 1, "durationSeconds": 1,
                                         "baseDurationSeconds": 1},
                "geometry": {"type": "LineString", "coordinates": [[-77, 38], [-76, 39]]}}],
}
parquet_bytes, route_count = build_geoparquet(record, "test-bucket", processed_key)
table = pq.read_table(pyarrow.BufferReader(parquet_bytes))
assert route_count == table.num_rows == 1
assert shapely.from_wkb(table.column("geometry")[0].as_py()).geom_type == "LineString"
assert json.loads(table.schema.metadata[b"geo"])["columns"]["geometry"]["crs"]["id"]["code"] == 4326
subprocess.run([sys.executable, "-m", "pip", "check"], check=True)
print(json.dumps({"event": "container_smoke_passed", "uid": os.getuid(),
                  "gid": os.getgid(), "python": sys.version.split()[0],
                  "caExists": certificate.is_file(), "caCount": context.cert_store_stats()["x509_ca"],
                  "cliHelp": 4, "imports": [boto3.__name__, psycopg.__name__, dotenv.__name__,
                                             pyarrow.__name__, shapely.__name__]}))
