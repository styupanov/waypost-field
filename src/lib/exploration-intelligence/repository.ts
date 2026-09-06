import "server-only";
import { getPostgresPool } from "../db/postgres.ts";
import type { AreaExplorationAggregate } from "../../types/exploration-intelligence.ts";

export async function loadAreaExplorationAggregates(h3Index: string, resolution: number): Promise<AreaExplorationAggregate[]> {
  const result = await getPostgresPool().query<{ source_category: string; attraction_count: number }>(
    "SELECT source_category,attraction_count FROM public.attraction_h3_category_aggregates WHERE h3_resolution=$1 AND h3_index=$2",
    [resolution, h3Index]
  );
  return result.rows.map((row) => ({ sourceCategory: row.source_category, count: row.attraction_count }));
}
