ALTER TABLE public.trips
  DROP CONSTRAINT trips_status_check,
  DROP CONSTRAINT trips_execution_timestamps_check;

ALTER TABLE public.trips
  ADD COLUMN travel_confirmation_at TIMESTAMPTZ NULL,
  ADD CONSTRAINT trips_status_check CHECK (
    status IN (
      'draft',
      'planned',
      'active',
      'completed_unconfirmed',
      'traveled',
      'not_traveled'
    )
  ),
  ADD CONSTRAINT trips_execution_timestamps_check CHECK (
    (status IN ('draft', 'planned') AND started_at IS NULL AND ended_at IS NULL AND travel_confirmation_at IS NULL)
    OR (status = 'active' AND started_at IS NOT NULL AND ended_at IS NULL AND travel_confirmation_at IS NULL)
    OR (status = 'completed_unconfirmed' AND started_at IS NOT NULL AND ended_at IS NOT NULL AND travel_confirmation_at IS NULL)
    OR (status IN ('traveled', 'not_traveled') AND started_at IS NOT NULL AND ended_at IS NOT NULL AND travel_confirmation_at IS NOT NULL)
  );
