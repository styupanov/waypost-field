import assert from "node:assert/strict";
import { calculateHereTimedRoute } from "../src/lib/routing/here-planning.ts";
import { normalizeHereTimedPlanningResponse } from "../src/lib/routing/here-timed-normalization.ts";
import { HereRoutingError } from "../src/lib/routing/here-client.ts";
import type { RoutingProvider } from "../src/lib/routing/routing-provider.ts";

const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
function unsigned(value: number) { let output = ""; do { let chunk = value & 31; value = Math.floor(value / 32); if (value > 0) chunk |= 32; output += alphabet[chunk]; } while (value > 0); return output; }
function signed(value: number) { return value < 0 ? (-value * 2) - 1 : value * 2; }
function encode(points: [number, number][]) {
  let result = unsigned(1) + unsigned(5); let previousLat = 0; let previousLon = 0;
  for (const [lon, lat] of points) { const nextLat = Math.round(lat * 1e5); const nextLon = Math.round(lon * 1e5); result += unsigned(signed(nextLat - previousLat)) + unsigned(signed(nextLon - previousLon)); previousLat = nextLat; previousLon = nextLon; }
  return result;
}
const section = (coordinates: [number, number][], duration: number, spans: { offset: number; duration: number }[], waypoint?: number, extra: Record<string, unknown> = {}) => ({
  polyline: encode(coordinates), summary: { length: duration * 10, duration }, spans,
  transport: { mode: "car" }, ...(waypoint === undefined ? {} : { arrival: { place: { waypoint } } }), ...extra,
});

const basicPayload = { routes: [{ sections: [section([[-80, 35], [-79.5, 35.5], [-79, 36]], 100, [{ offset: 0, duration: 60 }, { offset: 1, duration: 40 }])] }] };
const basic = normalizeHereTimedPlanningResponse(basicPayload, 2);
assert.deepEqual(basic.waypointArrivalSeconds, [0, 100]);
assert.deepEqual(basic.timingSegments, [
  { beginShapeIndex: 0, endShapeIndex: 1, beginTimeSeconds: 0, endTimeSeconds: 60 },
  { beginShapeIndex: 1, endShapeIndex: 2, beginTimeSeconds: 60, endTimeSeconds: 100 },
]);

const multiPayload = { routes: [{ sections: [
  section([[-80, 35], [-79.5, 35.5], [-79, 36]], 100, [{ offset: 0, duration: 60 }, { offset: 1, duration: 40 }], 0),
  section([[-79, 36], [-78.5, 36.5], [-78, 37]], 120, [{ offset: 0, duration: 50 }, { offset: 1, duration: 70 }]),
] }] };
const multi = normalizeHereTimedPlanningResponse(multiPayload, 3);
assert.equal(multi.route.geometry.coordinates.length, 5, "Duplicate section boundary is removed");
assert.deepEqual(multi.timingSegments.map(({ beginShapeIndex, endShapeIndex }) => [beginShapeIndex, endShapeIndex]), [[0, 1], [1, 2], [2, 3], [3, 4]]);
assert.deepEqual(multi.waypointArrivalSeconds, [0, 100, 220]);
assert.equal(multi.timingSegments.at(-1)!.endTimeSeconds, multi.summary.durationSeconds);

const distinctBoundaryPayload = { routes: [{ sections: [
  section([[-80, 35], [-79, 36]], 40, [{ offset: 0, duration: 40 }], 0),
  section([[-78.9, 36.1], [-78, 37]], 60, [{ offset: 0, duration: 60 }]),
] }] };
const distinct = normalizeHereTimedPlanningResponse(distinctBoundaryPayload, 3);
assert.equal(distinct.route.geometry.coordinates.length, 4);
assert.deepEqual(distinct.timingSegments.map(({ beginShapeIndex, endShapeIndex }) => [beginShapeIndex, endShapeIndex]), [[0, 1], [2, 3]]);

