CREATE TABLE public.trip_credit_accounts (
  user_id UUID PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  balance INTEGER NOT NULL DEFAULT 0 CHECK (balance >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.trip_credit_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL CHECK (amount <> 0),
  entry_type TEXT NOT NULL CHECK (entry_type IN ('welcome_grant', 'trip_finalization')),
  trip_version_id UUID NULL REFERENCES public.trip_versions(id) ON DELETE CASCADE,
  idempotency_key TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT trip_credit_ledger_reference_check CHECK (
    (entry_type = 'welcome_grant' AND amount > 0 AND trip_version_id IS NULL)
    OR (entry_type = 'trip_finalization' AND amount < 0 AND trip_version_id IS NOT NULL)
  )
);

CREATE INDEX trip_credit_ledger_user_created_idx ON public.trip_credit_ledger (user_id, created_at);
CREATE UNIQUE INDEX trip_credit_ledger_finalization_version_unique
  ON public.trip_credit_ledger (trip_version_id)
  WHERE entry_type = 'trip_finalization';

INSERT INTO public.trip_credit_accounts (user_id, balance)
SELECT id, 1 FROM public.users
ON CONFLICT (user_id) DO NOTHING;

INSERT INTO public.trip_credit_ledger (user_id, amount, entry_type, idempotency_key)
SELECT id, 1, 'welcome_grant', 'welcome:' || id::text FROM public.users
ON CONFLICT (idempotency_key) DO NOTHING;

CREATE FUNCTION public.protect_trip_credit_ledger() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' AND pg_trigger_depth() > 1 THEN RETURN OLD; END IF;
  RAISE EXCEPTION 'trip credit ledger is immutable' USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER trip_credit_ledger_immutable
BEFORE UPDATE OR DELETE ON public.trip_credit_ledger
FOR EACH ROW EXECUTE FUNCTION public.protect_trip_credit_ledger();
