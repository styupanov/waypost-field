CREATE TABLE public.route_coverage (
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  trip_version_id UUID NOT NULL REFERENCES public.trip_versions(id) ON DELETE CASCADE,
  h3_index TEXT NOT NULL,
  h3_resolution SMALLINT NOT NULL CHECK (h3_resolution = 10),
  coverage_source TEXT NOT NULL CHECK (coverage_source = 'valhalla_inferred'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, trip_version_id, h3_index)
);

CREATE INDEX route_coverage_trip_version_idx
  ON public.route_coverage (trip_version_id);

CREATE INDEX route_coverage_user_h3_idx
  ON public.route_coverage (user_id, h3_index);
