CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE public.users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_subject TEXT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.trips (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id),
  title TEXT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  current_version_id UUID NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT trips_status_check CHECK (status IN ('draft'))
);

CREATE TABLE public.trip_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id UUID NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  version_no INTEGER NOT NULL,
  state TEXT NOT NULL DEFAULT 'draft',
  preferences JSONB NOT NULL,
  route_geom geometry(LineString, 4326) NOT NULL,
  distance_m DOUBLE PRECISION NOT NULL,
  duration_seconds DOUBLE PRECISION NOT NULL,
  has_toll BOOLEAN NOT NULL DEFAULT false,
  has_highway BOOLEAN NOT NULL DEFAULT false,
  has_ferry BOOLEAN NOT NULL DEFAULT false,
  baseline_distance_m DOUBLE PRECISION NOT NULL,
  baseline_duration_seconds DOUBLE PRECISION NOT NULL,
  baseline_has_toll BOOLEAN NOT NULL DEFAULT false,
  baseline_has_highway BOOLEAN NOT NULL DEFAULT false,
  baseline_has_ferry BOOLEAN NOT NULL DEFAULT false,
  driving_detour_seconds DOUBLE PRECISION NOT NULL,
  routing_engine TEXT NOT NULL,
  routing_engine_version TEXT NULL,
  planner_version TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finalized_at TIMESTAMPTZ NULL,
  CONSTRAINT trip_versions_trip_version_unique UNIQUE (trip_id, version_no),
  CONSTRAINT trip_versions_version_no_check CHECK (version_no > 0),
  CONSTRAINT trip_versions_state_check CHECK (state IN ('draft', 'finalized')),
  CONSTRAINT trip_versions_distance_check CHECK (distance_m >= 0),
  CONSTRAINT trip_versions_duration_check CHECK (duration_seconds >= 0),
  CONSTRAINT trip_versions_baseline_distance_check CHECK (baseline_distance_m >= 0),
  CONSTRAINT trip_versions_baseline_duration_check CHECK (baseline_duration_seconds >= 0),
  CONSTRAINT trip_versions_detour_check CHECK (driving_detour_seconds >= 0),
  CONSTRAINT trip_versions_finalized_at_check CHECK (
    (state = 'finalized' AND finalized_at IS NOT NULL)
    OR (state = 'draft' AND finalized_at IS NULL)
  )
);

ALTER TABLE public.trips
  ADD CONSTRAINT trips_current_version_fk
  FOREIGN KEY (current_version_id)
  REFERENCES public.trip_versions(id)
  ON DELETE SET NULL;

CREATE TABLE public.trip_stops (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_version_id UUID NOT NULL REFERENCES public.trip_versions(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  stop_type TEXT NOT NULL,
  source TEXT NOT NULL,
  attraction_id BIGINT NULL REFERENCES public.attractions(id),
  label TEXT NOT NULL,
  geom geometry(Point, 4326) NOT NULL,
  name_snapshot TEXT NULL,
  category_snapshot TEXT NULL,
  metadata_snapshot JSONB NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT trip_stops_version_position_unique UNIQUE (trip_version_id, position),
  CONSTRAINT trip_stops_position_check CHECK (position >= 0),
  CONSTRAINT trip_stops_type_check CHECK (
    stop_type IN ('origin', 'destination', 'waypoint', 'attraction')
  ),
  CONSTRAINT trip_stops_source_check CHECK (source IN ('user', 'waypost')),
  CONSTRAINT trip_stops_attraction_check CHECK (
    (stop_type = 'attraction' AND attraction_id IS NOT NULL)
    OR (stop_type <> 'attraction' AND attraction_id IS NULL)
  )
);

CREATE INDEX trips_user_id_idx ON public.trips (user_id);
CREATE INDEX trip_versions_trip_id_idx ON public.trip_versions (trip_id);
CREATE INDEX trip_versions_route_geom_gix ON public.trip_versions USING GIST (route_geom);
CREATE INDEX trip_stops_trip_version_id_idx ON public.trip_stops (trip_version_id);
CREATE INDEX trip_stops_attraction_id_idx ON public.trip_stops (attraction_id);
CREATE INDEX trip_stops_geom_gix ON public.trip_stops USING GIST (geom);
