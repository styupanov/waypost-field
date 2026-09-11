import assert from "node:assert/strict";
import { OVERNIGHT_DATABASE_SHORTLIST_LIMIT, OVERNIGHT_RESULT_LIMIT, OVERNIGHT_ROUTING_CONCURRENCY, OVERNIGHT_VALIDATION_LIMIT, overnightTargets, preserveUserOvernightSelections, scoreOvernightCandidate, settlementFeatureEligible, targetWindow, timedRouteWindow } from "../src/lib/overnights/planning.ts";
import type { TimedRouteResponse } from "../src/types/route.ts";

assert.deepEqual(overnightTargets(16_000, 4), [4_000, 8_000, 12_000]);
assert.equal(overnightTargets(16_000, 4).length, 3);
assert.deepEqual(targetWindow(8_000, 16_000), { start: 4_400, end: 11_600 });
assert.deepEqual(targetWindow(1_000, 16_000), { start: 0, end: 4_600 });
assert.equal(settlementFeatureEligible("PPL"), true);
assert.equal(settlementFeatureEligible("PPLA2"), true);
assert.equal(settlementFeatureEligible("PPLQ"), false);
assert.equal(settlementFeatureEligible("PPLX"), false);
const first = scoreOvernightCandidate({ targetTimeDeviationMinutes: 5, detourDurationSeconds: 300, population: 5_000, featureCode: "PPL" });
const repeat = scoreOvernightCandidate({ targetTimeDeviationMinutes: 5, detourDurationSeconds: 300, population: 5_000, featureCode: "PPL" });
assert.deepEqual(first, repeat);
const distantCity = scoreOvernightCandidate({ targetTimeDeviationMinutes: 110, detourDurationSeconds: 4_800, population: 5_000_000, featureCode: "PPLA" });
assert.ok(first.score > distantCity.score, "Population must not dominate timing and detour.");
assert.equal(OVERNIGHT_DATABASE_SHORTLIST_LIMIT, 20);
assert.equal(OVERNIGHT_VALIDATION_LIMIT, 12, "Each night has a deterministic exact-routing ceiling.");
assert.equal(OVERNIGHT_ROUTING_CONCURRENCY, 4, "Exact routing has bounded concurrency.");
assert.equal(OVERNIGHT_RESULT_LIMIT, 5);
assert.equal(preserveUserOvernightSelections(4, 4), true);
assert.equal(preserveUserOvernightSelections(4, 5), false);

const timedRoute = {
  route: { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: [[-80, 35], [-79.5, 35.5], [-79, 36]] } },
  summary: { distanceKm: 150, durationSeconds: 7_200, hasToll: false, hasHighway: true, hasFerry: false },
  timingSegments: [
    { beginShapeIndex: 0, endShapeIndex: 1, beginTimeSeconds: 0, endTimeSeconds: 3_600 },
    { beginShapeIndex: 1, endShapeIndex: 2, beginTimeSeconds: 3_600, endTimeSeconds: 7_200 },
  ],
  waypointArrivalSeconds: [0, 7_200],
} satisfies TimedRouteResponse;
assert.ok(timedRoute.timingSegments.every((segment, index) => index === 0 || segment.beginTimeSeconds === timedRoute.timingSegments[index - 1].endTimeSeconds));
assert.deepEqual(timedRouteWindow(timedRoute, 3_600).target, { lon: -79.5, lat: 35.5 });
assert.deepEqual(timedRouteWindow(timedRoute, 3_600).coordinates, [[-80, 35], [-79.5, 35.5], [-79, 36]]);
console.log("Overnight domain checks passed.");