const repeatedPointPayload = { routes: [{ sections: [
  section([[-80, 35], [-79.5, 35.5], [-79.5, 35.5], [-79, 36]], 50, [{ offset: 0, duration: 30 }, { offset: 2, duration: 20 }]),
] }] };
const repeatedPoint = normalizeHereTimedPlanningResponse(repeatedPointPayload, 2);
assert.equal(repeatedPoint.route.geometry.coordinates.length, 3, "Adjacent duplicate points are removed from canonical geometry.");
assert.deepEqual(repeatedPoint.timingSegments.map(({ beginShapeIndex, endShapeIndex }) => [beginShapeIndex, endShapeIndex]), [[0, 1], [1, 2]], "HERE span offsets remain aligned after internal point deduplication.");
assert.deepEqual(repeatedPoint.waypointArrivalSeconds, [0, 50]);

const ferryPayload = { routes: [{ sections: [
  section([[-1, 50], [-0.9, 50.1]], 100, [{ offset: 0, duration: 100 }]),
  section([[-0.9, 50.1], [0, 50.5]], 205, [{ offset: 0, duration: 150 }], undefined, { transport: { mode: "ferry" }, preActions: [{ action: "board", duration: 20 }], postActions: [{ action: "deboard", duration: 30 }] }),
  section([[0, 50.5], [0.1, 50.6]], 100, [{ offset: 0, duration: 100 }]),
] }] };
const ferry = normalizeHereTimedPlanningResponse(ferryPayload, 2);
assert.equal(ferry.summary.hasFerry, true);
assert.deepEqual(ferry.waypointArrivalSeconds, [0, 405]);
assert.equal(ferry.timingSegments.at(-1)!.endTimeSeconds, 405);
assert.ok(ferry.timingSegments.some((item) => item.beginShapeIndex === item.endShapeIndex && item.endTimeSeconds - item.beginTimeSeconds === 5), "Unrepresented section time is retained at the section endpoint");

const zero = normalizeHereTimedPlanningResponse({ routes: [{ sections: [section([[-80, 35], [-79, 36]], 10, [{ offset: 0, duration: 0 }], undefined, { postActions: [{ duration: 10 }] })] }] }, 2);
assert.equal(zero.timingSegments[0].beginTimeSeconds, zero.timingSegments[0].endTimeSeconds);
assert.equal(zero.timingSegments.at(-1)!.endTimeSeconds, 10);

for (const payload of [
  { routes: [{ sections: [section([[-80, 35], [-79, 36]], 10, [{ offset: 1, duration: 10 }])] }] },
  { routes: [{ sections: [section([[-80, 35], [-79, 36]], 10, [{ offset: 0, duration: -1 }])] }] },
  { routes: [{ sections: [section([[-80, 35], [-79, 36]], 10, [{ offset: 0, duration: 11 }])] }] },
  { routes: [{ sections: [section([[-80, 35], [-79, 36]], 10, [{ offset: 0, duration: 10 }], undefined, { preActions: [{ duration: "bad" }] })] }] },
]) assert.throws(() => normalizeHereTimedPlanningResponse(payload, 2));

let requestedUrl: URL | undefined;
const timed = await calculateHereTimedRoute([{ lat: 35, lon: -80 }, { lat: 36, lon: -79 }], { apiKey: "not-logged", fetchImpl: async (input) => { requestedUrl = new URL(String(input)); return Response.json(basicPayload); } });
assert.equal(timed.summary.durationSeconds, 100);
assert.equal(requestedUrl!.searchParams.get("return"), "polyline,summary,actions");
assert.equal(requestedUrl!.searchParams.get("spans"), "duration,carAttributes,streetAttributes");
assert.ok(!requestedUrl!.searchParams.get("spans")!.includes("roadAttributes"), "Unsupported roadAttributes must not be requested");
const provider = { route: async () => basic, timedRoute: calculateHereTimedRoute, matrix: async () => [] } satisfies RoutingProvider;
assert.equal(typeof provider.timedRoute, "function");
await assert.rejects(() => calculateHereTimedRoute([{ lat: 35, lon: -80 }, { lat: 36, lon: -79 }], { apiKey: "never-print", fetchImpl: async () => Response.json({ routes: [] }) }), (error: unknown) => error instanceof HereRoutingError && !error.message.includes("never-print"));
console.log("HERE timed routing checks passed (fixture-only; no HERE or AWS calls). Maximum fixture reconciliation residual: 5 seconds.");
