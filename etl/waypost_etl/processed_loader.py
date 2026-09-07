"""Read-only S3 ingestion and transactional PostGIS upserts."""

import json
import logging

import psycopg

from .errors import ValidationError
from .pipeline import unique_object, reject_constant
from .providers.processed_here import validate_processed

logger = logging.getLogger("waypost_etl")

UPSERT = """
INSERT INTO public.provider_routing_ingestion (
  provider, domain, raw_s3_bucket, raw_s3_key, route_index,
  processed_s3_bucket, processed_s3_key, schema_version, raw_schema_version,
  transformation_name, transformation_version, fetched_at, processed_at,
  section_count, distance_meters, duration_seconds, base_duration_seconds,
  summary_section_counts, geometry
) VALUES (
  %(provider)s, %(domain)s, %(raw_s3_bucket)s, %(raw_s3_key)s, %(route_index)s,
  %(processed_s3_bucket)s, %(processed_s3_key)s, %(schema_version)s, %(raw_schema_version)s,
  %(transformation_name)s, %(transformation_version)s, %(fetched_at)s, %(processed_at)s,
  %(section_count)s, %(distance_meters)s, %(duration_seconds)s, %(base_duration_seconds)s,
  %(summary_section_counts)s::jsonb, ST_SetSRID(ST_GeomFromGeoJSON(%(geometry)s), 4326)
)
ON CONFLICT (provider, raw_s3_bucket, raw_s3_key, route_index) DO UPDATE SET
  domain = EXCLUDED.domain,
  processed_s3_bucket = EXCLUDED.processed_s3_bucket,
  processed_s3_key = EXCLUDED.processed_s3_key,
  schema_version = EXCLUDED.schema_version,
  raw_schema_version = EXCLUDED.raw_schema_version,
  transformation_name = EXCLUDED.transformation_name,
  transformation_version = EXCLUDED.transformation_version,
  fetched_at = EXCLUDED.fetched_at, processed_at = EXCLUDED.processed_at,
  section_count = EXCLUDED.section_count, distance_meters = EXCLUDED.distance_meters,
  duration_seconds = EXCLUDED.duration_seconds, base_duration_seconds = EXCLUDED.base_duration_seconds,
  summary_section_counts = EXCLUDED.summary_section_counts, geometry = EXCLUDED.geometry,
  loaded_at = now()
"""

SOURCE_COUNT = """SELECT count(*) FROM public.provider_routing_ingestion
WHERE provider=%(provider)s AND raw_s3_bucket=%(raw_s3_bucket)s AND raw_s3_key=%(raw_s3_key)s"""


def upsert_routes(connection, rows):
    """All routes commit together; failures roll back the object, including updates."""
    with connection.transaction():
        with connection.cursor() as cursor:
            for row in rows:
                cursor.execute(UPSERT, row)
            cursor.execute(SOURCE_COUNT, rows[0])
            count = cursor.fetchone()[0]
            if count != len(rows):
                raise ValidationError("stored source route count differs; refusing partial source replacement")
    return count


def load_object(s3, bucket, key, database_url, *, connect=None):
    context = {"processedBucket": bucket, "processedKey": key}
    response = s3.get_object(Bucket=bucket, Key=key)
    body = response["Body"]
    try:
        try:
            record = json.loads(body.read().decode("utf-8"), object_pairs_hook=unique_object, parse_constant=reject_constant)
        except (ValueError, UnicodeError, RecursionError) as error:
            raise ValidationError("processed object must be valid UTF-8 JSON with unique keys and finite values") from error
    finally:
        body.close()
    logger.info("processed_object_read", extra={"fields": context})
    rows = validate_processed(record, bucket, key)
    context = {**context, "routeCount": len(rows)}
    logger.info("processed_validated", extra={"fields": context})
    with (connect or psycopg.connect)(database_url, connect_timeout=10, autocommit=True) as connection:
        count = upsert_routes(connection, rows)
    logger.info("db_upsert_committed", extra={"fields": {**context, "rowCount": count}})
    return count
