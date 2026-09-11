import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { getPostgresPool } from "../src/lib/db/postgres.ts";
import { BASE_H3_RESOLUTION, COVERAGE_SOURCE, MAX_SAMPLE_INTERVAL_METERS, densifyRoute, generateBaseRouteCoverage, routeSegmentMeters } from "../src/lib/coverage/h3-route.ts";
import { completeTrip, confirmTripTravelOutcome, startTrip, TripLifecycleError, undoTripTravelConfirmation } from "../src/lib/trips/lifecycle.ts";
import { setOwnedTripPoiVisit } from "../src/lib/trips/poi-visits.ts";
import { commitOwnedTripFinalization, createTripWithDraft, getOwnedTrip } from "../src/lib/trips/repository.ts";
import { resolveWaypostUserId } from "../src/lib/users/identity.ts";
import type { FinalRoutePreview } from "../src/types/final-route.ts";
import type { DraftAttractionStop, TripDraft } from "../src/types/trip.ts";

const pool = getPostgresPool();
const userIds: string[] = [];
const tripIds: string[] = [];
let attractionId = 0;

const here: FinalRoutePreview = { provider: "here", route: { type: "LineString", coordinates: [[-80, 35], [-79, 36]] }, summary: { distanceKm: 149, durationSeconds: 7000, baseDurationSeconds: 6900 }, diagnostics: { waypointCount: 3, sectionCount: 1, requestDurationMilliseconds: 1 } };

function attraction(): DraftAttractionStop { return { source: "waypost", attractionId, label: "Coverage fixture attraction", coordinates: { lat: 35.5, lon: -79.5 }, category: "park", interestCategory: "nature_scenic", rating: 4.5, reviewCount: 100, duration: "1 hour", visitDuration: { minimumMinutes: 60, maximumMinutes: 60 }, routeProgress: .5, personalizedScore: 80, individualDetourDistanceKm: 2, individualDetourDurationSeconds: 300 }; }
function draft(): TripDraft { return { origin: { label: "A", coordinates: { lat: 35, lon: -80 } }, stop: null, destination: { label: "B", coordinates: { lat: 36, lon: -79 } }, route: { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: [[-80, 35], [-79.5, 35.5], [-79, 36]] } }, summary: { distanceKm: 150, durationSeconds: 7200, hasToll: false, hasHighway: true, hasFerry: false }, baselineSummary: { distanceKm: 150, durationSeconds: 7200, hasToll: false, hasHighway: true, hasFerry: false }, stops: [attraction()], alternatives: [], lastEdit: null, preferences: { preferredCategories: [], excludedCategories: [], detourTolerance: "balanced", stopStyle: "balanced", drivingPace: "balanced", selectedTripDays: 1, tripDaysOverridden: true }, multiDay: { isMultiDay: false, drivingPace: "balanced", recommendedDays: 1, selectedDays: 1, nights: 0, baselineDrivingHours: 2, dayOptions: [1, 2] }, overnightAlternatives: [], dayPlans: [], composition: { targetPoiCount: 1, selectedPoiCount: 1, detourBudgetSeconds: 1000, actualDetourSeconds: 0, actualDetourWasClamped: false, valhallaCallCount: 1, corridorCandidateCount: 1, candidateCountConsidered: 1, candidatesAfterDeduplication: 1, opportunityShortlistSize: 1, candidatePoolTruncated: false, suggestedVisitDuration: { minimumMinutes: 60, maximumMinutes: 60, hasUnknown: false } } }; }
async function user() { const id = await resolveWaypostUserId(`local:route-coverage-test:${randomUUID()}`); userIds.push(id); return id; }
async function create(userId: string) { const trip = await createTripWithDraft(userId, draft()); if (!trip?.currentVersion) throw new Error("fixture failed"); tripIds.push(trip.id); return trip; }
async function completed(userId: string) { const trip = await create(userId); await commitOwnedTripFinalization(userId, trip.id, trip.currentVersion!.id, trip.currentVersion!.updatedAt, here); await startTrip(userId, trip.id); await completeTrip(userId, trip.id); return (await getOwnedTrip(userId, trip.id))!; }
async function rows(versionId: string | null) { assert.ok(versionId); return (await pool.query<{ h3_index: string; h3_resolution: number; coverage_source: string }>("SELECT h3_index,h3_resolution,coverage_source FROM route_coverage WHERE trip_version_id=$1 ORDER BY h3_index", [versionId])).rows; }
function fingerprint(cells: string[]) { return createHash("sha256").update([...cells].sort().join("\n")).digest("hex"); }
async function invariant(tripId: string) { return (await pool.query(`SELECT t.started_at,t.ended_at,t.current_version_id,v.state,v.version_no,encode(ST_AsEWKB(v.route_geom),'hex') route_hash,(SELECT encode(ST_AsEWKB(route_geom),'hex') FROM provider_route_cache WHERE trip_version_id=v.id) cache_hash,(SELECT balance FROM trip_credit_accounts WHERE user_id=t.user_id) balance,(SELECT count(*)::int FROM trip_credit_ledger WHERE user_id=t.user_id) ledger_count FROM trips t JOIN trip_versions v ON v.id=t.current_version_id WHERE t.id=$1`, [tripId])).rows[0]; }

