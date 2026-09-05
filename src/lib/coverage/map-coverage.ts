import { cellToBoundary, cellToParent, getResolution } from "h3-js";
import { BASE_H3_RESOLUTION, COVERAGE_SOURCE } from "./h3-route.ts";
import type { CoverageViewport, PersonalCoverageResponse } from "../../types/coverage.ts";

export const COVERAGE_ZOOM_RESOLUTION_POLICY = [
  { minimumZoom: 11.5, resolution: 10 },
  { minimumZoom: 10, resolution: 9 },
  { minimumZoom: 8.5, resolution: 8 },
  { minimumZoom: 7, resolution: 7 },
  { minimumZoom: 5.5, resolution: 6 },
] as const;

export function coverageDisplayResolution(zoom: number) {
  if (!Number.isFinite(zoom)) throw new Error("Zoom must be a finite number.");
  return COVERAGE_ZOOM_RESOLUTION_POLICY.find((entry) => zoom >= entry.minimumZoom)?.resolution ?? 5;
}

export function validateCoverageViewport(viewport: CoverageViewport) {
  const { west, south, east, north } = viewport;
  if (![west, south, east, north].every(Number.isFinite)) throw new Error("Viewport bounds must be finite numbers.");
  if (west < -180 || east > 180 || south < -90 || north > 90 || west >= east || south >= north) {
    throw new Error("Viewport bounds are invalid.");
  }
  return viewport;
}

export function deriveDisplayCells(baseCells: string[], displayResolution: number) {
  if (!Number.isInteger(displayResolution) || displayResolution < 0 || displayResolution > BASE_H3_RESOLUTION) {
    throw new Error("Display resolution is invalid.");
  }
  return [...new Set(baseCells.map((cell) => displayResolution === BASE_H3_RESOLUTION ? cell : cellToParent(cell, displayResolution)))].sort();
}

export function cellIntersectsViewport(cell: string, viewport: CoverageViewport) {
  const boundary = cellToBoundary(cell);
  let cellSouth = 90;
  let cellNorth = -90;
  let cellWest = 180;
  let cellEast = -180;
  for (const [lat, lon] of boundary) {
    cellSouth = Math.min(cellSouth, lat);
    cellNorth = Math.max(cellNorth, lat);
    cellWest = Math.min(cellWest, lon);
    cellEast = Math.max(cellEast, lon);
  }
  return cellEast >= viewport.west && cellWest <= viewport.east && cellNorth >= viewport.south && cellSouth <= viewport.north;
}

export function buildPersonalCoverageResponse(baseCells: string[], zoom: number, viewport: CoverageViewport): PersonalCoverageResponse {
  validateCoverageViewport(viewport);
  const displayResolution = coverageDisplayResolution(zoom);
  const uniqueBaseCells = [...new Set(baseCells)].sort();
  if (uniqueBaseCells.some((cell) => getResolution(cell) !== BASE_H3_RESOLUTION)) throw new Error("Coverage repository returned a non-base-resolution cell.");
  const displayCells = deriveDisplayCells(uniqueBaseCells, displayResolution);
  const cells = displayCells.filter((cell) => cellIntersectsViewport(cell, viewport));
  return {
    coverageKind: COVERAGE_SOURCE,
    baseResolution: BASE_H3_RESOLUTION,
    displayResolution,
    baseCellCount: uniqueBaseCells.length,
    displayCellCount: displayCells.length,
    returnedCellCount: cells.length,
    cells,
  };
}
