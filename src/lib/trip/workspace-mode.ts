export type WorkspaceMode = "personal_map" | "trip" | "planner";

export function initialWorkspaceMode(
  authenticated: boolean,
  requestedTripId: string | null
): WorkspaceMode {
  if (requestedTripId) return "trip";
  return authenticated ? "personal_map" : "planner";
}

export function showsTripWorkspace(mode: WorkspaceMode) {
  return mode !== "personal_map";
}