try {
  attractionId = Number((await pool.query("SELECT id FROM attractions ORDER BY id LIMIT 1")).rows[0]?.id); assert.ok(attractionId);
  assert.equal(BASE_H3_RESOLUTION, 10); assert.equal(MAX_SAMPLE_INTERVAL_METERS, 75); assert.equal(COVERAGE_SOURCE, "route_geometry_inferred");
  assert.throws(() => generateBaseRouteCoverage({ type: "Point", coordinates: [-80, 35] }), /LineString/);
  const line = { type: "LineString" as const, coordinates: [[-80, 35], [-79, 36]] as [number, number][] };
  const generated = generateBaseRouteCoverage(line); const generatedAgain = generateBaseRouteCoverage(line);
  assert.ok(generated.cells.length > 0); assert.equal(new Set(generated.cells).size, generated.cells.length); assert.deepEqual(generated.cells, generatedAgain.cells); assert.equal(fingerprint(generated.cells), fingerprint(generatedAgain.cells));
  const densified = densifyRoute(line.coordinates); for (let index = 1; index < densified.sampled.length; index += 1) assert.ok(routeSegmentMeters(densified.sampled[index - 1], densified.sampled[index]) <= MAX_SAMPLE_INTERVAL_METERS + .001);

  const owner = await user(); const tripA = await completed(owner); assert.equal((await rows(tripA.currentVersionId)).length, 0);
  const traveledA = await confirmTripTravelOutcome(owner, tripA.id, "traveled"); const coverageA = await rows(tripA.currentVersionId); assert.equal(traveledA.status, "traveled"); assert.ok(coverageA.length > 0); assert.ok(coverageA.every(row => row.h3_resolution === 10 && row.coverage_source === "route_geometry_inferred"));
  const firstFingerprint = fingerprint(coverageA.map(row => row.h3_index)); const firstConfirmedAt = traveledA.travelConfirmationAt;
  const retry = await confirmTripTravelOutcome(owner, tripA.id, "traveled"); assert.equal(retry.travelConfirmationAt, firstConfirmedAt); assert.deepEqual(await rows(tripA.currentVersionId), coverageA);
  const visitStop = (await pool.query<{ id: string }>("SELECT id FROM trip_stops WHERE trip_version_id=$1 AND stop_type='attraction'", [tripA.currentVersionId])).rows[0].id; await setOwnedTripPoiVisit(owner, tripA.id, visitStop, "visited");

  await pool.query("INSERT INTO trip_credit_ledger(user_id,amount,entry_type,idempotency_key) VALUES($1,1,'welcome_grant',$2)", [owner, `route-coverage-overlap:${owner}`]); await pool.query("UPDATE trip_credit_accounts SET balance=balance+1 WHERE user_id=$1", [owner]);
  const tripB = await completed(owner); await confirmTripTravelOutcome(owner, tripB.id, "traveled"); const coverageB = await rows(tripB.currentVersionId); const overlap = coverageA.filter(row => coverageB.some(other => other.h3_index === row.h3_index)); assert.ok(overlap.length > 0);
  const beforeUndo = await invariant(tripA.id); await undoTripTravelConfirmation(owner, tripA.id); assert.equal((await rows(tripA.currentVersionId)).length, 0); assert.deepEqual(await rows(tripB.currentVersionId), coverageB); assert.ok((await pool.query("SELECT 1 FROM route_coverage WHERE user_id=$1 AND h3_index=$2", [owner, overlap[0].h3_index])).rowCount); assert.equal((await pool.query("SELECT count(*)::int AS count FROM trip_poi_visit_confirmations WHERE trip_version_id=$1", [tripA.currentVersionId])).rows[0].count, 0); assert.deepEqual(await invariant(tripA.id), beforeUndo);
  await confirmTripTravelOutcome(owner, tripA.id, "traveled"); const regenerated = await rows(tripA.currentVersionId); assert.equal(fingerprint(regenerated.map(row => row.h3_index)), firstFingerprint);

  const notOwner = await user(); const notTrip = await completed(notOwner); await confirmTripTravelOutcome(notOwner, notTrip.id, "not_traveled"); assert.equal((await rows(notTrip.currentVersionId)).length, 0);
  const invalidOwner = await user(); const invalid = await create(invalidOwner); await assert.rejects(() => confirmTripTravelOutcome(invalidOwner, invalid.id, "traveled"), (error: unknown) => error instanceof TripLifecycleError && error.code === "TRIP_NOT_AWAITING_CONFIRMATION"); assert.equal((await rows(invalid.currentVersionId)).length, 0);
  await commitOwnedTripFinalization(invalidOwner, invalid.id, invalid.currentVersion!.id, invalid.currentVersion!.updatedAt, here); await assert.rejects(() => confirmTripTravelOutcome(invalidOwner, invalid.id, "traveled")); await startTrip(invalidOwner, invalid.id); await assert.rejects(() => confirmTripTravelOutcome(invalidOwner, invalid.id, "traveled")); await completeTrip(invalidOwner, invalid.id); assert.equal((await rows(invalid.currentVersionId)).length, 0);
  assert.equal((await getOwnedTrip(owner, tripA.id))?.status, "traveled"); assert.deepEqual(await rows(tripA.currentVersionId), regenerated);
  console.log(JSON.stringify({ baseResolution: BASE_H3_RESOLUTION, maximumSampleIntervalMeters: MAX_SAMPLE_INTERVAL_METERS, source: COVERAGE_SOURCE, cellsPerFixtureTrip: coverageA.length, fingerprint: firstFingerprint, overlappingCells: overlap.length, assertions: "passed" }, null, 2));
} finally {
  for (const id of tripIds) await pool.query("DELETE FROM trips WHERE id=$1", [id]);
  if (userIds.length) await pool.query("DELETE FROM users WHERE id=ANY($1::uuid[])", [userIds]);
  await pool.end();
}
