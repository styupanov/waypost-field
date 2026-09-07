"""Single-object CLI with JSON-line logs on stderr; no .env.local loading."""

import argparse
import json
import logging
import os
import traceback
from contextlib import closing
from datetime import datetime, timezone
from pathlib import Path

import boto3
from botocore.config import Config
from botocore.exceptions import ClientError

from .errors import ValidationError
from .pipeline import process_object


class JsonFormatter(logging.Formatter):
    def format(self, record):
        return json.dumps({
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "level": record.levelname,
            "event": record.getMessage(),
            **getattr(record, "fields", {}),
        })


def configure_logging():
    logger = logging.getLogger("waypost_etl")
    handler = logging.StreamHandler()
    handler.setFormatter(JsonFormatter())
    logger.handlers = [handler]
    logger.setLevel(logging.INFO)
    logger.propagate = False
    return logger


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description="Validate and process one raw HERE S3 object into the same bucket.")
    parser.add_argument("--bucket", required=True)
    parser.add_argument("--key", required=True, help="raw/routing/here/year=YYYY/month=MM/day=DD/<name>.json")
    parser.add_argument("--region", default=os.environ.get("AWS_REGION") or os.environ.get("AWS_DEFAULT_REGION"), help="AWS region; otherwise use environment/shared AWS config")
    parser.add_argument("--debug", action="store_true", help="Include safe traceback locations on failure (no exception text, source lines, or local variables)")
    args = parser.parse_args(argv)
    logger = configure_logging()
    try:
        # Default boto3 credential chain: AWS_PROFILE/SSO locally, IAM roles later.
        with closing(boto3.client("s3", region_name=args.region, config=Config(connect_timeout=10, read_timeout=30, retries={"mode": "standard", "total_max_attempts": 3}))) as s3:
            process_object(s3, args.bucket, args.key)
    except Exception as error:
        fields = {"bucket": args.bucket, "rawKey": args.key, "errorType": type(error).__name__}
        if isinstance(error, ValidationError):
            fields["reason"] = str(error)
        elif isinstance(error, ClientError):
            fields["awsErrorCode"] = error.response.get("Error", {}).get("Code", "Unknown")
        if args.debug:
            # Trace locations are useful for diagnosis without serializing values or
            # arbitrary exception messages, which can embed credentials/response data.
            fields["traceback"] = [
                {"file": Path(frame.f_code.co_filename).name, "line": line, "function": frame.f_code.co_name}
                for frame, line in traceback.walk_tb(error.__traceback__)
            ]
        # Never log payloads, credentials, SDK error messages, or request URLs.
        logger.error("processing_failed", extra={"fields": fields})
        return 1
    return 0
