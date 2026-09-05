import assert from "node:assert/strict";
import { calculateHereFinalRoute, HereRoutingError, MAX_FINAL_ROUTE_WAYPOINTS, orderedWaypointsFromDraft } from "../src/lib/routing/here.ts";
import { concatenateSectionCoordinates, decodeFlexiblePolyline, normalizeHereResponse } from "../src/lib/routing/here-normalization.ts";
import type { TripDraft } from "../src/types/trip.ts";

const first = "BFoz5xJ67i1B1B7PzIhaxL7Y";
assert.deepEqual(decodeFlexiblePolyline(first), [[8.69821, 50.10228], [8.69567, 50.10201], [8.6915, 50.10063], [8.68752, 50.09878]]);
const normalized = normalizeHereResponse({ routes: [{ sections: [{ polyline: first, summary: { length: 1000, duration: 100, baseDuration: 90 } }, { polyline: first, summary: { length: 2000, duration: 200, baseDuration: 180 } }] }] }, 3, 12);
assert.equal(normalized.summary.distanceKm, 3); assert.equal(normalized.summary.durationSeconds, 300); assert.equal(normalized.summary.baseDurationSeconds, 270); assert.equal(normalized.diagnostics.sectionCount, 2);
assert.deepEqual(concatenateSectionCoordinates([[[1, 2], [3, 4]], [[3, 4], [5, 6]]]), [[1, 2], [3, 4], [5, 6]]);

const singleDayDraft = { origin: { coordinates: { lat: 1, lon: 2 } }, stops: [{ coordinates: { lat: 3, lon: 4 }, source: "user_attraction" }, { coordinates: { lat: 5, lon: 6 }, source: "waypost" }], destination: { coordinates: { lat: 7, lon: 8 } } } as TripDraft;
assert.deepEqual(orderedWaypointsFromDraft(singleDayDraft), [{ latitude: 1, longitude: 2 }, { latitude: 3, longitude: 4 }, { latitude: 5, longitude: 6 }, { latitude: 7, longitude: 8 }]);
const draft = { origin: { coordinates: { lat: 1, lon: 2 } }, stops: [{ coordinates: { lat: 3, lon: 4 }, source: "user" }, { coordinates: { lat: 5, lon: 6 }, type: "overnight", source: "waypost" }, { coordinates: { lat: 7, lon: 8 }, source: "user_attraction" }, { coordinates: { lat: 9, lon: 10 }, type: "overnight", source: "user" }, { coordinates: { lat: 11, lon: 12 }, source: "waypost" }], destination: { coordinates: { lat: 13, lon: 14 } } } as TripDraft;
assert.deepEqual(orderedWaypointsFromDraft(draft), [{ latitude: 1, longitude: 2 }, { latitude: 3, longitude: 4 }, { latitude: 5, longitude: 6 }, { latitude: 7, longitude: 8 }, { latitude: 9, longitude: 10 }, { latitude: 11, longitude: 12 }, { latitude: 13, longitude: 14 }]);

let requestedUrl: URL | null = null;
await calculateHereFinalRoute(orderedWaypointsFromDraft(draft), { apiKey: "test-key", fetchImpl: async (input) => { requestedUrl = new URL(String(input)); return new Response(JSON.stringify({ routes: [{ sections: [{ polyline: first, summary: { length: 1000, duration: 100 } }] }] }), { status: 200 }); } });
assert.equal(requestedUrl!.searchParams.get("departureTime"), "any"); assert.equal(requestedUrl!.searchParams.get("return"), "polyline,summary"); assert.deepEqual(requestedUrl!.searchParams.getAll("via"), ["3,4", "5,6", "7,8", "9,10", "11,12"]);

await assert.rejects(() => calculateHereFinalRoute([{ latitude: 1, longitude: 2 }, { latitude: 3, longitude: 4 }], { apiKey: "" }), (error: unknown) => error instanceof HereRoutingError && error.code === "HERE_NOT_CONFIGURED");
await assert.rejects(() => calculateHereFinalRoute(Array.from({ length: MAX_FINAL_ROUTE_WAYPOINTS + 1 }, (_, index) => ({ latitude: 1, longitude: index / 10 })), { apiKey: "x" }), (error: unknown) => error instanceof HereRoutingError && error.code === "WAYPOINT_LIMIT_EXCEEDED");
await assert.rejects(() => calculateHereFinalRoute([{ latitude: 1, longitude: 2 }, { latitude: 3, longitude: 4 }], { apiKey: "x", fetchImpl: async () => new Response(JSON.stringify({ routes: [] })) }), (error: unknown) => error instanceof HereRoutingError && error.code === "HERE_INVALID_RESPONSE");
await assert.rejects(() => calculateHereFinalRoute([{ latitude: 1, longitude: 2 }, { latitude: 3, longitude: 4 }], { apiKey: "x", fetchImpl: async () => new Response("service unavailable", { status: 503 }) }), (error: unknown) => error instanceof HereRoutingError && error.code === "HERE_UNAVAILABLE");
await assert.rejects(() => calculateHereFinalRoute([{ latitude: 1, longitude: 2 }, { latitude: 3, longitude: 4 }], { apiKey: "x", timeoutMilliseconds: 1, fetchImpl: async (_input, init) => new Promise<Response>((_resolve, reject) => init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError"))) ) }), (error: unknown) => error instanceof HereRoutingError && error.code === "HERE_TIMEOUT");
console.log("HERE routing domain checks passed.");
