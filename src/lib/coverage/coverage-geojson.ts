import { cellToBoundary } from "h3-js";

export function coverageCellsToGeoJSON(cells: string[]): GeoJSON.FeatureCollection<GeoJSON.Polygon> {
  return {
    type: "FeatureCollection",
    features: cells.map((cell) => {
      const boundary = cellToBoundary(cell, true);
      return {
        type: "Feature",
        properties: { h3: cell },
        geometry: { type: "Polygon", coordinates: [[...boundary, boundary[0]]] },
      };
    }),
  };
}
