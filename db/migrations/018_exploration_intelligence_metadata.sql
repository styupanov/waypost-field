CREATE TABLE public.exploration_intelligence_metadata (
  singleton_key SMALLINT PRIMARY KEY DEFAULT 1,
  model_version TEXT NOT NULL,
  built_at TIMESTAMPTZ NOT NULL,
  source_row_count INTEGER NOT NULL,
  accepted_row_count INTEGER NOT NULL,
  CONSTRAINT exploration_intelligence_metadata_singleton_check CHECK (singleton_key = 1),
  CONSTRAINT exploration_intelligence_metadata_source_count_check CHECK (source_row_count >= 0),
  CONSTRAINT exploration_intelligence_metadata_accepted_count_check CHECK (
    accepted_row_count >= 0 AND accepted_row_count <= source_row_count
  )
);

INSERT INTO public.exploration_intelligence_metadata
  (singleton_key, model_version, built_at, source_row_count, accepted_row_count)
VALUES (
  1,
  'legacy',
  now(),
  (SELECT count(*)::integer FROM public.attractions WHERE source_group = 'attractions'),
  COALESCE((
    SELECT sum(attraction_count)::integer
    FROM public.attraction_h3_category_aggregates
    WHERE h3_resolution = 4
  ), 0)
);

COMMENT ON TABLE public.exploration_intelligence_metadata IS
  'Singleton build metadata for the active exploration-intelligence H3 read model.';
