import { EXPLORATION_H3_RESOLUTIONS } from "../exploration-intelligence/validation.ts";
import { validateCoverageViewport } from "../coverage/map-coverage.ts";

export function parsePotentialViewport(url: string) {
  const params = new URL(url).searchParams;
  const allowed = new Set(["west", "south", "east", "north", "resolution"]);
  if ([...params.keys()].some((key) => !allowed.has(key)) || [...allowed].some((key) => params.getAll(key).length !== 1)) return null;
  const resolution = Number(params.get("resolution"));
  if (!Number.isInteger(resolution) || !EXPLORATION_H3_RESOLUTIONS.includes(resolution as typeof EXPLORATION_H3_RESOLUTIONS[number])) return null;
  try {
    const viewport = validateCoverageViewport({ west: Number(params.get("west")), south: Number(params.get("south")), east: Number(params.get("east")), north: Number(params.get("north")) });
    return { ...viewport, resolution };
  } catch { return null; }
}
