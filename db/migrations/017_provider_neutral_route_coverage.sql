ALTER TABLE public.route_coverage
  DROP CONSTRAINT route_coverage_coverage_source_check;

ALTER TABLE public.route_coverage
  ADD CONSTRAINT route_coverage_coverage_source_check
  CHECK (coverage_source IN ('valhalla_inferred', 'route_geometry_inferred'));
