CREATE TABLE public.attraction_h3_cells (
  h3_resolution SMALLINT NOT NULL,
  h3_index TEXT NOT NULL,
  total_attraction_count INTEGER NOT NULL,
  center_geom geometry(Point, 4326) NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (h3_resolution, h3_index),
  CONSTRAINT attraction_h3_cells_resolution_check CHECK (h3_resolution BETWEEN 5 AND 10),
  CONSTRAINT attraction_h3_cells_count_check CHECK (total_attraction_count > 0)
);

CREATE INDEX attraction_h3_cells_center_gix ON public.attraction_h3_cells USING GIST (center_geom);

COMMENT ON TABLE public.attraction_h3_cells IS
  'Rebuildable sparse viewport index derived with attraction_h3_category_aggregates from source_group=attractions.';
