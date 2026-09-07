"""S3 transport and key mapping, kept separate from provider transformation."""

import json
import logging
import re
from datetime import date

from .errors import ValidationError
from .providers import here

logger = logging.getLogger("waypost_etl")
RAW_KEY = re.compile(r"raw/routing/here/year=(\d{4})/month=(\d{2})/day=(\d{2})/[^/]+\.json")


def processed_key(key: str) -> str:
    match = RAW_KEY.fullmatch(key)
    if not match:
        raise ValidationError("key must match raw/routing/here/year=YYYY/month=MM/day=DD/<name>.json")
    try:
        date(*map(int, match.groups()))
    except ValueError as error:
        raise ValidationError("raw key contains an invalid date partition") from error
    return "processed/" + key.removeprefix("raw/")


def reject_constant(_value: str):
    raise ValidationError("raw object must contain standard JSON without NaN or Infinity")


def unique_object(pairs: list) -> dict:
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValidationError("raw JSON contains duplicate object keys")
        result[key] = value
    return result


def process_object(s3, bucket: str, key: str) -> str:
    """Read once, validate fully, then put once in the same bucket; never alter raw."""
    destination = processed_key(key)
    context = {"bucket": bucket, "rawKey": key, "processedKey": destination}
    logger.info("processing_started", extra={"fields": context})
    response = s3.get_object(Bucket=bucket, Key=key)
    body = response["Body"]
    try:
        try:
            raw = json.loads(body.read().decode("utf-8"), parse_constant=reject_constant, object_pairs_hook=unique_object)
        except (UnicodeDecodeError, json.JSONDecodeError, RecursionError) as error:
            raise ValidationError("raw object must be valid UTF-8 JSON") from error
    finally:
        body.close()
    record = here.transform(raw, bucket, key)
    timestamp = here.fetched_time(raw)
    partition = f"year={timestamp.year:04d}/month={timestamp.month:02d}/day={timestamp.day:02d}"
    if not key.startswith(f"raw/routing/here/{partition}/"):
        raise ValidationError("raw key partition must match the UTC fetchedAt date")
    logger.info("raw_validated", extra={"fields": {**context, "routeCount": record["routeCount"]}})
    s3.put_object(
        Bucket=bucket,
        Key=destination,
        ContentType="application/json",
        Body=json.dumps(record, allow_nan=False, separators=(",", ":"), sort_keys=True).encode("utf-8"),
    )
    logger.info("processed_written", extra={"fields": context})
    return destination
