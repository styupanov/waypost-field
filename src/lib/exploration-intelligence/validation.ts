import { getResolution, isValidCell } from "h3-js";

export const EXPLORATION_H3_RESOLUTIONS = [4, 5, 6, 7, 8, 9, 10] as const;

export function parseAreaIntelligenceQuery(url: string) {
  const params = new URL(url).searchParams;
  if ([...params.keys()].some((key) => key !== "h3" && key !== "resolution")) return null;
  if (params.getAll("h3").length !== 1 || params.getAll("resolution").length !== 1) return null;
  const h3Index = params.get("h3"); const rawResolution = params.get("resolution");
  if (!h3Index || !rawResolution?.trim()) return null;
  const resolution = Number(rawResolution);
  if (!Number.isInteger(resolution) || !EXPLORATION_H3_RESOLUTIONS.includes(resolution as typeof EXPLORATION_H3_RESOLUTIONS[number])) return null;
  if (!isValidCell(h3Index) || getResolution(h3Index) !== resolution) return null;
  return { h3Index, resolution };
}
