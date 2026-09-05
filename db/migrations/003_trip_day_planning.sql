ALTER TABLE public.trip_versions
  ADD COLUMN day_planning_metadata JSONB NOT NULL DEFAULT '[]'::jsonb;
