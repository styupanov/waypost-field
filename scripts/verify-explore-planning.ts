import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { cellToBoundary, getResolution, latLngToCell } from "h3-js";
import { DRIVING_HOURS_BY_PACE, EXPLORE_EXACT_ROUTE_LIMIT, EXPLORE_RESULT_LIMIT, EXPLORE_ROUTING_CONCURRENCY, EXPLORE_STATIC_SHORTLIST_SIZE, exploreDrivingBudgetSeconds, exploreRouteFitsBudget, mapWithConcurrency } from "../src/lib/explore-planning/domain.ts";
import { generateExploreIdeasWithDependencies } from "../src/lib/explore-planning/service.ts";
import { parseExplorePlanningRequest } from "../src/lib/explore-planning/validation.ts";
import { calculateTripDayRecommendation } from "../src/lib/trip/multi-day.ts";
import { countAttractionStops } from "../src/lib/trip/summary.ts";
import type { DraftAttractionStop, DraftUserAttractionStop, DraftWaypostStop } from "../src/types/trip.ts";

const cell = latLngToCell(38.9, -77.03, 7);
const valid = { area: { h3Index: cell, resolution: 7 }, origin: { latitude: 35.2271, longitude: -80.8431, label: "Charlotte" }, availableDays: 2, drivingPace: "balanced", interests: ["nature_scenic"] };
assert.deepEqual(parseExplorePlanningRequest(valid), valid);
assert.equal(getResolution(cell), 7);
assert.ok(cellToBoundary(cell).length >= 6, "H3 area reconstructs as a polygon.");
assert.equal(exploreDrivingBudgetSeconds(2, "balanced"), 16 * 3600);
assert.equal(exploreDrivingBudgetSeconds(1, "easy"), DRIVING_HOURS_BY_PACE.easy * 3600);
assert.ok(EXPLORE_STATIC_SHORTLIST_SIZE >= 20 && EXPLORE_STATIC_SHORTLIST_SIZE <= 30);
assert.equal(EXPLORE_RESULT_LIMIT, 3);
assert.ok(EXPLORE_ROUTING_CONCURRENCY > 0 && EXPLORE_ROUTING_CONCURRENCY <= 5);
assert.ok(16 * 3600 <= exploreDrivingBudgetSeconds(2, "balanced"), "Exact boundary time is accepted by <= comparison.");
assert.ok(16 * 3600 + 1 > exploreDrivingBudgetSeconds(2, "balanced"), "Over-budget route is rejected.");
const twelveHours = exploreDrivingBudgetSeconds(2, "easy");
assert.equal(exploreRouteFitsBudget(7 * 3600, twelveHours), true, "The outbound leg alone would fit.");
assert.equal(exploreRouteFitsBudget(14 * 3600, twelveHours), false, "The actual loop is rejected when its total exceeds the budget.");
assert.equal(exploreRouteFitsBudget(12 * 3600, twelveHours), true, "Exact loop boundary is accepted.");
const shortPlan = calculateTripDayRecommendation(7 * 3600, { drivingPace: "easy", selectedTripDays: null, tripDaysOverridden: false });
assert.deepEqual({ isMultiDay: shortPlan.isMultiDay, selectedDays: shortPlan.selectedDays, nights: shortPlan.nights }, { isMultiDay: false, selectedDays: 1, nights: 0 });
const loopPlan = calculateTripDayRecommendation(14 * 3600, { drivingPace: "easy", selectedTripDays: null, tripDaysOverridden: false });
assert.equal(loopPlan.isMultiDay, true); assert.equal(loopPlan.nights, loopPlan.selectedDays - 1);
function minimalAttraction(source: "waypost", id: number): DraftWaypostStop;
function minimalAttraction(source: "user_attraction", id: number): DraftUserAttractionStop;
function minimalAttraction(source: "waypost" | "user_attraction", id: number): DraftAttractionStop {
  return { source, attractionId: id, label: `Attraction ${id}`, coordinates: { lat: 1, lon: 1 }, category: "Museums", interestCategory: "museums_culture", rating: 5, reviewCount: 10, duration: null, visitDuration: null, routeProgress: 0.5, personalizedScore: 80, individualDetourDistanceKm: 1, individualDetourDurationSeconds: 60 } as DraftAttractionStop;
}
assert.equal(countAttractionStops({ stops: [minimalAttraction("user_attraction", 1), minimalAttraction("user_attraction", 2)] }), 2);
assert.equal(countAttractionStops({ stops: [minimalAttraction("user_attraction", 1), minimalAttraction("waypost", 2), { source: "user", label: "Waypoint", coordinates: { lat: 1, lon: 1 } }] }), 2);

for (const invalid of [
  { ...valid, availableDays: 4 },
  { ...valid, drivingPace: "fast" },
  { ...valid, interests: ["nature_scenic", "nature_scenic"] },
  { ...valid, interests: ["unknown"] },
  { ...valid, area: { ...valid.area, resolution: 8 } },
  { ...valid, origin: { ...valid.origin, latitude: 91 } },
  { ...valid, user_id: "forbidden" },
]) assert.equal(parseExplorePlanningRequest(invalid), null);

let active = 0; let peak = 0;
const concurrent = await mapWithConcurrency([1,2,3,4,5,6,7], 3, async (value) => { active += 1; peak = Math.max(peak, active); await new Promise((resolve) => setTimeout(resolve, 2)); active -= 1; return value * 2; });
assert.deepEqual(concurrent, [2,4,6,8,10,12,14]); assert.ok(peak <= 3);

