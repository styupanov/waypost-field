import assert from "node:assert/strict";
import { OVERNIGHT_DATABASE_SHORTLIST_LIMIT, OVERNIGHT_RESULT_LIMIT, overnightTargets, scoreOvernightCandidate, settlementFeatureEligible, targetWindow } from "../src/lib/overnights/planning.ts";

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
assert.equal(OVERNIGHT_RESULT_LIMIT, 5);
console.log("Overnight domain checks passed.");
