-- Replace :trip_id in your SQL client with the owned trip UUID being inspected.
SELECT id, status, current_version_id, created_at, updated_at
FROM public.trips WHERE id = :trip_id;

SELECT id, trip_id, version_no, state, routing_engine, finalization_provider,
       finalized_at, created_at, updated_at, ST_GeometryType(route_geom) AS draft_geom_type,
       ST_SRID(route_geom) AS draft_geom_srid
FROM public.trip_versions WHERE trip_id = :trip_id ORDER BY version_no;

SELECT position, stop_type, source, attraction_id, settlement_geoname_id,
       night_index, label, ST_X(geom) AS longitude, ST_Y(geom) AS latitude
FROM public.trip_stops
WHERE trip_version_id = (SELECT current_version_id FROM public.trips WHERE id = :trip_id)
ORDER BY position;

SELECT provider, distance_meters, duration_seconds, base_duration_seconds,
       waypoint_count, section_count, fetched_at, expires_at,
       ST_GeometryType(route_geom) AS cache_geom_type, ST_SRID(route_geom) AS cache_geom_srid
FROM public.provider_route_cache
WHERE trip_version_id = (SELECT current_version_id FROM public.trips WHERE id = :trip_id);
