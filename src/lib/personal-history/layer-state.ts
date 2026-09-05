import type { WorkspaceMode } from "../trip/workspace-mode.ts";

export const DEFAULT_PERSONAL_MAP_LAYERS = { traveledRoutes: false, visitedPlaces: false } as const;
export function personalHistoryLayerActive(workspaceMode: WorkspaceMode, enabled: boolean) {
  return workspaceMode === "personal_map" && enabled;
}
