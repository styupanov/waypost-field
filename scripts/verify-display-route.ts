import assert from "node:assert/strict";
import { resolveDisplayedTripRoute } from "../src/lib/trip/display-route.ts";
import type { FinalRouteCacheState, TripFinalizationState } from "../src/types/final-route.ts";
import type { RouteFeature } from "../src/types/route.ts";

const inferredRoute: RouteFeature = {
  type: "Feature",
  properties: {},
  geometry: { type: "LineString", coordinates: [[-80, 35], [-79, 36]] },
};
const hereRoute = { type: "LineString" as const, coordinates: [[-81, 34], [-78, 37]] as [number, number][] };
const validCache: FinalRouteCacheState = {
  status: "valid",
  provider: "here",
  fetchedAt: "2026-09-01T00:00:00.000Z",
  expiresAt: "2026-09-08T00:00:00.000Z",
  finalRoute: { route: hereRoute, summary: { distanceKm: 1, durationSeconds: 1, baseDurationSeconds: null } },
};
const expiredCache: FinalRouteCacheState = { status: "expired", provider: "here", fetchedAt: "2026-08-01T00:00:00.000Z", expiresAt: "2026-08-08T00:00:00.000Z" };
const missingCache: FinalRouteCacheState = { status: "missing", provider: "here", fetchedAt: null, expiresAt: null };

function finalized(tripStatus: "planned" | "active" | "completed_unconfirmed" | "traveled" | "not_traveled", cache: FinalRouteCacheState): TripFinalizationState {
  return { status: "planned", result: { tripId: "trip", versionId: "version", tripStatus, startedAt: null, endedAt: null, travelConfirmationAt: null, versionState: "finalized", finalizedAt: "2026-09-01T00:00:00.000Z", provider: "here", cache } };
}

for (const status of ["planned", "active", "completed_unconfirmed", "not_traveled"] as const) {
  const result = resolveDisplayedTripRoute(inferredRoute, finalized(status, validCache), { status: "idle" });
  assert.deepEqual(result?.geometry, hereRoute);
  assert.equal(result?.properties.provider, "here");
}

for (const cache of [validCache, expiredCache, missingCache]) {
  const result = resolveDisplayedTripRoute(inferredRoute, finalized("traveled", cache), { status: "idle" });
  assert.deepEqual(result?.geometry, inferredRoute.geometry);
  assert.notDeepEqual(result?.geometry, hereRoute);
  assert.equal(result?.properties.source, "route_geometry_inferred");
  assert.equal(result?.properties.routeKind, "inferred_traveled");
}

assert.deepEqual(resolveDisplayedTripRoute(inferredRoute, finalized("completed_unconfirmed", expiredCache), { status: "idle" }), inferredRoute);
assert.deepEqual(resolveDisplayedTripRoute(inferredRoute, finalized("completed_unconfirmed", missingCache), { status: "idle" }), inferredRoute);
assert.equal(resolveDisplayedTripRoute(null, finalized("traveled", validCache), { status: "idle" }), null);

const afterUndo = resolveDisplayedTripRoute(inferredRoute, finalized("completed_unconfirmed", validCache), { status: "idle" });
assert.deepEqual(afterUndo?.geometry, hereRoute);
const afterReconfirm = resolveDisplayedTripRoute(inferredRoute, finalized("traveled", validCache), { status: "idle" });
assert.deepEqual(afterReconfirm?.geometry, inferredRoute.geometry);

console.log("Authoritative displayed-route selection matrix passed.");
