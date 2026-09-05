import "server-only";
import { getPostgresPool } from "../db/postgres.ts";
import type { CoverageViewport } from "../../types/coverage.ts";
import type { VisitedPlace } from "../../types/personal-history.ts";

export async function loadTraveledRoutes(userId: string, bounds: CoverageViewport) {
  const result = await getPostgresPool().query<{ geometry: GeoJSON.LineString }>(
    `SELECT ST_AsGeoJSON(v.route_geom)::json AS geometry
     FROM public.trips t JOIN public.trip_versions v ON v.id=t.current_version_id
     WHERE t.user_id=$1 AND t.status='traveled' AND v.state='finalized'
       AND ST_Intersects(v.route_geom,ST_MakeEnvelope($2,$3,$4,$5,4326))`,
    [userId, bounds.west, bounds.south, bounds.east, bounds.north]
  );
  return result.rows.map((row) => row.geometry);
}

export async function loadVisitedPlaces(userId: string, bounds: CoverageViewport): Promise<VisitedPlace[]> {
  const result = await getPostgresPool().query<{ name: string; longitude: number; latitude: number; attraction_id: string | number | null; visit_count: number }>(
    `SELECT min(s.label) AS name,min(ST_X(s.geom))::float8 AS longitude,min(ST_Y(s.geom))::float8 AS latitude,
            min(s.attraction_id) AS attraction_id,count(*)::int AS visit_count
     FROM public.trips t JOIN public.trip_versions v ON v.id=t.current_version_id
     JOIN public.trip_stops s ON s.trip_version_id=v.id AND s.stop_type='attraction'
     JOIN public.trip_poi_visit_confirmations c ON c.user_id=t.user_id AND c.trip_version_id=v.id AND c.trip_stop_id=s.id AND c.outcome='visited'
     WHERE t.user_id=$1 AND t.status='traveled' AND v.state='finalized'
       AND s.geom && ST_MakeEnvelope($2,$3,$4,$5,4326)
     GROUP BY CASE WHEN s.attraction_id IS NOT NULL THEN 'attraction:'||s.attraction_id::text
                   ELSE 'snapshot:'||lower(s.label)||':'||ST_X(s.geom)::text||':'||ST_Y(s.geom)::text END
     ORDER BY min(s.label)`,
    [userId, bounds.west, bounds.south, bounds.east, bounds.north]
  );
  return result.rows.map((row) => ({ name: row.name, longitude: row.longitude, latitude: row.latitude, attractionId: row.attraction_id === null ? null : Number(row.attraction_id), visitCount: row.visit_count }));
}
