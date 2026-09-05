import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { coverageBoundsResponseForUser } from "../src/lib/coverage/coverage-bounds-response.ts";
import { PERSONAL_MAP_COVERAGE_STYLE, TRIP_COVERAGE_STYLE, coverageStyleForMode } from "../src/lib/coverage/coverage-style.ts";
import { getPostgresPool } from "../src/lib/db/postgres.ts";
import { resolveWorkspaceMode, showsTripWorkspace } from "../src/lib/trip/workspace-mode.ts";

const pool = getPostgresPool();
const denverTripId = "e7fb94f7-c9eb-4ef6-bfed-ef36ec76b68b";

try {
  assert.equal(resolveWorkspaceMode({ authenticated: true, requestedTripId: null, requestedMode: null }), "personal_map");
  assert.equal(resolveWorkspaceMode({ authenticated: false, requestedTripId: null, requestedMode: null }), "planner");
  assert.equal(resolveWorkspaceMode({ authenticated: true, requestedTripId: denverTripId, requestedMode: null }), "trip");
  assert.equal(showsTripWorkspace("personal_map"), false);
  assert.equal(showsTripWorkspace("trip"), true);
  assert.equal(showsTripWorkspace("planner"), true);
  assert.deepEqual(coverageStyleForMode(true), PERSONAL_MAP_COVERAGE_STYLE);
  assert.deepEqual(coverageStyleForMode(false), TRIP_COVERAGE_STYLE);
  assert.equal(PERSONAL_MAP_COVERAGE_STYLE.fillOpacity, 0);
  assert.equal(PERSONAL_MAP_COVERAGE_STYLE.outlineOpacity, 0);
  assert.ok(TRIP_COVERAGE_STYLE.fillOpacity > 0 && TRIP_COVERAGE_STYLE.outlineOpacity > 0);

  const trip = (await pool.query<{ user_id: string; status: string }>("SELECT user_id,status FROM public.trips WHERE id=$1", [denverTripId])).rows[0];
  assert.ok(trip);
  assert.equal(trip.status, "traveled");
  const before = (await pool.query(
    "SELECT (SELECT count(*)::int FROM public.trips) trip_count,(SELECT count(*)::int FROM public.route_coverage) coverage_count,(SELECT COALESCE(sum(balance),0)::int FROM public.trip_credit_accounts) credit_balance"
  )).rows[0];

  const response = await coverageBoundsResponseForUser(trip.user_id);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.hasCoverage, true);
  assert.ok(body.bounds.west < body.bounds.east && body.bounds.south < body.bounds.north);
  assert.ok(!JSON.stringify(body).includes("trip_version_id") && !JSON.stringify(body).includes("user_id"));

  const emptyResponse = await coverageBoundsResponseForUser(randomUUID());
  assert.equal(emptyResponse.status, 200);
  assert.deepEqual(await emptyResponse.json(), { hasCoverage: false, bounds: null });
  assert.equal((await coverageBoundsResponseForUser(null)).status, 401);

  const after = (await pool.query(
    "SELECT (SELECT count(*)::int FROM public.trips) trip_count,(SELECT count(*)::int FROM public.route_coverage) coverage_count,(SELECT COALESCE(sum(balance),0)::int FROM public.trip_credit_accounts) credit_balance"
  )).rows[0];
  assert.deepEqual(after, before);
  assert.equal((await pool.query("SELECT status FROM public.trips WHERE id=$1", [denverTripId])).rows[0].status, "traveled");
  console.log("Personal Map entry modes, route-free composition predicate, styling, auth, empty state, bounds, and read-only invariants passed.");
} finally {
  await pool.end();
}
