import assert from "node:assert/strict";
import { isCurrentWorkspace, resolveWorkspaceMode, showsTripWorkspace, workspaceUrl } from "../src/lib/trip/workspace-mode.ts";

const tripA = "00000000-0000-4000-8000-000000000001";
const tripB = "00000000-0000-4000-8000-000000000002";
const resolve = (authenticated: boolean, tripId: string | null, mode: string | null) => resolveWorkspaceMode({ authenticated, requestedTripId: tripId, requestedMode: mode });

assert.equal(resolve(true, null, null), "personal_map");
assert.equal(resolve(false, null, null), "planner");
assert.equal(resolve(true, tripA, null), "trip");
assert.equal(resolve(true, null, "planner"), "planner");
assert.equal(resolve(true, tripA, "planner"), "trip");
assert.equal(resolve(true, null, "banana"), "personal_map");
assert.equal(resolve(false, null, "planner"), "planner");
assert.equal(workspaceUrl({ mode: "personal_map" }), "/");
assert.equal(workspaceUrl({ mode: "planner" }), "/?mode=planner");
assert.equal(workspaceUrl({ mode: "trip", tripId: tripA }), `/?trip=${tripA}`);
assert.ok(isCurrentWorkspace({ mode: "personal_map" }, "personal_map", null));
assert.ok(isCurrentWorkspace({ mode: "planner" }, "planner", null));
assert.ok(!isCurrentWorkspace({ mode: "trip", tripId: tripB }, "trip", tripA));
assert.equal(showsTripWorkspace("personal_map"), false);

const history = [
  { trip: null, mode: null, expected: "personal_map" },
  { trip: tripA, mode: null, expected: "trip" },
  { trip: null, mode: null, expected: "personal_map" },
  { trip: null, mode: "planner", expected: "planner" },
] as const;
assert.deepEqual(history.map((entry) => resolve(true, entry.trip, entry.mode)), history.map((entry) => entry.expected));
assert.deepEqual([...history].reverse().map((entry) => resolve(true, entry.trip, entry.mode)), [...history].reverse().map((entry) => entry.expected));

console.log("Workspace URL precedence, transitions, duplicate detection, and history restoration checks passed.");
