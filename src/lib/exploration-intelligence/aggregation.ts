import { getResolution, latLngToCell } from "h3-js";
import { EXPLORATION_H3_RESOLUTIONS } from "./validation.ts";

export type ExplorationSourceRow = { sourceCategory: string; latitude: number; longitude: number };
export type ExplorationAggregateRow = { resolution: number; h3Index: string; sourceCategory: string; count: number };

export function buildH3CategoryAggregates(rows: ExplorationSourceRow[]) {
  const aggregate = new Map<string, number>();
  let validGeometryRows = 0; let invalidGeometryRows = 0;
  for (const row of rows) {
    const valid = Number.isFinite(row.latitude) && Number.isFinite(row.longitude) && row.latitude >= -90 && row.latitude <= 90 && row.longitude >= -180 && row.longitude <= 180;
    if (!valid) { invalidGeometryRows += 1; continue; }
    validGeometryRows += 1;
    for (const resolution of EXPLORATION_H3_RESOLUTIONS) {
      const h3Index = latLngToCell(row.latitude, row.longitude, resolution);
      if (getResolution(h3Index) !== resolution) throw new Error("Generated H3 resolution mismatch.");
      const key = `${resolution}\u001f${h3Index}\u001f${row.sourceCategory}`;
      aggregate.set(key, (aggregate.get(key) ?? 0) + 1);
    }
  }
  const aggregates = [...aggregate.entries()].map(([key, count]) => {
    const [resolution, h3Index, sourceCategory] = key.split("\u001f");
    return { resolution: Number(resolution), h3Index, sourceCategory, count };
  }).sort((a, b) => a.resolution - b.resolution || a.h3Index.localeCompare(b.h3Index) || a.sourceCategory.localeCompare(b.sourceCategory));
  return { aggregates, validGeometryRows, invalidGeometryRows };
}
