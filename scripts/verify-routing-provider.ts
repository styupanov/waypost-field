import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { activeRoutingProviderName, DEFAULT_ROUTING_PROVIDER, getRoutingProvider, routingProvider, RoutingProviderError } from "../src/lib/routing/provider.ts";
import { hereRoutingProvider } from "../src/lib/routing/here-routing-provider.ts";
import { valhallaRoutingProvider } from "../src/lib/routing/valhalla-routing-provider.ts";
import { editTripDraft } from "../src/lib/trip/draft-editing.ts";
import type { TripDraft } from "../src/types/trip.ts";

const originalProvider = process.env.ROUTING_PROVIDER;
const originalHereKey = process.env.HERE_API_KEY;
const originalValhallaUrl = process.env.VALHALLA_URL;
const originalFetch = globalThis.fetch;

const herePayload = { routes: [{ sections: [{
  polyline: "BFoz5xJ67i1B1B7PzIhaxL7Y",
  summary: { length: 1_000, duration: 100 },
  spans: [{ offset: 0, carAttributes: ["open"], streetAttributes: ["motorway"] }],
  transport: { mode: "car" },
}] }] };

function encodeValhalla(points: [number, number][]) {
  let previousLat = 0; let previousLon = 0; let output = "";
  const encodeValue = (value: number) => {
    let encoded = value < 0 ? ~(value << 1) : value << 1;
    do { let next = encoded & 0x1f; encoded >>>= 5; if (encoded) next |= 0x20; output += String.fromCharCode(next + 63); } while (encoded);
  };
  for (const [lon, lat] of points) {
    const nextLat = Math.round(lat * 1e6); const nextLon = Math.round(lon * 1e6);
    encodeValue(nextLat - previousLat); encodeValue(nextLon - previousLon);
    previousLat = nextLat; previousLon = nextLon;
  }
  return output;
}

try {
  assert.equal(DEFAULT_ROUTING_PROVIDER, "valhalla");
  assert.equal(activeRoutingProviderName({}), "valhalla");
  assert.equal(getRoutingProvider({ ROUTING_PROVIDER: "here" }), hereRoutingProvider);
  assert.equal(getRoutingProvider({ ROUTING_PROVIDER: "valhalla" }), valhallaRoutingProvider);
  assert.throws(() => getRoutingProvider({ ROUTING_PROVIDER: "other" }), /Unsupported ROUTING_PROVIDER/);

  process.env.HERE_API_KEY = "fixture-key";
  process.env.VALHALLA_URL = "http://valhalla.test";
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.startsWith("https://router.hereapi.com/")) return Response.json(herePayload);
    if (url === "http://valhalla.test/route") return Response.json({ trip: { legs: [{ shape: encodeValhalla([[-80, 35], [-79, 36]]) }], summary: { length: 10, time: 20, has_toll: false, has_highway: true, has_ferry: false } } });
    if (url === "http://valhalla.test/sources_to_targets") return Response.json({ sources_to_targets: [[{ time: 30, distance: 40 }]] });
    throw new Error("Unexpected fixture URL");
  };

  process.env.ROUTING_PROVIDER = "here";
  const here = await routingProvider.route([{ lat: 50.1, lon: 8.7 }, { lat: 50.09, lon: 8.68 }]);
  assert.equal(here.summary.distanceKm, 1); assert.equal(here.summary.hasHighway, true);
  const draft = {
    origin: { label: "A", coordinates: { lat: 50.1, lon: 8.7 } }, destination: { label: "B", coordinates: { lat: 50.09, lon: 8.68 } },
    route: here.route, summary: here.summary, baselineSummary: here.summary, stops: [],
    alternatives: [{ attractionId: 1, name: "Fixture", coordinates: { lat: 50.095, lon: 8.69 }, rawCategory: "Museums", interestCategory: "museums_culture", rating: 4.5, reviewCount: 10, routeProgress: 0.5, personalizedScore: 80, individualDetourDistanceKm: 1, individualDetourDurationSeconds: 60, duration: null, visitDuration: null }],
    composition: { selectedPoiCount: 0 },
  } as unknown as TripDraft;
  const edited = await editTripDraft(draft, { type: "add", attractionId: 1 });
  assert.equal(edited.stops.length, 1); assert.equal(edited.summary.distanceKm, 1);

  process.env.ROUTING_PROVIDER = "valhalla";
  const valhalla = await routingProvider.route([{ lat: 35, lon: -80 }, { lat: 36, lon: -79 }]);
  assert.equal(valhalla.summary.distanceKm, 10); assert.equal(valhalla.summary.durationSeconds, 20);
  const matrix = await routingProvider.matrix([{ lat: 35, lon: -80 }], [{ lat: 36, lon: -79 }]);
  assert.deepEqual(matrix, [[{ durationSeconds: 30, distanceKm: 40, sourceIndex: 0, targetIndex: 0 }]]);

  process.env.ROUTING_PROVIDER = "here";
  globalThis.fetch = async () => new Response("unavailable", { status: 503 });
  await assert.rejects(() => routingProvider.route([{ lat: 35, lon: -80 }, { lat: 36, lon: -79 }]),
    (error: unknown) => error instanceof RoutingProviderError && error.statusCode === 503);

  const routeApi = readFileSync(new URL("../src/app/api/route/route.ts", import.meta.url), "utf8");
  const draftEditing = readFileSync(new URL("../src/lib/trip/draft-editing.ts", import.meta.url), "utf8");
  assert.match(routeApi, /routingProvider\.route/); assert.doesNotMatch(routeApi, /routing\/valhalla/);
  assert.match(draftEditing, /routingProvider\.route/); assert.doesNotMatch(draftEditing, /routing\/valhalla/);
  process.env.ROUTING_PROVIDER = "here";
  globalThis.fetch = async () => new Response("unavailable", { status: 503 });
  await assert.rejects(() => routingProvider.route([{ lat: 35, lon: -80 }, { lat: 36, lon: -79 }]), (error: unknown) => error instanceof RoutingProviderError && error.statusCode === 503 && !error.message.includes("fixture-key"));

  const explore = readFileSync(new URL("../src/lib/explore-planning/service.ts", import.meta.url), "utf8");
  const overnight = readFileSync(new URL("../src/lib/overnights/candidates.ts", import.meta.url), "utf8");
  const dayComposition = readFileSync(new URL("../src/lib/trip/day-composition.ts", import.meta.url), "utf8");
  assert.match(draftEditing, /routingProvider\.route/);
  assert.match(explore, /calculateMatrix: calculateReturnTripMatrix/);
  assert.match(explore, /calculateExactRoute: routingProvider\.route/);
  assert.match(overnight, /routing\/valhalla/);
  assert.match(dayComposition, /routing\/valhalla/);
} finally {
  if (originalProvider === undefined) delete process.env.ROUTING_PROVIDER; else process.env.ROUTING_PROVIDER = originalProvider;
  if (originalHereKey === undefined) delete process.env.HERE_API_KEY; else process.env.HERE_API_KEY = originalHereKey;
  if (originalValhallaUrl === undefined) delete process.env.VALHALLA_URL; else process.env.VALHALLA_URL = originalValhallaUrl;
  globalThis.fetch = originalFetch;
}

console.log("Routing provider selection, HERE/Valhalla delegation, API route, neutral errors, and migration-boundary checks passed.");
