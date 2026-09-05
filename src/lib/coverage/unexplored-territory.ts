import { cellToBoundary, cellToParent, getResolution, latLngToCell } from "h3-js";
import type { UnexploredTerritorySelection } from "../../types/unexplored-territory.ts";

export function createUnexploredTerritorySelection(latitude: number, longitude: number, resolution: number): UnexploredTerritorySelection {
  const h3Index = latLngToCell(latitude, longitude, resolution);
  const boundary = cellToBoundary(h3Index, true);
  return { h3Index, resolution, latitude, longitude, boundary: { type: "Polygon", coordinates: [[...boundary, boundary[0]]] } };
}

export function cellSupportsSelection(revealedCell: string, selection: UnexploredTerritorySelection) {
  const revealedResolution = getResolution(revealedCell);
  if (revealedResolution === selection.resolution) return revealedCell === selection.h3Index;
  if (revealedResolution < selection.resolution) return cellToParent(selection.h3Index, revealedResolution) === revealedCell;
  return cellToParent(revealedCell, selection.resolution) === selection.h3Index;
}

export function selectionIsExplored(selection: UnexploredTerritorySelection, revealedCells: readonly string[]) {
  return revealedCells.some((cell) => cellSupportsSelection(cell, selection));
}
