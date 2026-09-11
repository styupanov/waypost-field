import assert from "node:assert/strict";
import { calculateHerePlanningRoute } from "../src/lib/routing/here-planning.ts";
import { calculateHereMatrix, HERE_MATRIX_PROFILE } from "../src/lib/routing/here-matrix.ts";
import { HereRoutingError } from "../src/lib/routing/here-client.ts";
import { concatenateSectionCoordinates, normalizeHerePlanningResponse } from "../src/lib/routing/here-normalization.ts";
import type { RoutingProvider } from "../src/lib/routing/routing-provider.ts";

const polyline = "BFoz5xJ67i1B1B7PzIhaxL7Y";
const routePayload = { routes: [{ sections: [
  { polyline, summary: { length: 1_000, duration: 100 }, spans: [{ offset: 0, carAttributes: ["open", "tollRoad"], streetAttributes: ["controlledAccessHighway"] }], transport: { mode: "car" } },
  { polyline, summary: { length: 2_000, duration: 200 }, spans: [], transport: { mode: "ferry" } },
] }] };
const route = normalizeHerePlanningResponse(routePayload);
assert.equal(route.route.type, "Feature");
assert.equal(route.route.geometry.type, "LineString");
assert.deepEqual(route.route.geometry.coordinates[0], [8.69821, 50.10228], "GeoJSON uses longitude, latitude order");
assert.equal(route.route.geometry.coordinates.length, 8, "Every section is decoded");
assert.equal(route.summary.distanceKm, 3);
assert.equal(route.summary.durationSeconds, 300);
assert.equal(route.summary.hasToll, true);
assert.equal(route.summary.hasHighway, true);
assert.equal(route.summary.hasFerry, true);
assert.deepEqual(concatenateSectionCoordinates([[[1, 2], [3, 4]], [[3, 4], [5, 6]]]), [[1, 2], [3, 4], [5, 6]]);

let planningUrl: URL | undefined;
const planning = await calculateHerePlanningRoute([{ lat: 1, lon: 2 }, { lat: 3, lon: 4 }, { lat: 5, lon: 6 }], {
  apiKey: "do-not-expose",
  fetchImpl: async (input) => { planningUrl = new URL(String(input)); return Response.json(routePayload); },
});
assert.equal(planning.summary.distanceKm, 3);
assert.equal(planningUrl!.searchParams.get("spans"), "carAttributes,streetAttributes");
assert.ok(!planningUrl!.searchParams.get("spans")!.includes("roadAttributes"), "Unsupported roadAttributes must not be requested");
assert.equal(planningUrl!.searchParams.get("departureTime"), "any");
assert.deepEqual(planningUrl!.searchParams.getAll("via"), ["3,4"]);

const oneToManyPayload = { matrix: { numOrigins: 1, numDestinations: 3, travelTimes: [10, 20, 30], distances: [1_000, 2_000, 3_000], errorCodes: [0, 1, 0] } };
let matrixUrl: URL | undefined;
let matrixBody: Record<string, unknown> | undefined;
const oneToMany = await calculateHereMatrix([{ lat: 1, lon: 2 }], [{ lat: 3, lon: 4 }, { lat: 5, lon: 6 }, { lat: 7, lon: 8 }], {
  apiKey: "matrix-secret",
  fetchImpl: async (input, init) => { matrixUrl = new URL(String(input)); matrixBody = JSON.parse(String(init?.body)); return Response.json(oneToManyPayload); },
});
assert.deepEqual(oneToMany, [[
  { durationSeconds: 10, distanceKm: 1, sourceIndex: 0, targetIndex: 0 },
  null,
  { durationSeconds: 30, distanceKm: 3, sourceIndex: 0, targetIndex: 2 },
]]);
assert.equal(matrixUrl!.searchParams.get("async"), "false");
assert.equal(matrixBody!.profile, HERE_MATRIX_PROFILE);
assert.deepEqual(matrixBody!.regionDefinition, { type: "world" });

const manyToOne = await calculateHereMatrix([{ lat: 1, lon: 2 }, { lat: 3, lon: 4 }], [{ lat: 5, lon: 6 }], {
  apiKey: "x",
  fetchImpl: async () => Response.json({ matrix: { numOrigins: 2, numDestinations: 1, travelTimes: [11, 22], distances: [1_100, 2_200] } }),
});
assert.deepEqual(manyToOne, [
  [{ durationSeconds: 11, distanceKm: 1.1, sourceIndex: 0, targetIndex: 0 }],
  [{ durationSeconds: 22, distanceKm: 2.2, sourceIndex: 1, targetIndex: 0 }],
]);

await assert.rejects(() => calculateHereMatrix([{ lat: 1, lon: 2 }], [{ lat: 3, lon: 4 }], { apiKey: "x", fetchImpl: async () => Response.json({ matrix: { numOrigins: 1 } }) }), (error: unknown) => error instanceof HereRoutingError && error.code === "HERE_INVALID_RESPONSE");
await assert.rejects(() => calculateHerePlanningRoute([{ lat: 1, lon: 2 }, { lat: 3, lon: 4 }], { apiKey: "never-print-this", fetchImpl: async () => { throw new Error("credential failure"); } }), (error: unknown) => error instanceof HereRoutingError && !error.message.includes("never-print-this"));

const provider: RoutingProvider = { route: calculateHerePlanningRoute, timedRoute: async () => ({ ...route, timingSegments: [], waypointArrivalSeconds: [] }), matrix: calculateHereMatrix };
assert.equal(typeof provider.route, "function");
assert.equal(typeof provider.matrix, "function");
console.log("HERE planning provider checks passed (fixture-only; no HERE or AWS calls).");
