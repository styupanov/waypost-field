"""Strict validation of the processed HERE v2 contract before database writes."""

import json
import math
import re

from ..errors import ValidationError
from ..pipeline import processed_key
from .here import fetched_time, METRICS, PROCESSED_SCHEMA_VERSION, TRANSFORMATION_VERSION


def integer(value, path, minimum=0):
    if type(value) is not int or not minimum <= value <= 2_147_483_647:
        raise ValidationError(f"{path} must be an integer in the supported range")
    return value


def bucket_name(value, path):
    if not isinstance(value, str) or not re.fullmatch(r"[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]", value):
        raise ValidationError(f"{path} must be an S3 bucket name")
    return value


def object_key(value, path):
    if not isinstance(value, str) or "\x00" in value or not 1 <= len(value.encode("utf-8")) <= 1024:
        raise ValidationError(f"{path} must be a nonempty S3 key of at most 1024 bytes")
    return value


def timestamp(value, path):
    try:
        return fetched_time({"fetchedAt": value})
    except ValidationError as error:
        raise ValidationError(f"{path} must be a valid timezone-aware timestamp") from error


def geometry_json(value, path):
    if not isinstance(value, dict) or value.get("type") != "LineString" or "crs" in value:
        raise ValidationError(f"{path} must be a GeoJSON LineString without a CRS override")
    points = value.get("coordinates")
    if not isinstance(points, list) or len(points) < 2:
        raise ValidationError(f"{path}.coordinates must contain at least two positions")
    for index, point in enumerate(points):
        if not isinstance(point, list) or len(point) != 2:
            raise ValidationError(f"{path}.coordinates must contain 2D positions")
        for number, limit in zip(point, (180, 90)):
            if type(number) not in (int, float) or not -limit <= number <= limit:
                raise ValidationError(f"{path}.coordinates must be finite WGS84 longitude/latitude")
        if index and point == points[index - 1]:
            raise ValidationError(f"{path}.coordinates contains a consecutive duplicate")
    return json.dumps({"type": "LineString", "coordinates": points}, allow_nan=False, separators=(",", ":"))


def validate_processed(record, bucket, key):
    """Return parameter dictionaries only after the entire object validates."""
    bucket_name(bucket, "processed bucket")
    object_key(key, "processed key")
    if not isinstance(record, dict):
        raise ValidationError("processed wrapper must be an object")
    if integer(record.get("schemaVersion"), "schemaVersion") != PROCESSED_SCHEMA_VERSION:
        raise ValidationError("unsupported processed schemaVersion")
    if record.get("provider") != "here" or record.get("domain") != "routing":
        raise ValidationError("provider/domain must be here/routing")
    transformation = record.get("transformation")
    if not isinstance(transformation, dict) or transformation.get("name") != "here-routing" or transformation.get("version") != TRANSFORMATION_VERSION:
        raise ValidationError("unsupported transformation name/version")
    if record.get("geometryCrs") != "EPSG:4326":
        raise ValidationError("geometryCrs must be EPSG:4326")
    source = record.get("source")
    if not isinstance(source, dict) or integer(source.get("schemaVersion"), "source.schemaVersion") != 1:
        raise ValidationError("source must identify raw schemaVersion 1")
    raw_bucket = bucket_name(source.get("bucket"), "source.bucket")
    raw_key = object_key(source.get("key"), "source.key")
    if processed_key(raw_key) != key:
        raise ValidationError("processed key must correspond to source.key")
    fetched_at = timestamp(record.get("fetchedAt"), "fetchedAt")
    processed_at = timestamp(record.get("processedAt"), "processedAt")
    partition = f"year={fetched_at.year:04d}/month={fetched_at.month:02d}/day={fetched_at.day:02d}"
    if not raw_key.startswith(f"raw/routing/here/{partition}/"):
        raise ValidationError("source.key partition must match fetchedAt UTC date")
    routes = record.get("routes")
    if not isinstance(routes, list) or not routes or integer(record.get("routeCount"), "routeCount", 1) != len(routes):
        raise ValidationError("routes must be nonempty and match routeCount")
    rows = []
    for index, route in enumerate(routes):
        path = f"routes[{index}]"
        if not isinstance(route, dict) or integer(route.get("routeIndex"), f"{path}.routeIndex") != index:
            raise ValidationError(f"{path}.routeIndex must match provider order")
        sections = integer(route.get("sectionCount"), f"{path}.sectionCount", 1)
        summary, counts = route.get("summary"), route.get("summarySectionCounts")
        if not isinstance(summary, dict) or not isinstance(counts, dict):
            raise ValidationError(f"{path} must contain summary and summarySectionCounts")
        for metric in METRICS:
            if metric not in summary:
                raise ValidationError(f"{path}.summary.{metric} is required (null allowed)")
            count = integer(counts.get(metric), f"{path}.summarySectionCounts.{metric}")
            value = summary[metric]
            if count > sections or (value is None) != (count < sections):
                raise ValidationError(f"{path}.summary.{metric} completeness is inconsistent")
            if value is not None:
                try:
                    valid = type(value) in (int, float) and math.isfinite(value) and value >= 0
                except OverflowError:
                    valid = False
                if not valid:
                    raise ValidationError(f"{path}.summary.{metric} must be finite and nonnegative")
        rows.append({
            "provider": "here", "domain": "routing", "route_index": index,
            "raw_s3_bucket": raw_bucket, "raw_s3_key": raw_key,
            "processed_s3_bucket": bucket, "processed_s3_key": key,
            "schema_version": PROCESSED_SCHEMA_VERSION, "raw_schema_version": 1,
            "transformation_name": "here-routing", "transformation_version": TRANSFORMATION_VERSION,
            "fetched_at": fetched_at, "processed_at": processed_at, "section_count": sections,
            "distance_meters": summary["distanceMeters"], "duration_seconds": summary["durationSeconds"],
            "base_duration_seconds": summary["baseDurationSeconds"],
            "summary_section_counts": json.dumps({metric: counts[metric] for metric in METRICS}),
            "geometry": geometry_json(route.get("geometry"), f"{path}.geometry"),
        })
    if integer(record.get("sectionCount"), "sectionCount", 1) != sum(row["section_count"] for row in rows):
        raise ValidationError("sectionCount must equal the total route section count")
    return rows
