import "server-only";
import type { PoolClient } from "pg";
import { getPostgresPool } from "../db/postgres.ts";
import { BASE_H3_RESOLUTION, COVERAGE_SOURCE, generateBaseRouteCoverage, type RouteLineString } from "./h3-route.ts";

type CoverageInputRow = {
  user_id: string;
  status: string;
  current_version_id: string | null;
  version_state: string | null;
  geometry_type: string | null;
  route_geometry: RouteLineString | null;
};

export type PreparedRouteCoverage = { tripVersionId: string; cells: string[] };

export async function prepareRouteCoverage(userId: string, tripId: string): Promise<PreparedRouteCoverage | null> {
  const result = await getPostgresPool().query<CoverageInputRow>(
    `SELECT t.user_id,t.status,t.current_version_id,v.state AS version_state,
       ST_GeometryType(v.route_geom) AS geometry_type,ST_AsGeoJSON(v.route_geom)::json AS route_geometry
     FROM public.trips t LEFT JOIN public.trip_versions v ON v.id=t.current_version_id
     WHERE t.id=$1`,
    [tripId]
  );
  const trip = result.rows[0];
  if (!trip || trip.user_id !== userId || trip.status !== "completed_unconfirmed") return null;
  if (!trip.current_version_id || trip.version_state !== "finalized") throw new Error("Route coverage requires the current finalized TripVersion.");
  if (trip.geometry_type !== "ST_LineString" || !trip.route_geometry) throw new Error("Route coverage requires a finalized LineString.");
  return { tripVersionId: trip.current_version_id, cells: generateBaseRouteCoverage(trip.route_geometry).cells };
}

export async function bulkInsertRouteCoverage(client: PoolClient, userId: string, tripVersionId: string, cells: string[]) {
  if (!cells.length) return 0;
  const result = await client.query(
    `INSERT INTO public.route_coverage (user_id,trip_version_id,h3_index,h3_resolution,coverage_source)
     SELECT $1,$2,cell,$3,$4 FROM unnest($5::text[]) AS cell
     ON CONFLICT DO NOTHING`,
    [userId, tripVersionId, BASE_H3_RESOLUTION, COVERAGE_SOURCE, cells]
  );
  return result.rowCount ?? 0;
}
