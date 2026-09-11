import { randomUUID } from "node:crypto";
import { getPostgresPool } from "../src/lib/db/postgres.ts";
import { resolveWaypostUserId } from "../src/lib/users/identity.ts";
import { calculateHereFinalRoute, orderedWaypointsFromDraft } from "../src/lib/routing/here.ts";
import { commitOwnedTripFinalization, createTripWithDraft, getExistingFinalization, saveOwnedCurrentDraftVersion, TripPersistenceError } from "../src/lib/trips/repository.ts";
import type { TripDraft } from "../src/types/trip.ts";

const baseUrl = process.env.WAYPOST_TEST_URL ?? "http://localhost:3104";
const long = process.argv.includes("--multi-day");
const destination = long ? { label: "Denver, CO", coordinates: { lat: 39.7392, lon: -104.9903 } } : { label: "Washington, DC", coordinates: { lat: 38.9072, lon: -77.0369 } };
const response = await fetch(`${baseUrl}/api/draft`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ origin: { label: "Charlotte, NC", coordinates: { lat: 35.2271, lon: -80.8431 } }, stop: null, destination, preferences: { preferredCategories: ["nature_scenic"], excludedCategories: [], detourTolerance: "balanced", stopStyle: "balanced", drivingPace: "balanced", selectedTripDays: long ? 4 : 1, tripDaysOverridden: true }, hardUserAttractions: [], existingUserOvernights: [], previousSelectedTripDays: null }) });
if (!response.ok) throw new Error(`Draft request failed: ${response.status}`);
const draft = await response.json() as TripDraft;
const pool = getPostgresPool(); let tripId: string | null = null; let userId: string | null = null;
try {
  userId = await resolveWaypostUserId(`local:finalization-smoke:${randomUUID()}`);
  const trip = await createTripWithDraft(userId, draft, { title: "Temporary finalization smoke" });
  if (!trip) throw new Error("Trip creation failed."); tripId = trip.id;
  const here = await calculateHereFinalRoute(orderedWaypointsFromDraft(draft));
  const first = await commitOwnedTripFinalization(userId, tripId, trip.currentVersion!.id, trip.currentVersion!.updatedAt, here);
  const retry = await getExistingFinalization(userId, tripId);
  if (!retry) throw new Error("Idempotent finalization lookup failed.");
  let immutable = false;
  try { await saveOwnedCurrentDraftVersion(userId, tripId, draft); } catch (error) { immutable = error instanceof TripPersistenceError && error.code === "FINALIZED_VERSION_IMMUTABLE"; }
  const database = (await pool.query(`SELECT t.status,v.state,v.finalization_provider,v.version_no,ST_GeometryType(v.route_geom) AS draft_geometry_type,ST_GeometryType(c.route_geom) AS cache_geometry_type,ST_SRID(c.route_geom) AS cache_srid,(SELECT count(*)::int FROM public.trip_stops s WHERE s.trip_version_id=v.id) AS stop_count FROM public.trips t JOIN public.trip_versions v ON v.id=t.current_version_id JOIN public.provider_route_cache c ON c.trip_version_id=v.id WHERE t.id=$1`,[tripId])).rows[0];
  console.log(JSON.stringify({ scenario: long ? "Charlotte-Denver-4-day" : "Charlotte-Washington", orderedStops: [draft.origin.label,...draft.stops.map((stop)=>stop.label),draft.destination.label], draftRoute: draft.summary, hereFinalRoute: first.finalRoute.summary, fetchedAt: first.cache.fetchedAt, expiresAt: first.cache.expiresAt, retrySameVersion: retry.versionId===first.versionId, retrySameFetchedAt: retry.cache.fetchedAt===first.cache.fetchedAt, immutable, database },null,2));
} finally {
  if (tripId) await pool.query("DELETE FROM public.trips WHERE id=$1",[tripId]);
  if (userId) await pool.query("DELETE FROM public.users WHERE id=$1",[userId]);
  await pool.end();
}
