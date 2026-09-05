import "server-only";
import { calculateRoute } from "@/lib/routing/valhalla";
import { calculateRouteProgress } from "@/lib/trip/composition";
import { findOvernightCandidates } from "@/lib/overnights/candidates";
import type { OvernightAreaCandidate } from "@/types/overnights";
import type { DraftOvernightStop, ItineraryStop, TripDraft } from "@/types/trip";

export class OvernightPlanningError extends Error {
  readonly nightIndex: number;
  constructor(nightIndex: number) { super(`No acceptable overnight area was found for night ${nightIndex}.`); this.name = "OvernightPlanningError"; this.nightIndex = nightIndex; }
}

export function overnightStopFromCandidate(candidate: OvernightAreaCandidate, nightIndex: number, targetDrivingSeconds: number, source: "waypost" | "user"): DraftOvernightStop {
  return { type: "overnight", source, nightIndex, geonameId: candidate.geonameId, label: candidate.name, admin1Code: candidate.admin1Code, countryCode: candidate.countryCode, featureCode: candidate.featureCode, population: candidate.population, coordinates: candidate.coordinates, targetDrivingSeconds, arrivalDrivingSeconds: candidate.arrivalDrivingSeconds, targetTimeDeviationMinutes: candidate.targetTimeDeviationMinutes, detourDurationSeconds: candidate.detourDurationSeconds, detourDistanceKm: candidate.detourDistanceKm, score: candidate.score };
}

export async function integrateDefaultOvernights(draft: TripDraft, existingUserOvernights: DraftOvernightStop[], preserveUserChoices: boolean): Promise<TripDraft> {
  if (!draft.multiDay.isMultiDay) return { ...draft, overnightAlternatives: [] };
  const provisional = { ...draft, stops: [...draft.stops, ...(preserveUserChoices ? existingUserOvernights : [])] };
  const result = await findOvernightCandidates(provisional);
  const selected = result.nights.map((night) => {
    const preserved = preserveUserChoices ? existingUserOvernights.find((stop) => stop.nightIndex === night.nightIndex) : null;
    if (preserved) return preserved;
    const candidate = night.candidates[0];
    if (!candidate) throw new OvernightPlanningError(night.nightIndex);
    return overnightStopFromCandidate(candidate, night.nightIndex, night.targetDrivingSeconds, "waypost");
  });
  const baseStops = draft.stops.filter((stop) => !("type" in stop && stop.type === "overnight"));
  const stops: ItineraryStop[] = [...baseStops, ...selected].sort((left, right) => calculateRouteProgress(draft.route, left.coordinates) - calculateRouteProgress(draft.route, right.coordinates));
  const routed = await calculateRoute([draft.origin.coordinates, ...stops.map((stop) => stop.coordinates), draft.destination.coordinates]);
  const rawDetour = routed.summary.durationSeconds - draft.baselineSummary.durationSeconds;
  return { ...draft, stops, route: routed.route, summary: routed.summary, overnightAlternatives: result.nights, composition: { ...draft.composition, actualDetourSeconds: Math.max(0, rawDetour), actualDetourWasClamped: rawDetour < 0, valhallaCallCount: (draft.composition.valhallaCallCount ?? 0) + result.diagnostics.valhallaCallCount + 1 } };
}
