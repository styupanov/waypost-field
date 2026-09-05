-- Replace <version-id>. position is the current trip_stops ordering column.
SELECT
    c.id,
    c.user_id,
    c.trip_version_id,
    c.trip_stop_id,
    c.attraction_id,
    c.outcome,
    c.confirmed_at,
    s.position,
    s.stop_type,
    s.name_snapshot,
    s.label,
    s.source
FROM trip_poi_visit_confirmations c
JOIN trip_stops s
  ON s.id = c.trip_stop_id
WHERE c.trip_version_id = '<version-id>'
ORDER BY s.position;

SELECT COUNT(*)
FROM trip_poi_visit_confirmations
WHERE trip_version_id = '<version-id>';
