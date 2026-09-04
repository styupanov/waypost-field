export type RouteFeature = {
  type: "Feature";
  properties: Record<string, unknown>;
  geometry: {
    type: "LineString";
    coordinates: [number, number][];
  };
};
