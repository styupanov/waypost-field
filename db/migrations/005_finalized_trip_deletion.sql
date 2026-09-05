CREATE OR REPLACE FUNCTION public.protect_finalized_trip_version() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' AND pg_trigger_depth() > 1 THEN RETURN OLD; END IF;
  IF OLD.state = 'finalized' THEN
    RAISE EXCEPTION 'finalized trip version is immutable' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.protect_finalized_trip_stops() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE protected_version_id UUID := COALESCE(NEW.trip_version_id, OLD.trip_version_id);
BEGIN
  IF TG_OP = 'DELETE' AND pg_trigger_depth() > 1 THEN RETURN OLD; END IF;
  IF EXISTS (SELECT 1 FROM public.trip_versions WHERE id = protected_version_id AND state = 'finalized') THEN
    RAISE EXCEPTION 'stops of finalized trip version are immutable' USING ERRCODE = '55000';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;
