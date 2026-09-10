"""Processed HERE v2 to deterministic route-level GeoParquet."""

import io
import json
import logging
import re
from datetime import date

import pyarrow as pa
import pyarrow.parquet as pq
from shapely import from_geojson, to_wkb

from .errors import ValidationError
from .pipeline import reject_constant, unique_object
from .providers.processed_here import validate_processed

logger = logging.getLogger("waypost_etl")

ANALYTICS_SCHEMA_VERSION = 1
GEOPARQUET_VERSION = "1.1.0"
PROCESSED_KEY = re.compile(
    r"processed/routing/here/year=(\d{4})/month=(\d{2})/day=(\d{2})/([^/]+)\.json"
)

# GeoParquet requires a PROJJSON object when CRS is explicit. This compact object identifies
# the authoritative EPSG definition without adding a pyproj runtime dependency.
EPSG_4326 = {
    "$schema": "https://proj.org/schemas/v0.7/projjson.schema.json",
    "type": "GeographicCRS",
    "name": "WGS 84",
    "datum_ensemble": {
        "name": "World Geodetic System 1984 ensemble",
        "members": [
            {"name": "World Geodetic System 1984 (Transit)", "id": {"authority": "EPSG", "code": 1166}},
            {"name": "World Geodetic System 1984 (G730)", "id": {"authority": "EPSG", "code": 1152}},
            {"name": "World Geodetic System 1984 (G873)", "id": {"authority": "EPSG", "code": 1153}},
            {"name": "World Geodetic System 1984 (G1150)", "id": {"authority": "EPSG", "code": 1154}},
            {"name": "World Geodetic System 1984 (G1674)", "id": {"authority": "EPSG", "code": 1155}},
            {"name": "World Geodetic System 1984 (G1762)", "id": {"authority": "EPSG", "code": 1156}},
            {"name": "World Geodetic System 1984 (G2139)", "id": {"authority": "EPSG", "code": 1309}},
            {"name": "World Geodetic System 1984 (G2296)", "id": {"authority": "EPSG", "code": 1383}},
        ],
        "ellipsoid": {
            "name": "WGS 84", "semi_major_axis": 6378137,
            "inverse_flattening": 298.257223563,
        },
        "accuracy": "2.0",
        "id": {"authority": "EPSG", "code": 6326},
    },
    "coordinate_system": {
        "subtype": "ellipsoidal",
        "axis": [
            {"name": "Geodetic latitude", "abbreviation": "Lat", "direction": "north", "unit": "degree"},
            {"name": "Geodetic longitude", "abbreviation": "Lon", "direction": "east", "unit": "degree"},
        ],
    },
    "scope": "Horizontal component of 3D system.",
    "area": "World.",
    "bbox": {
        "south_latitude": -90,
        "west_longitude": -180,
        "north_latitude": 90,
        "east_longitude": 180,
    },
    "id": {"authority": "EPSG", "code": 4326},
}

SCHEMA = pa.schema([
    pa.field("analytics_schema_version", pa.int16(), nullable=False),
    pa.field("provider", pa.string(), nullable=False),
    pa.field("route_index", pa.int32(), nullable=False),
    pa.field("fetched_at", pa.timestamp("us", tz="UTC"), nullable=False),
    pa.field("processed_at", pa.timestamp("us", tz="UTC"), nullable=False),
    pa.field("transform_version", pa.string(), nullable=False),
    pa.field("section_count", pa.int32(), nullable=False),
    pa.field("distance_meters", pa.int64()),
    pa.field("duration_seconds", pa.int64()),
    pa.field("base_duration_seconds", pa.int64()),
    pa.field("raw_s3_bucket", pa.string(), nullable=False),
    pa.field("raw_s3_key", pa.string(), nullable=False),
    pa.field("processed_s3_bucket", pa.string(), nullable=False),
    pa.field("processed_s3_key", pa.string(), nullable=False),
    pa.field("geometry", pa.binary(), nullable=False),
])


