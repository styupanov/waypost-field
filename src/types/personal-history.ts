import type { CoverageViewport } from "./coverage.ts";

export type TraveledRouteHistoryResponse = {
  routeKind: "inferred_traveled";
  source: "valhalla_inferred";
  routeCount: number;
  features: GeoJSON.FeatureCollection<GeoJSON.LineString>;
};

export type VisitedPlace = { name: string; longitude: number; latitude: number; attractionId: number | null; visitCount: number };
export type VisitedPlacesResponse = { kind: "visited_places"; count: number; places: VisitedPlace[] };

export function parseHistoryViewport(url: string): CoverageViewport {
  const params = new URL(url).searchParams;
  const values = ["west", "south", "east", "north"].map((key) => Number(params.get(key)));
  const [west, south, east, north] = values;
  if (!values.every(Number.isFinite) || west < -180 || east > 180 || south < -90 || north > 90 || west >= east || south >= north) throw new Error("Invalid history viewport.");
  return { west, south, east, north };
}
