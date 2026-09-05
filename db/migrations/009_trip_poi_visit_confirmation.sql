CREATE TABLE public.trip_poi_visit_confirmations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  trip_version_id UUID NOT NULL REFERENCES public.trip_versions(id) ON DELETE CASCADE,
  trip_stop_id UUID NOT NULL REFERENCES public.trip_stops(id) ON DELETE CASCADE,
  attraction_id BIGINT NULL REFERENCES public.attractions(id),
  outcome TEXT NOT NULL CHECK (outcome IN ('visited', 'not_visited')),
  confirmed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT trip_poi_visit_confirmations_version_stop_unique UNIQUE (trip_version_id, trip_stop_id)
);

CREATE INDEX trip_poi_visit_confirmations_user_idx
  ON public.trip_poi_visit_confirmations (user_id);

CREATE INDEX trip_poi_visit_confirmations_version_idx
  ON public.trip_poi_visit_confirmations (trip_version_id);
