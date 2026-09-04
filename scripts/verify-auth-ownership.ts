import { randomUUID } from "node:crypto";
import { getPostgresPool } from "../src/lib/db/postgres.ts";
import { resolveWaypostUserId } from "../src/lib/users/identity.ts";
import { createTripWithDraft, getOwnedTrip, listTripsForUser, saveOwnedCurrentDraftVersion } from "../src/lib/trips/repository.ts";
import type { TripDraft } from "../src/types/trip.ts";

const suffix = randomUUID();
const subjectA = `local:ownership-a:${suffix}`;
const subjectB = `local:ownership-b:${suffix}`;
const pool = getPostgresPool();
let tripId: string | null = null;
let userA: string | null = null;
let userB: string | null = null;
const draft: TripDraft = {
  origin: { label: "A", coordinates: { lat: 35, lon: -80 } }, stop: null,
  destination: { label: "B", coordinates: { lat: 36, lon: -79 } },
  route: { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: [[-80, 35], [-79, 36]] } },
  summary: { distanceKm: 150, durationSeconds: 7200, hasToll: false, hasHighway: true, hasFerry: false },
  baselineSummary: { distanceKm: 150, durationSeconds: 7200, hasToll: false, hasHighway: true, hasFerry: false },
  stops: [], alternatives: [], lastEdit: null,
  preferences: { preferredCategories: [], excludedCategories: [], detourTolerance: "balanced", stopStyle: "balanced" },
  composition: { targetPoiCount: 1, selectedPoiCount: 0, detourBudgetSeconds: 1200, actualDetourSeconds: 0, actualDetourWasClamped: false, valhallaCallCount: 1, corridorCandidateCount: 0, candidateCountConsidered: 0, candidatesAfterDeduplication: 0, opportunityShortlistSize: 0, candidatePoolTruncated: false, suggestedVisitDuration: { minimumMinutes: 0, maximumMinutes: 0, hasUnknown: false } },
};

try {
  userA = await resolveWaypostUserId(subjectA);
  const repeatedA = await resolveWaypostUserId(subjectA);
  userB = await resolveWaypostUserId(subjectB);
  const trip = await createTripWithDraft(userA, draft);
  if (!trip?.currentVersion) throw new Error("Trip creation failed.");
  tripId = trip.id;
  const versionId = trip.currentVersion.id;
  const ownerCanRead = Boolean(await getOwnedTrip(userA, tripId));
  const otherUserCanRead = Boolean(await getOwnedTrip(userB, tripId));
  const [userATrips, userBTrips] = await Promise.all([listTripsForUser(userA), listTripsForUser(userB)]);
  const saved = await saveOwnedCurrentDraftVersion(userA, tripId, draft);
  const listPayloadHasRouteGeometry = Object.hasOwn(userATrips[0] ?? {}, "route");
  console.log(JSON.stringify({ repeatedIdentityStable: userA === repeatedA, ownerCanRead, otherUserDenied: !otherUserCanRead, userATripCount: userATrips.length, userBTripCount: userBTrips.length, listIsolation: userATrips.length === 1 && userBTrips.length === 0, listPayloadHasRouteGeometry, sameTripVersion: saved.id === versionId, versionNo: saved.versionNo }, null, 2));
} finally {
  if (tripId) await pool.query("DELETE FROM public.trips WHERE id=$1", [tripId]);
  if (userA || userB) await pool.query("DELETE FROM public.users WHERE id = ANY($1::uuid[])", [[userA, userB].filter(Boolean)]);
  await pool.end();
}
