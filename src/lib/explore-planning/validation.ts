import { getResolution, isValidCell } from "h3-js";
import { isInterestCategory } from "@/lib/interests/taxonomy";
import type { DrivingPace, InterestCategory } from "@/types/preferences";
import type { ExplorePlanningRequest } from "@/types/explore-planning";

const PACE = new Set<DrivingPace>(["easy", "balanced", "road_trip"]);
const KEYS = new Set(["area", "origin", "availableDays", "drivingPace", "interests"]);
function exactKeys(value: Record<string, unknown>, allowed: Set<string>) { return Object.keys(value).every((key) => allowed.has(key)); }
function record(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }

export function parseExplorePlanningRequest(value: unknown): ExplorePlanningRequest | null {
  if (!record(value) || !exactKeys(value, KEYS) || !record(value.area) || !record(value.origin)) return null;
  if (!exactKeys(value.area, new Set(["h3Index", "resolution"])) || !exactKeys(value.origin, new Set(["latitude", "longitude", "label"]))) return null;
  const { h3Index, resolution } = value.area;
  const { latitude, longitude, label } = value.origin;
  if (typeof h3Index !== "string" || !isValidCell(h3Index) || !Number.isInteger(resolution) || (resolution as number) < 4 || (resolution as number) > 10 || getResolution(h3Index) !== resolution) return null;
  if (typeof latitude !== "number" || !Number.isFinite(latitude) || latitude < -90 || latitude > 90 || typeof longitude !== "number" || !Number.isFinite(longitude) || longitude < -180 || longitude > 180 || typeof label !== "string" || !label.trim()) return null;
  if (![1, 2, 3].includes(value.availableDays as number) || typeof value.drivingPace !== "string" || !PACE.has(value.drivingPace as DrivingPace) || !Array.isArray(value.interests) || !value.interests.every(isInterestCategory)) return null;
  const interests = value.interests as InterestCategory[];
  if (new Set(interests).size !== interests.length) return null;
  return value as ExplorePlanningRequest;
}
