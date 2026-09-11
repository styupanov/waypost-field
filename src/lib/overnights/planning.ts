import type { RoutePoint, TimedRouteResponse } from "@/types/route";

export const OVERNIGHT_TARGET_WINDOW_SECONDS = 60 * 60;
export const OVERNIGHT_SPATIAL_CORRIDOR_METERS = 30_000;
export const OVERNIGHT_DATABASE_SHORTLIST_LIMIT = 20;
export const OVERNIGHT_VALIDATION_LIMIT = 12;
export const OVERNIGHT_RESULT_LIMIT = 5;
export const OVERNIGHT_ROUTING_CONCURRENCY = 4;
export const ELIGIBLE_SETTLEMENT_FEATURE_CODES = ["PPL", "PPLA", "PPLA2", "PPLA3", "PPLA4", "PPLC", "PPLS"] as const;
export const MAX_OVERNIGHT_DETOUR_SECONDS = 90 * 60;

export function overnightTargets(totalSeconds: number, selectedDays: number) {
  return Array.from({ length: Math.max(0, selectedDays - 1) }, (_, index) => totalSeconds * (index + 1) / selectedDays);
}
export function targetWindow(targetSeconds: number, totalSeconds: number) {
  return { start: Math.max(0, targetSeconds - OVERNIGHT_TARGET_WINDOW_SECONDS), end: Math.min(totalSeconds, targetSeconds + OVERNIGHT_TARGET_WINDOW_SECONDS) };
}
function shapeIndexAtTime(route: TimedRouteResponse, seconds: number) {
  const segment = route.timingSegments.find((item) => seconds <= item.endTimeSeconds) ?? route.timingSegments.at(-1)!;
  const duration = segment.endTimeSeconds - segment.beginTimeSeconds;
  const fraction = duration <= 0 ? 0 : Math.min(1, Math.max(0, (seconds - segment.beginTimeSeconds) / duration));
  return Math.round(segment.beginShapeIndex + (segment.endShapeIndex - segment.beginShapeIndex) * fraction);
}
export function timedRouteWindow(route: TimedRouteResponse, targetSeconds: number) {
  const window = targetWindow(targetSeconds, route.summary.durationSeconds);
  const startIndex = shapeIndexAtTime(route, window.start); const endIndex = shapeIndexAtTime(route, window.end); const targetIndex = shapeIndexAtTime(route, targetSeconds);
  const coordinates = route.route.geometry.coordinates.slice(Math.min(startIndex,endIndex), Math.max(startIndex,endIndex)+1);
  if (coordinates.length === 1) coordinates.push(coordinates[0]);
  const target = route.route.geometry.coordinates[targetIndex];
  return { window, coordinates, target: { lon: target[0], lat: target[1] } as RoutePoint };
}
export function settlementFeatureEligible(featureCode: string) { return (ELIGIBLE_SETTLEMENT_FEATURE_CODES as readonly string[]).includes(featureCode); }
export function preserveUserOvernightSelections(previousSelectedDays: number | null | undefined, nextSelectedDays: number) { return previousSelectedDays === nextSelectedDays; }
export function scoreOvernightCandidate(input: { targetTimeDeviationMinutes: number; detourDurationSeconds: number; population: number; featureCode: string }) {
  const timing = Math.max(0,45*(1-input.targetTimeDeviationMinutes/120));
  const detour = Math.max(0,35*(1-input.detourDurationSeconds/MAX_OVERNIGHT_DETOUR_SECONDS));
  const populationSignal = Math.min(1,Math.log10(Math.max(1,input.population))/7);
  const featureBonus = input.featureCode.startsWith("PPLA")||input.featureCode==="PPLC"?5:0;
  const suitability=15*populationSignal+featureBonus;
  return {score:timing+detour+suitability,breakdown:{timing,detour,suitability}};
}
