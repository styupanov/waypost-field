import { isAttractionStop, isOvernightStop, type DraftDayBoundary, type DraftStop, type TripDraft } from "../../types/trip.ts";
import type { RoutePoint } from "../../types/route.ts";
import type { VisitDuration } from "../../types/attractions.ts";

export const DAY_OPPORTUNITY_VALIDATION_LIMIT = 8;
export const DAY_AUTO_DETOUR_BUDGET_RATIO = 0.15;
export const MAX_DAY_AUTO_DETOUR_SECONDS = 60 * 60;
export const HARD_ATTRACTION_CAPACITY_PENALTY = 8;
export const DAY_LOAD_VISIT_PENALTY_WEIGHT = 0.4;

export function dayAutoDetourBudget(durationSeconds: number) {
  return Math.min(durationSeconds * DAY_AUTO_DETOUR_BUDGET_RATIO, MAX_DAY_AUTO_DETOUR_SECONDS);
}

export function knownVisitMinutes(duration: VisitDuration | null) {
  if (!duration) return 0;
  if (duration.minimumMinutes !== null && duration.maximumMinutes !== null) return (duration.minimumMinutes + duration.maximumMinutes) / 2;
  return duration.minimumMinutes ?? duration.maximumMinutes ?? 0;
}

function boundary(kind: DraftDayBoundary["kind"], label: string, coordinates: RoutePoint, nightIndex: number | null): DraftDayBoundary {
  return { kind, label, coordinates, nightIndex };
}

export function constructDayBoundaries(draft: TripDraft) {
  const overnights = draft.stops.filter(isOvernightStop).sort((left, right) => left.nightIndex - right.nightIndex);
  const boundaries: DraftDayBoundary[] = [boundary("origin", draft.origin.label, draft.origin.coordinates, null), ...overnights.map((stop) => boundary("overnight", stop.label, stop.coordinates, stop.nightIndex)), boundary("destination", draft.destination.label, draft.destination.coordinates, null)];
  return boundaries.slice(0, -1).map((start, index) => ({ dayIndex: index + 1, start, end: boundaries[index + 1] }));
}

export function assignHardStopsToDays(draft: TripDraft) {
  const result = new Map<number, DraftStop[]>();
  let dayIndex = 1;
  for (const stop of draft.stops) {
    if (isOvernightStop(stop)) { dayIndex += 1; continue; }
    if (isAttractionStop(stop) && stop.source === "waypost") continue;
    result.set(dayIndex, [...(result.get(dayIndex) ?? []), stop]);
  }
  return result;
}

export function allocateDayQuotas(days: { dayIndex: number; viableCount: number; suitability: number }[], totalTarget: number) {
  const quotas = new Map(days.map((day) => [day.dayIndex, 0]));
  let remaining = totalTarget;
  for (const day of days.filter((item) => item.viableCount > 0).sort((a, b) => a.dayIndex - b.dayIndex)) {
    if (remaining === 0) break;
    quotas.set(day.dayIndex, 1); remaining -= 1;
  }
  while (remaining > 0) {
    const eligible = days.filter((day) => (quotas.get(day.dayIndex) ?? 0) < day.viableCount).sort((a, b) => (quotas.get(a.dayIndex) ?? 0) - (quotas.get(b.dayIndex) ?? 0) || b.suitability - a.suitability || a.dayIndex - b.dayIndex);
    if (!eligible.length) break;
    const chosen = eligible[0];
    quotas.set(chosen.dayIndex, (quotas.get(chosen.dayIndex) ?? 0) + 1); remaining -= 1;
  }
  return quotas;
}

export function removeWeakestAutomatic<T extends { score: number; id: number }>(selected: T[]) {
  if (!selected.length) return selected;
  const weakest = [...selected].sort((a, b) => a.score - b.score || a.id - b.id)[0];
  return selected.filter((item) => item !== weakest);
}
