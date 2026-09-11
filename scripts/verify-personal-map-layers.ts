import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { DEFAULT_PERSONAL_MAP_LAYERS, personalHistoryLayerActive } from "../src/lib/personal-history/layer-state.ts";
import { traveledRoutesResponse, visitedPlacesResponse } from "../src/lib/personal-history/responses.ts";
import { getPostgresPool } from "../src/lib/db/postgres.ts";

const pool = getPostgresPool();
const tripId = "e7fb94f7-c9eb-4ef6-bfed-ef36ec76b68b";
const usa = "http://local/api/map/history/x?west=-125&south=24&east=-66&north=50";
try {
  assert.deepEqual(DEFAULT_PERSONAL_MAP_LAYERS, { traveledRoutes: false, visitedPlaces: false });
  assert.equal(personalHistoryLayerActive("personal_map", true), true);
  assert.equal(personalHistoryLayerActive("trip", true), false);
  assert.equal(personalHistoryLayerActive("planner", true), false);
  const trip = (await pool.query("SELECT user_id,status,current_version_id FROM trips WHERE id=$1", [tripId])).rows[0];
  assert.equal(trip.status, "traveled");
  const before = (await pool.query("SELECT (SELECT count(*)::int FROM trips) trips,(SELECT count(*)::int FROM route_coverage) coverage,(SELECT count(*)::int FROM trip_poi_visit_confirmations) visits,(SELECT COALESCE(sum(balance),0)::int FROM trip_credit_accounts) credits")).rows[0];
  assert.equal((await traveledRoutesResponse(null, new Request(usa))).status, 401);
  assert.equal((await visitedPlacesResponse(null, new Request(usa))).status, 401);
  const routeBody = await (await traveledRoutesResponse(trip.user_id, new Request(usa))).json();
  assert.equal(routeBody.source, "route_geometry_inferred"); assert.equal(routeBody.routeKind, "inferred_traveled"); assert.ok(routeBody.routeCount >= 1);
  assert.ok(routeBody.features.features.every((feature: GeoJSON.Feature) => feature.geometry.type === "LineString"));
  assert.ok(!JSON.stringify(routeBody).includes("trip_id") && !JSON.stringify(routeBody).includes("trip_version"));
  const outside = await (await traveledRoutesResponse(trip.user_id, new Request("http://local/x?west=10&south=40&east=20&north=50"))).json(); assert.equal(outside.routeCount, 0);
  assert.equal((await (await traveledRoutesResponse(randomUUID(), new Request(usa))).json()).routeCount, 0);
  const placeBody = await (await visitedPlacesResponse(trip.user_id, new Request(usa))).json();
  assert.equal(placeBody.kind, "visited_places"); assert.equal(placeBody.count, placeBody.places.length);
  assert.ok(placeBody.places.every((place: { visitCount: number }) => place.visitCount >= 1));
  assert.equal((await (await visitedPlacesResponse(randomUUID(), new Request(usa))).json()).count, 0);
  const after = (await pool.query("SELECT (SELECT count(*)::int FROM trips) trips,(SELECT count(*)::int FROM route_coverage) coverage,(SELECT count(*)::int FROM trip_poi_visit_confirmations) visits,(SELECT COALESCE(sum(balance),0)::int FROM trip_credit_accounts) credits")).rows[0];
  assert.deepEqual(after, before);
  console.log(JSON.stringify({ routeCount: routeBody.routeCount, visitedPlaceCount: placeBody.count, assertions: "passed" }));
} finally { await pool.end(); }
