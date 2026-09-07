-- PostGIS is already installed in the project's local database.
-- Provider-derived analytics: deliberately not linked to application trip state.
CREATE TABLE public.provider_routing_ingestion (
  provider TEXT NOT NULL CHECK (provider = 'here'),
  domain TEXT NOT NULL CHECK (domain = 'routing'),
  raw_s3_bucket TEXT NOT NULL CHECK (octet_length(raw_s3_bucket) BETWEEN 3 AND 63),
  raw_s3_key TEXT NOT NULL CHECK (octet_length(raw_s3_key) BETWEEN 1 AND 1024 AND raw_s3_key LIKE 'raw/routing/here/%'),
  route_index INTEGER NOT NULL CHECK (route_index >= 0),
  processed_s3_bucket TEXT NOT NULL CHECK (octet_length(processed_s3_bucket) BETWEEN 3 AND 63),
  processed_s3_key TEXT NOT NULL CHECK (octet_length(processed_s3_key) BETWEEN 1 AND 1024 AND processed_s3_key LIKE 'processed/routing/here/%'),
  schema_version INTEGER NOT NULL CHECK (schema_version = 2),
  raw_schema_version INTEGER NOT NULL CHECK (raw_schema_version = 1),
  transformation_name TEXT NOT NULL CHECK (transformation_name = 'here-routing'),
  transformation_version TEXT NOT NULL CHECK (transformation_version = '2.0.0'),
  fetched_at TIMESTAMPTZ NOT NULL CHECK (isfinite(fetched_at)),
  processed_at TIMESTAMPTZ NOT NULL CHECK (isfinite(processed_at)),
  section_count INTEGER NOT NULL CHECK (section_count > 0),
  distance_meters DOUBLE PRECISION CHECK (distance_meters >= 0 AND distance_meters < 'Infinity'::float8),
  duration_seconds DOUBLE PRECISION CHECK (duration_seconds >= 0 AND duration_seconds < 'Infinity'::float8),
  base_duration_seconds DOUBLE PRECISION CHECK (base_duration_seconds >= 0 AND base_duration_seconds < 'Infinity'::float8),
  summary_section_counts JSONB NOT NULL CHECK (jsonb_typeof(summary_section_counts) = 'object'),
  geometry geometry(LineString, 4326) NOT NULL,
  loaded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (provider, raw_s3_bucket, raw_s3_key, route_index),
  CONSTRAINT provider_routing_ingestion_geometry_check CHECK (
    NOT ST_IsEmpty(geometry) AND ST_NPoints(geometry) >= 2 AND ST_IsValid(geometry)
    AND ST_XMin(Box3D(geometry)) >= -180 AND ST_XMax(Box3D(geometry)) <= 180
    AND ST_YMin(Box3D(geometry)) >= -90 AND ST_YMax(Box3D(geometry)) <= 90
  )
);

CREATE INDEX provider_routing_ingestion_geometry_gix
  ON public.provider_routing_ingestion USING GIST (geometry);

COMMENT ON TABLE public.provider_routing_ingestion IS
  'Rebuildable provider-controlled analytics from S3 processed HERE v2, not operational trip state. Provider retention requirements still apply.';
