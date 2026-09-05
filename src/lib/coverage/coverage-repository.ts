import "server-only";
import { getPostgresPool } from "../db/postgres.ts";
import { cellToBoundary } from "h3-js";
import type { PersonalCoverageBoundsResponse } from "../../types/coverage.ts";

export async function loadPersonalBaseCoverageCells(userId: string) {
  const result = await getPostgresPool().query<{ h3_index: string }>(
    `SELECT DISTINCT rc.h3_index
     FROM public.route_coverage rc
     JOIN public.trip_versions v ON v.id=rc.trip_version_id
     JOIN public.trips t ON t.current_version_id=v.id AND t.user_id=rc.user_id
     WHERE rc.user_id=$1 AND t.status='traveled' AND v.state='finalized'
       AND rc.h3_resolution=10 AND rc.coverage_source='valhalla_inferred'
     ORDER BY rc.h3_index`,
    [userId]
  );
  return result.rows.map((row) => row.h3_index);
}

export async function loadPersonalCoverageBounds(userId: string): Promise<PersonalCoverageBoundsResponse> {
  const cells = await loadPersonalBaseCoverageCells(userId);
  if (!cells.length) return { hasCoverage: false, bounds: null };

  let west = 180;
  let south = 90;
  let east = -180;
  let north = -90;
  for (const cell of cells) for (const [longitude, latitude] of cellToBoundary(cell, true)) {
    west = Math.min(west, longitude);
    south = Math.min(south, latitude);
    east = Math.max(east, longitude);
    north = Math.max(north, latitude);
  }
  return { hasCoverage: true, bounds: { west, south, east, north } };
}
