import "server-only";
import { getPostgresPool } from "../db/postgres.ts";
import type { CoverageViewport } from "../../types/coverage.ts";

export type PotentialInputCell = { h3Index: string; counts: { sourceCategory: string; count: number }[] };

export async function loadPotentialInputCells(resolution: number, sourceCategories: string[] | null, viewport?: CoverageViewport): Promise<PotentialInputCell[]> {
  const parameters: unknown[] = [resolution];
  let categoryFilter = ""; let viewportJoin = ""; let viewportFilter = "";
  if (sourceCategories) { parameters.push(sourceCategories); categoryFilter = ` AND a.source_category=ANY($${parameters.length}::text[])`; }
  if (viewport) {
    parameters.push(viewport.west, viewport.south, viewport.east, viewport.north);
    const offset = parameters.length - 3;
    viewportJoin = " JOIN public.attraction_h3_cells c ON c.h3_resolution=a.h3_resolution AND c.h3_index=a.h3_index";
    viewportFilter = ` AND c.center_geom && ST_MakeEnvelope($${offset},$${offset + 1},$${offset + 2},$${offset + 3},4326)`;
  }
  const result = await getPostgresPool().query<{ h3_index: string; source_category: string; attraction_count: number }>(
    `SELECT a.h3_index,a.source_category,a.attraction_count FROM public.attraction_h3_category_aggregates a${viewportJoin}
     WHERE a.h3_resolution=$1${categoryFilter}${viewportFilter} ORDER BY a.h3_index,a.source_category`, parameters
  );
  const cells = new Map<string, PotentialInputCell>();
  for (const row of result.rows) {
    const cell = cells.get(row.h3_index) ?? { h3Index: row.h3_index, counts: [] };
    cell.counts.push({ sourceCategory: row.source_category, count: row.attraction_count }); cells.set(row.h3_index, cell);
  }
  return [...cells.values()];
}
