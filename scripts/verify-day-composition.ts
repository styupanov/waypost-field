import assert from "node:assert/strict";
import { normalizeAttractionName } from "../src/lib/attractions/deduplication.ts";
import { allocateDayQuotas, assignHardStopsToDays, constructDayBoundaries, dayAutoDetourBudget, removeWeakestAutomatic } from "../src/lib/trip/day-planning.ts";
import type { TripDraft } from "../src/types/trip.ts";

const point = (lat: number, lon: number) => ({ lat, lon });
const userAttraction = { source: "user_attraction" as const, attractionId: 10, label: "Hard stop", coordinates: point(1, 1), category: "museum", interestCategory: "culture_history" as const, rating: 4.5, reviewCount: 20, duration: "1 hour", visitDuration: { minimumMinutes: 60, maximumMinutes: 60 }, routeProgress: 0.2, personalizedScore: 80, individualDetourDistanceKm: 1, individualDetourDurationSeconds: 60 };
const overnight = { type: "overnight" as const, source: "waypost" as const, nightIndex: 1, geonameId: 1, label: "Boundary", admin1Code: "AA", countryCode: "US", featureCode: "PPL", population: 1_000, coordinates: point(2, 2), targetDrivingSeconds: 10, arrivalDrivingSeconds: 10, targetTimeDeviationMinutes: 0, detourDurationSeconds: 0, detourDistanceKm: 0, score: 90 };
const secondHard = { ...userAttraction, attractionId: 11, label: "Second hard stop", coordinates: point(3, 3) };
const draft = { origin: { label: "Origin", coordinates: point(0, 0) }, destination: { label: "Destination", coordinates: point(4, 4) }, stops: [userAttraction, overnight, secondHard] } as TripDraft;

const boundaries = constructDayBoundaries(draft);
assert.equal(boundaries.length, 2);
assert.equal(boundaries[0].end.kind, "overnight");
assert.equal(boundaries[1].start.nightIndex, 1);
const assigned = assignHardStopsToDays(draft);
assert.deepEqual(assigned.get(1)?.map((stop) => stop.label), ["Hard stop"]);
assert.deepEqual(assigned.get(2)?.map((stop) => stop.label), ["Second hard stop"]);

const quotas = allocateDayQuotas([{ dayIndex: 1, viableCount: 3, suitability: 70 }, { dayIndex: 2, viableCount: 0, suitability: 100 }, { dayIndex: 3, viableCount: 2, suitability: 90 }, { dayIndex: 4, viableCount: 2, suitability: 80 }], 5);
assert.deepEqual([...quotas.entries()], [[1, 1], [2, 0], [3, 2], [4, 2]]);
assert.equal([...quotas.values()].reduce((sum, value) => sum + value, 0), 5, "A day without viable candidates must not be forced to fill quota.");
assert.equal(dayAutoDetourBudget(10_000), 1_500);
assert.equal(dayAutoDetourBudget(100_000), 3_600);

const selected = [{ id: 1, score: 70 }, { id: 2, score: 50 }];
assert.deepEqual(removeWeakestAutomatic(selected), [{ id: 1, score: 70 }]);
assert.equal(assigned.get(1)?.some((stop) => stop.source === "user_attraction" && stop.attractionId === 10), true, "Day fallback operates on a separate automatic selection and cannot remove hard stops.");
assert.equal(normalizeAttractionName("Museum—One"), normalizeAttractionName("museum one"), "The existing conservative name normalization remains the trip-wide duplicate key.");
assert.deepEqual(draft.stops.map((stop) => stop.label), ["Hard stop", "Boundary", "Second hard stop"], "The persisted itinerary order remains the day-membership source.");

console.log("Day-aware composition domain checks passed.");
