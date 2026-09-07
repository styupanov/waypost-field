"""Mount into the built image and run with --network none; no AWS calls."""

import json
import os
from pathlib import Path
import ssl
import subprocess
import sys

import boto3
import dotenv
import psycopg

sys.path.insert(0, "/app/etl")
from waypost_etl import cli, load_cli, secret_database  # noqa: E402,F401

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
for script in ("process_raw.py", "load_processed.py", "verify_loaded.py"):
    result = subprocess.run([sys.executable, f"/app/etl/{script}", "--help"],
                            check=True, capture_output=True, text=True)
    assert "--bucket" in result.stdout and "--key" in result.stdout
subprocess.run([sys.executable, "-m", "pip", "check"], check=True)
print(json.dumps({"event": "container_smoke_passed", "uid": os.getuid(),
                  "gid": os.getgid(), "python": sys.version.split()[0],
                  "caExists": certificate.is_file(), "caCount": context.cert_store_stats()["x509_ca"],
                  "cliHelp": 3, "imports": [boto3.__name__, psycopg.__name__, dotenv.__name__]}))
