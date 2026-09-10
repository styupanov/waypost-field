"""CLI for one processed HERE object to route-level GeoParquet."""

import argparse
import os
import traceback
from contextlib import closing
from pathlib import Path

import boto3
from botocore.config import Config
from botocore.exceptions import ClientError

from .cli import configure_logging
from .errors import ValidationError
from .route_analytics import write_route_analytics


def main(argv=None):
    parser = argparse.ArgumentParser(
        description="Write one processed HERE v2 S3 object as route-level GeoParquet."
    )
    parser.add_argument("--bucket", required=True)
    parser.add_argument("--key", required=True, help="processed/routing/here/year=YYYY/month=MM/day=DD/<name>.json")
    parser.add_argument("--region", default=os.environ.get("AWS_REGION") or os.environ.get("AWS_DEFAULT_REGION"))
    parser.add_argument("--debug", action="store_true", help="Safe traceback locations only")
    args = parser.parse_args(argv)
    logger = configure_logging()
    fields = {"bucket": args.bucket, "processedKey": args.key}
    try:
        with closing(boto3.client(
            "s3", region_name=args.region,
            config=Config(connect_timeout=10, read_timeout=30,
                          retries={"mode": "standard", "total_max_attempts": 3}),
        )) as s3:
            destination, route_count, byte_count = write_route_analytics(
                s3, args.bucket, args.key
            )
        logger.info("analytics_succeeded", extra={"fields": {
            **fields, "analyticsKey": destination, "routeCount": route_count,
            "byteCount": byte_count,
        }})
    except Exception as error:
        fields["errorType"] = type(error).__name__
        if isinstance(error, ValidationError):
            fields["reason"] = str(error)
        elif isinstance(error, ClientError):
            fields["awsErrorCode"] = error.response.get("Error", {}).get("Code", "Unknown")
        if args.debug:
            fields["traceback"] = [
                {"file": Path(frame.f_code.co_filename).name, "line": line,
                 "function": frame.f_code.co_name}
                for frame, line in traceback.walk_tb(error.__traceback__)
            ]
        logger.error("analytics_failed", extra={"fields": fields})
        return 1
    return 0