def analytics_key(processed_key: str) -> str:
    match = PROCESSED_KEY.fullmatch(processed_key)
    if not match:
        raise ValidationError(
            "key must match processed/routing/here/year=YYYY/month=MM/day=DD/<name>.json"
        )
    year, month, day, name = match.groups()
    try:
        date(int(year), int(month), int(day))
    except ValueError as error:
        raise ValidationError("processed key contains an invalid date partition") from error
    partition = f"year={year}/month={month}/day={day}"
    return f"analytics/routing/routes/{partition}/{name}.parquet"


def _integer_metric(value, path):
    if value is None:
        return None
    if type(value) not in (int, float) or int(value) != value:
        raise ValidationError(f"{path} must be an integer for route analytics")
    return int(value)


def build_geoparquet(record, bucket: str, key: str) -> tuple[bytes, int]:
    rows = validate_processed(record, bucket, key)
    analytics_key(key)
    return _build_geoparquet(rows, key)


def _build_geoparquet(rows, key: str) -> tuple[bytes, int]:
    values = []
    for row in rows:
        geometry = from_geojson(row["geometry"])
        if geometry.geom_type != "LineString" or geometry.is_empty or not geometry.is_valid:
            raise ValidationError(f"routes[{row['route_index']}].geometry must be a valid LineString")
        values.append({
            "analytics_schema_version": ANALYTICS_SCHEMA_VERSION,
            "provider": row["provider"],
            "route_index": row["route_index"],
            "fetched_at": row["fetched_at"],
            "processed_at": row["processed_at"],
            "transform_version": row["transformation_version"],
            "section_count": row["section_count"],
            "distance_meters": _integer_metric(row["distance_meters"], "distance_meters"),
            "duration_seconds": _integer_metric(row["duration_seconds"], "duration_seconds"),
            "base_duration_seconds": _integer_metric(row["base_duration_seconds"], "base_duration_seconds"),
            "raw_s3_bucket": row["raw_s3_bucket"],
            "raw_s3_key": row["raw_s3_key"],
            "processed_s3_bucket": row["processed_s3_bucket"],
            "processed_s3_key": row["processed_s3_key"],
            "geometry": to_wkb(geometry, byte_order=1, output_dimension=2),
        })
    geo = {
        "version": GEOPARQUET_VERSION,
        "primary_column": "geometry",
        "columns": {
            "geometry": {
                "encoding": "WKB",
                "geometry_types": ["LineString"],
                "crs": EPSG_4326,
            }
        },
    }
    metadata = {
        b"geo": json.dumps(geo, separators=(",", ":"), sort_keys=True).encode(),
        b"waypost:analytics_schema_version": str(ANALYTICS_SCHEMA_VERSION).encode(),
        b"waypost:source_processed_key": key.encode(),
    }
    table = pa.Table.from_pylist(values, schema=SCHEMA.with_metadata(metadata))
    output = io.BytesIO()
    pq.write_table(table, output, compression="zstd", version="2.6")
    return output.getvalue(), len(values)


def write_route_analytics(s3, bucket: str, key: str) -> tuple[str, int, int]:
    destination = analytics_key(key)
    context = {"bucket": bucket, "processedKey": key, "analyticsKey": destination}
    logger.info("analytics_started", extra={"fields": context})
    response = s3.get_object(Bucket=bucket, Key=key)
    body = response["Body"]
    try:
        try:
            record = json.loads(
                body.read().decode("utf-8"), object_pairs_hook=unique_object,
                parse_constant=reject_constant,
            )
        except (ValueError, UnicodeError, RecursionError) as error:
            raise ValidationError(
                "processed object must be valid UTF-8 JSON with unique keys and finite values"
            ) from error
    finally:
        body.close()
    rows = validate_processed(record, bucket, key)
    route_count = len(rows)
    logger.info("processed_validated", extra={"fields": {**context, "routeCount": route_count}})
    parquet, _ = _build_geoparquet(rows, key)
    logger.info(
        "parquet_built",
        extra={"fields": {**context, "routeCount": route_count, "byteCount": len(parquet)}},
    )
    s3.put_object(
        Bucket=bucket, Key=destination, Body=parquet,
        ContentType="application/vnd.apache.parquet",
    )
    logger.info("analytics_written", extra={"fields": {**context, "routeCount": route_count}})
    return destination, route_count, len(parquet)
