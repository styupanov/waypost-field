CREATE TABLE public.attraction_ai_enrichment (
  attraction_id BIGINT NOT NULL REFERENCES public.attractions(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  prompt_version TEXT NOT NULL,
  content JSONB NOT NULL,
  source_urls JSONB NOT NULL DEFAULT '[]'::jsonb,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (attraction_id, provider, model, prompt_version)
);

CREATE INDEX attraction_ai_enrichment_expiry_ix
  ON public.attraction_ai_enrichment (expires_at);
