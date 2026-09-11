import assert from "node:assert/strict";
import { ATTRACTION_EXACT_VALIDATION_LIMIT, findAttractionOpportunitiesWithDependencies } from "../src/lib/attractions/opportunities.ts";
import type { AttractionCandidate } from "../src/types/attractions.ts";
import type { RouteResponse } from "../src/types/route.ts";
import type { OpportunityQuery } from "../src/lib/attractions/opportunities.ts";

const candidates: AttractionCandidate[] = Array.from({ length: 10 }, (_, index) => ({
  id: index + 1, name: `Candidate ${index + 1}`, category: "Museums", rating: 4.5, reviewCount: 100,
  lat: 35.1 + index / 100, lon: -80, sourceGroup: "attractions", duration: null, distanceToRouteMeters: 1_000,
}));
const baseline: RouteResponse = {
  route: { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: [[-80, 35], [-79, 36]] } },
  summary: { distanceKm: 100, durationSeconds: 1_000, hasToll: false, hasHighway: false, hasFerry: false },
};
const query: OpportunityQuery = {
  locations: [{ lat: 35, lon: -80 }, { lat: 36, lon: -79 }], route: baseline.route.geometry,
  corridorMeters: 25_000,
  preferences: { preferredCategories: [], excludedCategories: [], detourTolerance: "balanced", stopStyle: "balanced", drivingPace: "balanced", selectedTripDays: 1, tripDaysOverridden: true },
};

let matrixCalls = 0; const exactIds: number[] = [];
const result = await findAttractionOpportunitiesWithDependencies(query, { baselineRoute: baseline }, {
  findCandidates: async () => ({ candidates, totalCount: candidates.length, truncated: false }),
  findMeanRating: async () => 4,
  calculateMatrix: async (sources, targets) => {
    matrixCalls += 1;
    if (sources.length === 1) return [targets.map((_, index) => index === 8 ? null : ({ durationSeconds: (20 - index) * 100, distanceKm: 60, sourceIndex: 0, targetIndex: index }))];
    return sources.map((_, index) => [index === 8 ? null : ({ durationSeconds: (20 - index) * 100, distanceKm: 60, sourceIndex: index, targetIndex: 0 })]);
  },
  calculateRoute: async (locations) => {
    const id = Math.round((locations[1].lat - 35.1) * 100) + 1; exactIds.push(id);
    return { ...baseline, summary: { ...baseline.summary, distanceKm: 100 + id, durationSeconds: 1_000 + id * 10 } };
  },
});
assert.equal(matrixCalls, 2); assert.equal(result.diagnostics.matrixRequestCount, 2); assert.equal(result.diagnostics.matrixSucceeded, true);
assert.equal(result.diagnostics.matrixReachableCandidateCount, 9); assert.equal(result.candidateRoutesEvaluated, ATTRACTION_EXACT_VALIDATION_LIMIT);
assert.equal(exactIds.length, 8); assert.equal(exactIds[0], 10, "Matrix estimates rank the cheapest reachable candidate first.");
assert.ok(!exactIds.includes(9), "An unreachable matrix candidate is not sent to exact routing.");
assert.deepEqual(result.opportunities.map((item) => item.attraction.id), [...result.opportunities.map((item) => item.attraction.id)].sort((a, b) => a - b), "Final exact scoring retains deterministic ordering.");

let fallbackExactCalls = 0;
const fallback = await findAttractionOpportunitiesWithDependencies(query, { baselineRoute: baseline }, {
  findCandidates: async () => ({ candidates, totalCount: candidates.length, truncated: false }), findMeanRating: async () => 4,
  calculateMatrix: async () => { throw new Error("matrix unavailable"); },
  calculateRoute: async () => { fallbackExactCalls += 1; return baseline; },
});
assert.equal(fallback.diagnostics.matrixSucceeded, false); assert.equal(fallback.diagnostics.matrixRequestCount, 2);
assert.equal(fallbackExactCalls, ATTRACTION_EXACT_VALIDATION_LIMIT, "Matrix failure falls back to a bounded quality shortlist.");

let budgetCalls = 0;
const budget = await findAttractionOpportunitiesWithDependencies({ ...query }, { baselineRoute: baseline, validationLimit: 1 }, {
  findCandidates: async () => ({ candidates: candidates.slice(0, 1), totalCount: 1, truncated: false }), findMeanRating: async () => 4,
  calculateMatrix: async (sources, targets) => Array.from({ length: sources.length }, (_, sourceIndex) => Array.from({ length: targets.length }, (_, targetIndex) => ({ durationSeconds: 500, distanceKm: 50, sourceIndex, targetIndex }))),
  calculateRoute: async () => { budgetCalls += 1; return { ...baseline, summary: { ...baseline.summary, distanceKm: 301, durationSeconds: 1_001 } }; },
});
assert.equal(budgetCalls, 1); assert.equal(budget.opportunities.length, 0, "Exact detour budget remains authoritative after matrix ranking.");
console.log("Attraction matrix ranking, unreachable/fallback handling, exact top-N cap, detour budget, and stable ordering checks passed.");
