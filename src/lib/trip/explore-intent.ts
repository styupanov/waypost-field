import { cellToBoundary, getResolution, isValidCell } from "h3-js";
import type { ExploreIntent } from "../../types/explore-intent.ts";
import type { UnexploredTerritorySelection } from "../../types/unexplored-territory.ts";
import { EXPLORATION_H3_RESOLUTIONS } from "../exploration-intelligence/validation.ts";

type ExploreIntentParams = { intent?: string; area?: string; areaRes?: string; lat?: string; lng?: string };

export function exploreIntentFromSelection(selection: UnexploredTerritorySelection): ExploreIntent {
  return { kind: "explore_area", h3Index: selection.h3Index, resolution: selection.resolution, anchor: { latitude: selection.latitude, longitude: selection.longitude } };
}

export function serializeExploreIntent(intent: ExploreIntent) {
  return new URLSearchParams({ mode: "planner", intent: "explore", area: intent.h3Index, areaRes: String(intent.resolution), lat: String(intent.anchor.latitude), lng: String(intent.anchor.longitude) });
}

export function parseExploreIntent(params: ExploreIntentParams): ExploreIntent | null {
  if (params.intent !== "explore" || !params.area || params.areaRes === undefined || params.lat === undefined || params.lng === undefined) return null;
  if (!params.areaRes.trim() || !params.lat.trim() || !params.lng.trim()) return null;
  const resolution = Number(params.areaRes); const latitude = Number(params.lat); const longitude = Number(params.lng);
  if (!Number.isInteger(resolution) || !EXPLORATION_H3_RESOLUTIONS.includes(resolution as typeof EXPLORATION_H3_RESOLUTIONS[number]) || !Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180 || !isValidCell(params.area)) return null;
  if (getResolution(params.area) !== resolution) return null;
  return { kind: "explore_area", h3Index: params.area, resolution, anchor: { latitude, longitude } };
}

export function exploreIntentBoundary(intent: ExploreIntent): GeoJSON.Polygon {
  const boundary = cellToBoundary(intent.h3Index, true);
  return { type: "Polygon", coordinates: [[...boundary, boundary[0]]] };
}
