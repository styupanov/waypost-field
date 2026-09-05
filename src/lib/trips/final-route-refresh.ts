import "server-only";
import { calculateHereFinalRoute, orderedWaypointsFromDraft } from "../routing/here.ts";
import { reconstructTripDraft } from "./reconstruction.ts";
import { getFinalizedTripWorkspace, getOwnedTrip, refreshOwnedFinalRouteCache, TripPersistenceError } from "./repository.ts";

// Refresh changes only temporary provider representation. It is not a new
// finalization, TripVersion, itinerary mutation, or future credit event.
export async function refreshFinalRoute(userId: string, tripId: string, options: { calculateRoute?: typeof calculateHereFinalRoute } = {}) {
  const workspace = await getFinalizedTripWorkspace(userId, tripId);
  if (!workspace) throw new TripPersistenceError("TRIP_NOT_FINALIZED", "Trip is not finalized.");
  if (workspace.cache.status === "valid") {
    return { ...workspace, finalRoute: workspace.cache.finalRoute, cache: { status: "valid" as const, fetchedAt: workspace.cache.fetchedAt, expiresAt: workspace.cache.expiresAt } };
  }
  const trip = await getOwnedTrip(userId, tripId);
  if (!trip?.currentVersion || trip.currentVersion.id !== workspace.versionId) throw new TripPersistenceError("TRIP_NOT_FINALIZED", "Trip is not finalized.");
  const draft = reconstructTripDraft(trip);
  const route = await (options.calculateRoute ?? calculateHereFinalRoute)(orderedWaypointsFromDraft(draft));
  return refreshOwnedFinalRouteCache(userId, tripId, workspace.versionId, route);
}
