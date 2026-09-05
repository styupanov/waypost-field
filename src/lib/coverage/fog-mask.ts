import polygonClipping from "polygon-clipping";
import type { CoverageViewport } from "../../types/coverage.ts";
import { coverageCellsToGeoJSON } from "./coverage-geojson.ts";

export const FOG_VIEWPORT_PADDING_RATIO = 0.25;

type Position = [number, number];
type Ring = Position[];
type PolygonCoordinates = Ring[];
type MultiPolygonCoordinates = PolygonCoordinates[];

export type FogMaskFeature = GeoJSON.Feature<
  GeoJSON.Polygon | GeoJSON.MultiPolygon,
  { fogKind: "unexplored" }
>;

function closeRing(ring: Ring): Ring {
  if (!ring.length) return ring;
  const first = ring[0];
  const last = ring[ring.length - 1];
  return first[0] === last[0] && first[1] === last[1]
    ? ring
    : [...ring, first];
}

function normalizedMultiPolygon(coordinates: MultiPolygonCoordinates): MultiPolygonCoordinates {
  return coordinates.map((polygon) => polygon.map(closeRing));
}

export function padCoverageViewport(
  bounds: CoverageViewport,
  paddingRatio = FOG_VIEWPORT_PADDING_RATIO
): CoverageViewport {
  if (!Number.isFinite(paddingRatio) || paddingRatio < 0) {
    throw new Error("Viewport padding ratio must be a non-negative finite number.");
  }
  if (bounds.west >= bounds.east || bounds.south >= bounds.north) {
    throw new Error("Viewport bounds are invalid.");
  }
  const longitudePadding = (bounds.east - bounds.west) * paddingRatio;
  const latitudePadding = (bounds.north - bounds.south) * paddingRatio;
  return {
    west: Math.max(-180, bounds.west - longitudePadding),
    south: Math.max(-90, bounds.south - latitudePadding),
    east: Math.min(180, bounds.east + longitudePadding),
    north: Math.min(90, bounds.north + latitudePadding),
  };
}

export function buildFogMask({
  bounds,
  revealedCells,
}: {
  bounds: CoverageViewport;
  revealedCells: readonly string[];
}): FogMaskFeature {
  const bbox: PolygonCoordinates = [[
    [bounds.west, bounds.south],
    [bounds.east, bounds.south],
    [bounds.east, bounds.north],
    [bounds.west, bounds.north],
    [bounds.west, bounds.south],
  ]];
  const revealedPolygons = coverageCellsToGeoJSON([...revealedCells]).features.map(
    (feature) => feature.geometry.coordinates as PolygonCoordinates
  );
  const [firstRevealedPolygon, ...remainingRevealedPolygons] = revealedPolygons;
  const difference = revealedPolygons.length
    ? polygonClipping.difference(
        bbox,
        polygonClipping.union(firstRevealedPolygon, ...remainingRevealedPolygons)
      )
    : [bbox];
  const coordinates = normalizedMultiPolygon(difference as MultiPolygonCoordinates);

  return coordinates.length === 1
    ? {
        type: "Feature",
        properties: { fogKind: "unexplored" },
        geometry: { type: "Polygon", coordinates: coordinates[0] },
      }
    : {
        type: "Feature",
        properties: { fogKind: "unexplored" },
        geometry: { type: "MultiPolygon", coordinates },
      };
}
