"""HERE routing analytics and canonical 2D WGS84 geometry."""

import math
import re
from datetime import datetime, timezone

from ..errors import ValidationError
from .flexible_polyline import decode_flexible_polyline, concatenate_section_coordinates

PROCESSED_SCHEMA_VERSION = 2
TRANSFORMATION_VERSION = "2.0.0"

TIMESTAMP = re.compile(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})")
METRICS = {"distanceMeters": "length", "durationSeconds": "duration", "baseDurationSeconds": "baseDuration"}


def fetched_time(raw: dict) -> datetime:
    value = raw.get("fetchedAt")
    if not isinstance(value, str) or not TIMESTAMP.fullmatch(value):
        raise ValidationError("fetchedAt must be a timezone-aware RFC3339 timestamp")
    # datetime accepts overflowing offset minutes; reject them explicitly.
    if value[-1] != "Z" and (int(value[-5:-3]) > 23 or int(value[-2:]) > 59):
        raise ValidationError("fetchedAt contains an invalid UTC offset")
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00")).astimezone(timezone.utc)
    except (ValueError, OverflowError) as error:
        raise ValidationError("fetchedAt contains an invalid date or time") from error


def validate_wrapper(raw: object) -> datetime:
    if not isinstance(raw, dict):
        raise ValidationError("raw wrapper must be an object")
    if type(raw.get("schemaVersion")) is not int or raw["schemaVersion"] != 1:
        raise ValidationError("schemaVersion must be the supported integer version 1")
    if raw.get("provider") != "here":
        raise ValidationError("provider must be here")
    if raw.get("domain") != "routing":
        raise ValidationError("domain must be routing")
    timestamp = fetched_time(raw)
    payload = raw.get("payload")
    if not isinstance(payload, dict) or not isinstance(payload.get("routes"), list) or not payload["routes"]:
        raise ValidationError("payload.routes must be a nonempty array")
    return timestamp


def summarize_route(route: object, index: int) -> dict:
    path = f"payload.routes[{index}]"
    if not isinstance(route, dict):
        raise ValidationError(f"{path} must be an object")
    sections = route.get("sections")
    if not isinstance(sections, list) or not sections:
        raise ValidationError(f"{path}.sections must be a nonempty array")
    values = {name: [] for name in METRICS}
    decoded_sections = []
    for section_index, section in enumerate(sections):
        section_path = f"{path}.sections[{section_index}]"
        if not isinstance(section, dict):
            raise ValidationError(f"{section_path} must be an object")
        try:
            coordinates = decode_flexible_polyline(section.get("polyline"))
            if len(coordinates) < 2:
                raise ValidationError("section must contain at least two positions")
        except ValidationError as error:
            raise ValidationError(f"{section_path}.polyline: {error}") from error
        decoded_sections.append(coordinates)
        summary = section.get("summary", {})
        if not isinstance(summary, dict):
            raise ValidationError(f"{section_path}.summary must be an object when present")
        for name, source in METRICS.items():
            value = summary.get(source)
            if value is None:
                continue
            if type(value) not in (int, float) or value < 0 or (isinstance(value, float) and not math.isfinite(value)):
                raise ValidationError(f"{section_path}.summary.{source} must be a finite nonnegative number or null")
            values[name].append(value)

    totals = {}
    for name, numbers in values.items():
        # Never label a partial section sum as a full route total.
        try:
            total = sum(numbers) if len(numbers) == len(sections) else None
        except OverflowError as error:
            raise ValidationError(f"{path} summary total overflow") from error
        if isinstance(total, float) and not math.isfinite(total):
            raise ValidationError(f"{path} summary total overflow")
        totals[name] = total
    coordinates = concatenate_section_coordinates(decoded_sections)
    if len(coordinates) < 2:
        raise ValidationError(f"{path} geometry must contain at least two distinct consecutive positions")
    return {
        "routeIndex": index,
        "geometry": {"type": "LineString", "coordinates": coordinates},
        "sectionCount": len(sections),
        "summary": totals,
        "summarySectionCounts": {name: len(numbers) for name, numbers in values.items()},
    }


def transform(raw: object, bucket: str, key: str, *, processed_at: datetime | None = None) -> dict:
    validate_wrapper(raw)
    routes = [summarize_route(route, index) for index, route in enumerate(raw["payload"]["routes"])]
    processed_at = processed_at or datetime.now(timezone.utc)
    if processed_at.tzinfo is None or processed_at.utcoffset() is None:
        raise ValidationError("processedAt must be timezone-aware")
    return {
        "schemaVersion": PROCESSED_SCHEMA_VERSION,
        "processedAt": processed_at.astimezone(timezone.utc).isoformat().replace("+00:00", "Z"),
        "transformation": {"name": "here-routing", "version": TRANSFORMATION_VERSION},
        "geometryCrs": "EPSG:4326",
        "provider": "here",
        "domain": "routing",
        "fetchedAt": raw["fetchedAt"],
        "source": {"bucket": bucket, "key": key, "schemaVersion": raw["schemaVersion"]},
        "routeCount": len(routes),
        "sectionCount": sum(route["sectionCount"] for route in routes),
        "routes": routes,
    }
