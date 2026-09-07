"""S3 processed HERE to explicitly targeted PostGIS; sanitized JSON logs only."""

import argparse
import os
import traceback
from contextlib import closing
from pathlib import Path

import boto3
import psycopg
from botocore.config import Config
from botocore.exceptions import ClientError

from .cli import configure_logging
from .database import database_url, DEFAULT_ENV_FILE
from .errors import ValidationError
from .processed_loader import load_object


def main(argv=None):
    parser = argparse.ArgumentParser(description="Load one S3 processed HERE v2 object into PostgreSQL/PostGIS.")
    parser.add_argument("--bucket", required=True)
    parser.add_argument("--key", required=True)
    parser.add_argument("--target", choices=("local", "rds"), default="local", help="RDS uses separate RDS_DATABASE_URL and verified TLS")
    parser.add_argument("--region", default=os.environ.get("AWS_REGION") or os.environ.get("AWS_DEFAULT_REGION"))
    parser.add_argument("--env-file", type=Path, default=DEFAULT_ENV_FILE, help="Selected DB settings fallback; defaults to repository .env.local")
    parser.add_argument("--debug", action="store_true", help="Safe traceback locations only")
    args = parser.parse_args(argv)
    logger = configure_logging()
    fields = {"processedBucket": args.bucket, "processedKey": args.key, "databaseTarget": args.target}
    try:
        url = database_url(args.env_file, target=args.target)
        with closing(boto3.client("s3", region_name=args.region, config=Config(connect_timeout=10, read_timeout=30, retries={"mode": "standard", "total_max_attempts": 3}))) as s3:
            count = load_object(s3, args.bucket, args.key, url)
        logger.info("load_succeeded", extra={"fields": {**fields, "rowCount": count, "routeCount": count}})
    except Exception as error:
        fields["errorType"] = type(error).__name__
        if isinstance(error, ValidationError):
            fields["reason"] = str(error)
        elif isinstance(error, ClientError):
            fields["awsErrorCode"] = error.response.get("Error", {}).get("Code", "Unknown")
        elif isinstance(error, psycopg.Error):
            fields["sqlState"] = error.sqlstate
        if args.debug:
            fields["traceback"] = [{"file": Path(frame.f_code.co_filename).name, "line": line, "function": frame.f_code.co_name} for frame, line in traceback.walk_tb(error.__traceback__)]
        # Database exceptions may embed SQL parameters, including full geometry or DSNs.
        logger.error("load_failed", extra={"fields": fields})
        return 1
    return 0
