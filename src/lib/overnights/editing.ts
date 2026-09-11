import "server-only";
import { routingProvider } from "@/lib/routing/provider";
import { overnightStopFromCandidate } from "@/lib/overnights/integration";
import { isOvernightStop, type TripDraft } from "@/types/trip";

export class OvernightEditError extends Error { constructor(message: string) { super(message); this.name = "OvernightEditError"; } }

export async function changeOvernight(draft: TripDraft, nightIndex: number, geonameId: number) {
  const night = draft.overnightAlternatives.find((item) => item.nightIndex === nightIndex);
  const candidate = night?.candidates.find((item) => item.geonameId === geonameId);
  if (!night || !candidate) throw new OvernightEditError("The selected overnight area is no longer available.");
  const existingIndex = draft.stops.findIndex((stop) => isOvernightStop(stop) && stop.nightIndex === nightIndex);
  if (existingIndex < 0) throw new OvernightEditError("The overnight stop was not found.");
  const stops = [...draft.stops];
  stops[existingIndex] = overnightStopFromCandidate(candidate, nightIndex, night.targetDrivingSeconds, "user");
  const routed = await routingProvider.route([draft.origin.coordinates, ...stops.map((stop) => stop.coordinates), draft.destination.coordinates]);
  const rawDetour = routed.summary.durationSeconds - draft.baselineSummary.durationSeconds;
  return { ...draft, stops, route: routed.route, summary: routed.summary, composition: { ...draft.composition, actualDetourSeconds: Math.max(0, rawDetour), actualDetourWasClamped: rawDetour < 0, valhallaCallCount: (draft.composition.valhallaCallCount ?? 0) + 1 } };
}
