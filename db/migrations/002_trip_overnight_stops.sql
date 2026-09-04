ALTER TABLE public.trip_stops
  ADD COLUMN settlement_geoname_id BIGINT NULL,
  ADD COLUMN night_index INTEGER NULL,
  ADD COLUMN admin1_snapshot TEXT NULL,
  ADD COLUMN feature_code_snapshot TEXT NULL,
  ADD COLUMN population_snapshot BIGINT NULL,
  ADD COLUMN overnight_metadata JSONB NULL;

ALTER TABLE public.trip_stops DROP CONSTRAINT trip_stops_type_check;
ALTER TABLE public.trip_stops ADD CONSTRAINT trip_stops_type_check
  CHECK (stop_type IN ('origin', 'destination', 'waypoint', 'attraction', 'overnight'));
ALTER TABLE public.trip_stops DROP CONSTRAINT trip_stops_attraction_check;
ALTER TABLE public.trip_stops ADD CONSTRAINT trip_stops_reference_check CHECK (
  (stop_type = 'attraction' AND attraction_id IS NOT NULL AND settlement_geoname_id IS NULL AND night_index IS NULL)
  OR (stop_type = 'overnight' AND attraction_id IS NULL AND settlement_geoname_id IS NOT NULL AND night_index > 0)
  OR (stop_type NOT IN ('attraction', 'overnight') AND attraction_id IS NULL AND settlement_geoname_id IS NULL AND night_index IS NULL)
);
CREATE UNIQUE INDEX trip_stops_version_night_unique ON public.trip_stops (trip_version_id, night_index) WHERE stop_type = 'overnight';
CREATE INDEX trip_stops_settlement_geoname_id_idx ON public.trip_stops (settlement_geoname_id) WHERE settlement_geoname_id IS NOT NULL;
