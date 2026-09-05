export type RoutingWaypoint = { latitude: number; longitude: number };
export type ExecutableTripStatus = "planned" | "active" | "completed_unconfirmed" | "traveled" | "not_traveled";

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
  tripStatus: ExecutableTripStatus;
  versionState: "finalized";
  finalizedAt: string;
  provider: "here";
  finalRoute: Pick<FinalRoutePreview, "route" | "summary">;
  cache: { status: "valid"; fetchedAt: string; expiresAt: string };
};

export type FinalRouteCacheState =
  | { status: "valid"; provider: "here"; fetchedAt: string; expiresAt: string; finalRoute: FinalizedTripResult["finalRoute"] }
  | { status: "expired"; provider: "here"; fetchedAt: string; expiresAt: string }
  | { status: "missing"; provider: "here"; fetchedAt: null; expiresAt: null };

export type FinalizedTripWorkspace = {
  tripId: string;
  versionId: string;
  tripStatus: ExecutableTripStatus;
  startedAt: string | null;
  endedAt: string | null;
  travelConfirmationAt: string | null;
  versionState: "finalized";
  finalizedAt: string;
  provider: "here";
  cache: FinalRouteCacheState;
};

export type TripFinalizationState =
  | { status: "draft" }
  | { status: "confirming" }
  | { status: "finalizing" }
  | { status: "planned"; result: FinalizedTripWorkspace }
  | { status: "error"; message: string };

export type TripLifecycleActionState =
  | { status: "idle" }
  | { status: "confirming_start" }
  | { status: "starting" }
  | { status: "confirming_complete" }
  | { status: "completing" }
  | { status: "error"; message: string };

export type TravelConfirmationActionState =
  | { status: "idle" }
  | { status: "confirming"; outcome: "traveled" | "not_traveled" }
  | { status: "saving"; action: "confirm" | "undo" }
  | { status: "confirming_undo" }
  | { status: "error"; message: string };
