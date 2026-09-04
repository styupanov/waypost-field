export type RouteFeature = {
  type: "Feature";
  properties: Record<string, unknown>;
  geometry: {
    type: "LineString";
    coordinates: [number, number][];
  };
};

export type RouteSummary = {
  distanceKm: number;
  durationSeconds: number;
  hasToll: boolean;
  hasHighway: boolean;
  hasFerry: boolean;
};

export type RouteResponse = {
  route: RouteFeature;
  summary: RouteSummary;
};

export type RoutePoint = {
  lat: number;
  lon: number;
};
