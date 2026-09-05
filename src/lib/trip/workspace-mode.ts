export type WorkspaceMode = "personal_map" | "trip" | "planner";
export type WorkspaceDestination = { mode: WorkspaceMode; tripId?: string };

export function resolveWorkspaceMode({
  authenticated,
  requestedTripId,
  requestedMode,
}: {
  authenticated: boolean;
  requestedTripId: string | null;
  requestedMode: string | null;
}): WorkspaceMode {
  if (requestedTripId) return "trip";
  if (authenticated && requestedMode === "planner") return "planner";
  return authenticated ? "personal_map" : "planner";
}

export function showsTripWorkspace(mode: WorkspaceMode) {
  return mode !== "personal_map";
}

export function workspaceUrl(destination: WorkspaceDestination) {
  if (destination.mode === "trip" && destination.tripId) return `/?trip=${encodeURIComponent(destination.tripId)}`;
  if (destination.mode === "planner") return "/?mode=planner";
  return "/";
}

export function isCurrentWorkspace(destination: WorkspaceDestination, mode: WorkspaceMode, tripId: string | null) {
  return destination.mode === mode && (mode !== "trip" || destination.tripId === tripId);
}
