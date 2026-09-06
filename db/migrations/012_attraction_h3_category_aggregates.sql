CREATE TABLE public.attraction_h3_category_aggregates (
  h3_resolution SMALLINT NOT NULL,
  h3_index TEXT NOT NULL,
  source_category TEXT NOT NULL,
  attraction_count INTEGER NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (h3_resolution, h3_index, source_category),
  CONSTRAINT attraction_h3_aggregates_resolution_check CHECK (h3_resolution BETWEEN 5 AND 10),
  CONSTRAINT attraction_h3_aggregates_count_check CHECK (attraction_count > 0)
);

COMMENT ON TABLE public.attraction_h3_category_aggregates IS
  'Rebuildable global read model derived from public.attractions rows where source_group=attractions.';
