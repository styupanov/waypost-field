export type RoutingWaypoint = { latitude: number; longitude: number };

export type FinalRoutePreview = {
  provider: "here";
  route: { type: "LineString"; coordinates: [number, number][] };
  summary: { distanceKm: number; durationSeconds: number; baseDurationSeconds: number | null };
  diagnostics: { sectionCount: number; waypointCount: number; requestDurationMilliseconds: number };
};

export type FinalRoutePreviewState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "active"; result: FinalRoutePreview }
  | { status: "error"; message: string };
