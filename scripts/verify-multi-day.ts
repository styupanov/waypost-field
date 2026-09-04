import assert from "node:assert/strict";
import { calculateTripDayRecommendation, MULTI_DAY_THRESHOLD_SECONDS, normalizePlanningPreferences, tripDayOptions } from "../src/lib/trip/multi-day.ts";

const base = { selectedTripDays: null, tripDaysOverridden: false };
assert.equal(calculateTripDayRecommendation(27 * 3600, { ...base, drivingPace: "easy" }).recommendedDays, 5);
assert.equal(calculateTripDayRecommendation(27 * 3600, { ...base, drivingPace: "balanced" }).recommendedDays, 4);
assert.equal(calculateTripDayRecommendation(27 * 3600, { ...base, drivingPace: "road_trip" }).recommendedDays, 3);
assert.equal(calculateTripDayRecommendation(7 * 3600, { ...base, drivingPace: "balanced" }).isMultiDay, false);
assert.equal(calculateTripDayRecommendation(10 * 3600, { ...base, drivingPace: "balanced" }).isMultiDay, false);
assert.equal(calculateTripDayRecommendation(MULTI_DAY_THRESHOLD_SECONDS + 1, { ...base, drivingPace: "balanced" }).isMultiDay, true);
assert.deepEqual(tripDayOptions(27 * 3600, "balanced"), [3, 4, 5]);
assert.equal(calculateTripDayRecommendation(27 * 3600, { drivingPace: "easy", selectedTripDays: 4, tripDaysOverridden: true }).selectedDays, 4);
assert.equal(calculateTripDayRecommendation(27 * 3600, { drivingPace: "road_trip", selectedTripDays: 2, tripDaysOverridden: true }).selectedDays, 3);
assert.equal(normalizePlanningPreferences({}).drivingPace, "balanced");
console.log("Multi-day domain checks passed.");
