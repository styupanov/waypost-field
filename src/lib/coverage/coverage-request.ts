import type { CoverageViewport } from "../../types/coverage.ts";

export class CoverageRequestError extends Error {}

export function parseCoverageRequest(url: string) {
  const params = new URL(url).searchParams;
  const required = ["zoom", "west", "south", "east", "north"] as const;
  if (required.some((name) => params.get(name) === null || params.get(name)?.trim() === "")) {
    throw new CoverageRequestError("zoom, west, south, east, and north are required.");
  }
  const zoom = Number(params.get("zoom"));
  const viewport: CoverageViewport = {
    west: Number(params.get("west")), south: Number(params.get("south")),
    east: Number(params.get("east")), north: Number(params.get("north")),
  };
  if (!Number.isFinite(zoom) || zoom < 0 || zoom > 24) throw new CoverageRequestError("Zoom is invalid.");
  if (![viewport.west, viewport.south, viewport.east, viewport.north].every(Number.isFinite) || viewport.west < -180 || viewport.east > 180 || viewport.south < -90 || viewport.north > 90 || viewport.west >= viewport.east || viewport.south >= viewport.north) {
    throw new CoverageRequestError("Viewport bounds are invalid.");
  }
  return { zoom, viewport };
}
