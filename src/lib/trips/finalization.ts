import "server-only";
import { calculateHereFinalRoute, orderedWaypointsFromDraft } from "../routing/here.ts";
import { hasStaleDayPlans } from "../trip/day-plan-coherence.ts";
import { isOvernightStop } from "../../types/trip.ts";
import { reconstructTripDraft } from "./reconstruction.ts";
import { commitOwnedTripFinalization, getExistingFinalization, getOwnedTrip, TripPersistenceError } from "./repository.ts";

export class TripFinalizationError extends Error {
  readonly code: "TRIP_NOT_FINALIZABLE" | "TRIP_REBUILD_REQUIRED";
  constructor(code: "TRIP_NOT_FINALIZABLE" | "TRIP_REBUILD_REQUIRED", message: string) { super(message); this.name = "TripFinalizationError"; this.code = code; }
}

export async function finalizeOwnedTrip(userId: string, tripId: string) {
  const existing = await getExistingFinalization(userId, tripId);
  if (existing) return existing;
  const trip = await getOwnedTrip(userId, tripId);
  if (!trip) throw new TripPersistenceError("TRIP_NOT_FOUND", "Trip was not found.");
  const version = trip.currentVersion;
  if (!version || version.state !== "draft") throw new TripFinalizationError("TRIP_NOT_FINALIZABLE", "The current trip version cannot be finalized.");
  const draft = reconstructTripDraft(trip);
  const overnights = draft.stops.filter(isOvernightStop).sort((a, b) => a.nightIndex - b.nightIndex);
  const overnightStructureValid = overnights.length === draft.multiDay.nights && overnights.every((stop, index) => stop.nightIndex === index + 1);
  if (!overnightStructureValid || hasStaleDayPlans(draft)) throw new TripFinalizationError("TRIP_REBUILD_REQUIRED", "Rebuild the trip before finalizing.");
  const hereRoute = await calculateHereFinalRoute(orderedWaypointsFromDraft(draft));
  return commitOwnedTripFinalization(userId, tripId, version.id, version.updatedAt, hereRoute);
}
