ALTER TABLE public.trips DROP CONSTRAINT trips_status_check;
ALTER TABLE public.trips ADD CONSTRAINT trips_status_check CHECK (status IN ('draft', 'planned'));

ALTER TABLE public.trip_versions
  ADD COLUMN finalization_provider TEXT NULL,
  ADD CONSTRAINT trip_versions_finalization_provider_check CHECK (
    (state = 'draft' AND finalization_provider IS NULL)
    OR (state = 'finalized' AND finalization_provider = 'here')
  );

CREATE TABLE public.provider_route_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_version_id UUID NOT NULL UNIQUE REFERENCES public.trip_versions(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider = 'here'),
  route_geom geometry(LineString, 4326) NOT NULL,
  distance_meters BIGINT NOT NULL CHECK (distance_meters >= 0),
  duration_seconds BIGINT NOT NULL CHECK (duration_seconds >= 0),
  base_duration_seconds BIGINT NULL CHECK (base_duration_seconds >= 0),
  waypoint_count INTEGER NOT NULL CHECK (waypoint_count >= 2),
  section_count INTEGER NOT NULL CHECK (section_count >= 1),
  fetched_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL CHECK (expires_at > fetched_at)
);

CREATE FUNCTION public.protect_finalized_trip_version() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.state = 'finalized' THEN
    RAISE EXCEPTION 'finalized trip version is immutable' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trip_versions_finalized_immutable BEFORE UPDATE OR DELETE ON public.trip_versions
FOR EACH ROW EXECUTE FUNCTION public.protect_finalized_trip_version();

CREATE FUNCTION public.protect_finalized_trip_stops() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE protected_version_id UUID := COALESCE(NEW.trip_version_id, OLD.trip_version_id);
BEGIN
  IF EXISTS (SELECT 1 FROM public.trip_versions WHERE id = protected_version_id AND state = 'finalized') THEN
    RAISE EXCEPTION 'stops of finalized trip version are immutable' USING ERRCODE = '55000';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;
CREATE TRIGGER trip_stops_finalized_immutable BEFORE INSERT OR UPDATE OR DELETE ON public.trip_stops
FOR EACH ROW EXECUTE FUNCTION public.protect_finalized_trip_stops();
