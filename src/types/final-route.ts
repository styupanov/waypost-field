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

export type FinalizedTripResult = {
  tripId: string;
  versionId: string;
  tripStatus: "planned";
  versionState: "finalized";
  finalizedAt: string;
  provider: "here";
  finalRoute: Pick<FinalRoutePreview, "route" | "summary">;
  cache: { fetchedAt: string; expiresAt: string };
};

export type TripFinalizationState =
  | { status: "draft" }
  | { status: "confirming" }
  | { status: "finalizing" }
  | { status: "planned"; result: FinalizedTripResult }
  | { status: "error"; message: string };
