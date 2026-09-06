import { cellToLatLng } from "h3-js";
import type { ExplorationPotentialCell } from "../../types/exploration-potential.ts";

export function unexploredPotentialPointGeoJSON(cells: ExplorationPotentialCell[], revealedCells: readonly string[]): GeoJSON.FeatureCollection<GeoJSON.Point> {
  const revealed = new Set(revealedCells);
  return { type: "FeatureCollection", features: cells.filter((cell) => !revealed.has(cell.h3Index)).map((cell) => {
    const [latitude, longitude] = cellToLatLng(cell.h3Index);
    return { type: "Feature", properties: { h3Index: cell.h3Index, intensity: cell.intensity }, geometry: { type: "Point", coordinates: [longitude, latitude] } };
  }) };
}
