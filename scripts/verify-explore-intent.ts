import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { getResolution, latLngToCell } from "h3-js";
import { exploreIntentBoundary, exploreIntentFromSelection, parseExploreIntent, serializeExploreIntent } from "../src/lib/trip/explore-intent.ts";
import { createUnexploredTerritorySelection } from "../src/lib/coverage/unexplored-territory.ts";
import { resolveWorkspaceMode } from "../src/lib/trip/workspace-mode.ts";

const selection = createUnexploredTerritorySelection(36.1, -86.8, 8);
const intent = exploreIntentFromSelection(selection);
assert.deepEqual(Object.keys(intent).sort(), ["anchor", "h3Index", "kind", "resolution"]);
assert.equal("destination" in intent, false); assert.equal("route" in intent, false);
const serialized = serializeExploreIntent(intent);
assert.equal(serialized.get("mode"), "planner"); assert.equal(serialized.get("intent"), "explore");
const parsed = parseExploreIntent(Object.fromEntries(serialized));
assert.deepEqual(parsed, intent); assert.equal(getResolution(intent.h3Index), intent.resolution);
const boundary = exploreIntentBoundary(intent);
assert.equal(boundary.type, "Polygon"); assert.deepEqual(boundary.coordinates[0][0], boundary.coordinates[0].at(-1));
assert.ok(Math.abs(boundary.coordinates[0][0][0]) > Math.abs(boundary.coordinates[0][0][1]), "GeoJSON coordinates are [lng, lat].");

assert.equal(parseExploreIntent({ intent: "explore", area: "invalid", areaRes: "8", lat: "36", lng: "-86" }), null);
assert.equal(parseExploreIntent({ intent: "explore", area: intent.h3Index, areaRes: "7", lat: "36", lng: "-86" }), null);
assert.equal(parseExploreIntent({ intent: "explore", area: intent.h3Index, areaRes: "8", lat: "NaN", lng: "-86" }), null);
assert.equal(parseExploreIntent({ intent: "explore", area: intent.h3Index, areaRes: "8", lat: "91", lng: "-86" }), null);
assert.equal(parseExploreIntent({ intent: "explore", area: intent.h3Index, areaRes: "8", lat: "", lng: "-86" }), null);
assert.equal(parseExploreIntent({ intent: "explore", area: intent.h3Index, areaRes: "8", lat: "36" }), null);
assert.equal(parseExploreIntent({ intent: "other", area: intent.h3Index, areaRes: "8", lat: "36", lng: "-86" }), null);
const differentResolution = latLngToCell(36.1, -86.8, 9);
assert.equal(parseExploreIntent({ intent: "explore", area: differentResolution, areaRes: "8", lat: "36.1", lng: "-86.8" }), null);

assert.equal(resolveWorkspaceMode({ authenticated: true, requestedTripId: null, requestedMode: "planner" }), "planner");
assert.equal(resolveWorkspaceMode({ authenticated: true, requestedTripId: "trip-id", requestedMode: "planner" }), "trip");
const plannerSource = readFileSync(new URL("../src/components/trip/TripPlanner.tsx", import.meta.url), "utf8");
const mapSource = readFileSync(new URL("../src/components/map/MapCanvas.tsx", import.meta.url), "utf8");
assert.match(plannerSource, /Explore this area/); assert.match(plannerSource, /router\.push\(`\/\?\$\{serializeExploreIntent/);
assert.match(plannerSource, /router\.replace\("\/\?mode=planner"\)/); assert.match(mapSource, /waypost-explore-area/);
const navigationBody = plannerSource.slice(plannerSource.indexOf("function exploreSelectedArea"), plannerSource.indexOf("function clearExploreIntent"));
for (const forbidden of ["/api/route", "/api/geocode", "/api/trips", "/api/credits", "fetch("]) assert.equal(navigationBody.includes(forbidden), false);
assert.equal(navigationBody.includes("clearTripContext"), false, "Entering ExploreIntent preserves normal planner state behind the isolated presentation.");
assert.match(plannerSource, /route=\{tripWorkspaceVisible && !activeExploreIntent \? displayedRoute : null\}/);
assert.match(plannerSource, /destinationCoordinates=\{tripWorkspaceVisible && !activeExploreIntent \? destination\.coordinates : null\}/);
assert.match(plannerSource, /destination=\{activeExploreIntent \? emptyExploreDestination : destination\}/);
assert.match(plannerSource, /plannerState=\{activeExploreIntent \? explorePlannerState : plannerState\}/);
const panelSource = readFileSync(new URL("../src/components/trip/TripIntentPanel.tsx", import.meta.url), "utf8");
assert.match(panelSource, /!exploreIntent && \(!visibleDraft \|\| isEditingTrip\)[\s\S]*<form/, "ExploreIntent hides the known-destination Build form.");

const staleNormalPlanner = { destination: "Denver, CO", route: { type: "LineString" }, draft: { id: "stale" } };
const explorePresentation = { destination: null, route: null, draft: null, area: intent };
assert.ok(staleNormalPlanner.destination && staleNormalPlanner.route && staleNormalPlanner.draft);
assert.equal(explorePresentation.destination, null); assert.equal(explorePresentation.route, null); assert.equal(explorePresentation.draft, null);
assert.deepEqual(explorePresentation.area, intent);

const history = ["/", `/?${serialized}`, "/", `/?${serialized}`];
assert.equal(history[0], "/"); assert.equal(history[1], history[3]);
console.log("ExploreIntent model, URL validation, reconstruction, workspace precedence, navigation, and no-side-effect checks passed.");
