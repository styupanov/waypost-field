ALTER TABLE public.attraction_h3_category_aggregates
  DROP CONSTRAINT attraction_h3_aggregates_resolution_check,
  ADD CONSTRAINT attraction_h3_aggregates_resolution_check
    CHECK (h3_resolution BETWEEN 4 AND 10);

ALTER TABLE public.attraction_h3_cells
  DROP CONSTRAINT attraction_h3_cells_resolution_check,
  ADD CONSTRAINT attraction_h3_cells_resolution_check
    CHECK (h3_resolution BETWEEN 4 AND 10);