const candidates = Array.from({ length: 6 }, (_, index) => ({ id: index + 1, name: `Place ${index + 1}`, category: "Nature & Parks", rating: 4.5, reviewCount: 100, latitude: 38.9 + index / 1000, longitude: -77.03, duration: null, qualityScore: 90 - index }));
const easyRequest = parseExplorePlanningRequest({ ...valid, drivingPace: "easy" })!;
let exactCalls = 0;
const allOverBudget = await generateExploreIdeasWithDependencies(easyRequest, {
  findCandidates: async () => ({ candidates, totalCount: candidates.length }),
  calculateMatrix: async () => candidates.map(() => ({ outbound: { durationSeconds: 7 * 3600, distanceKm: 500 }, inbound: { durationSeconds: 7 * 3600, distanceKm: 500 } })),
  calculateExactRoute: async () => { exactCalls += 1; throw new Error("Exact route must not run after authoritative matrix rejection."); },
  exactRouteProvider: () => "here",
});
assert.equal(allOverBudget.outcome, "outside_driving_budget"); assert.equal(exactCalls, 0);
const feasible = await generateExploreIdeasWithDependencies(easyRequest, {
  findCandidates: async () => ({ candidates, totalCount: candidates.length }),
  calculateMatrix: async () => candidates.map(() => ({ outbound: { durationSeconds: 4 * 3600, distanceKm: 300 }, inbound: { durationSeconds: 4 * 3600, distanceKm: 300 } })),
  calculateExactRoute: async () => { exactCalls += 1; return { route: { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: [[0,0],[1,1]] } }, summary: { durationSeconds: 9 * 3600, distanceKm: 999, hasToll: false, hasHighway: true, hasFerry: false } }; },
  exactRouteProvider: () => "here",
});
assert.equal(feasible.outcome, "ideas"); assert.equal(feasible.ideas.length, 3); assert.ok(exactCalls <= EXPLORE_EXACT_ROUTE_LIMIT);
assert.equal(feasible.ideas[0].route.durationSeconds, 9 * 3600, "Displayed duration comes from exact route, not matrix screening.");
assert.equal(feasible.ideas[0].route.distanceMeters, 999_000, "Displayed distance comes from exact route, not matrix screening.");

const repository = readFileSync(new URL("../src/lib/explore-planning/repository.ts", import.meta.url), "utf8");
const service = readFileSync(new URL("../src/lib/explore-planning/service.ts", import.meta.url), "utf8");
const api = readFileSync(new URL("../src/app/api/explore/ideas/route.ts", import.meta.url), "utf8");
const panel = readFileSync(new URL("../src/components/trip/ExplorePlanningPanel.tsx", import.meta.url), "utf8");
const planner = readFileSync(new URL("../src/components/trip/TripPlanner.tsx", import.meta.url), "utf8");
const summary = readFileSync(new URL("../src/components/trip/TripSummary.tsx", import.meta.url), "utf8");
const composition = readFileSync(new URL("../src/lib/trip/composition.ts", import.meta.url), "utf8");
assert.match(repository, /source_group = 'attractions'/); assert.doesNotMatch(repository, /source_group = 'restaurants'/);
assert.match(repository, /ST_Covers\(area\.geom, a\.geom::geometry\)/, "Exact polygon containment is authoritative.");
assert.match(repository, /review_count[\s\S]*mean_rating/, "Bayesian rating/review quality is used.");
assert.match(repository, /source_mean AS MATERIALIZED/, "The global source mean must be evaluated once rather than once per eligible row.");
assert.match(repository, /\$2::boolean OR a\.category = ANY/, "Empty interests are generic; selected interests filter source categories.");
assert.match(service, /calculateReturnTripMatrix/); assert.match(service, /routingProvider\.route/); assert.match(service, /exactRouteProvider/); assert.doesNotMatch(service, /calculateHere|haversine|centroid/i);
assert.match(service, /exploreRouteFitsBudget\(response\.summary\.durationSeconds, budget\)/); assert.match(service, /response\.summary\.distanceKm/);
assert.match(service, /calculateExactRoute\(\[origin, \{ lat: candidate\.latitude, lon: candidate\.longitude \}, origin\]\)/, "The selected exact-route provider receives origin, real attraction, origin.");
assert.match(api, /authenticatedWaypostUserId/); assert.match(api, /status: 401/); assert.match(api, /status: 400/);
assert.match(panel, /AbortController/); assert.match(panel, /sequence/); assert.match(panel, /Find trip ideas/); assert.match(panel, /Build this trip/);
assert.doesNotMatch(panel, /VALHALLA_URL|HERE_API/); assert.doesNotMatch(panel, /PUT[\s\S]*\/api\/me\/interests/);
assert.match(planner, /router\.push\("\/\?mode=planner"\)/);
assert.match(planner, /preferredCategories: \[\.\.\.interests\]/); assert.match(planner, /autoBuildRequestId/);
assert.match(planner, /intentRole: "primary_anchor"/); assert.match(planner, /setDestination\(\{[\s\S]*\.\.\.exploreOrigin/);
assert.match(composition, /intentRole === "primary_anchor"[\s\S]*primaryAnchor\.coordinates/);
assert.match(summary, /countAttractionStops\(draft\)/);
assert.doesNotMatch(service, /Trip Credit|\/api\/trips|finaliz/i);
console.log("Explore Planning validation, H3 containment, source scope, budget, concurrency, routing, interest isolation, and Planner bridge checks passed.");
