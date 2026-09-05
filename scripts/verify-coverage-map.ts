import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { cellToParent, getResolution, latLngToCell } from "h3-js";
import { coverageResponseForUser } from "../src/lib/coverage/coverage-response.ts";
import { coverageCellsToGeoJSON } from "../src/lib/coverage/coverage-geojson.ts";
import { buildPersonalCoverageResponse, coverageDisplayResolution, deriveDisplayCells } from "../src/lib/coverage/map-coverage.ts";
import { parseCoverageRequest } from "../src/lib/coverage/coverage-request.ts";
import { loadPersonalBaseCoverageCells } from "../src/lib/coverage/coverage-repository.ts";
import { getPostgresPool } from "../src/lib/db/postgres.ts";
import { resolveWaypostUserId } from "../src/lib/users/identity.ts";

const pool = getPostgresPool();
const users: string[] = [];
const trips: string[] = [];
async function user() { const id = await resolveWaypostUserId(`local:coverage-map-test:${randomUUID()}`); users.push(id); return id; }
async function fixture(userId: string, cells: string[]) {
  const tripId = randomUUID(); const versionId = randomUUID(); trips.push(tripId);
  await pool.query("INSERT INTO trips(id,user_id,status) VALUES($1,$2,'draft')", [tripId, userId]);
  await pool.query(`INSERT INTO trip_versions(id,trip_id,version_no,state,preferences,route_geom,distance_m,duration_seconds,baseline_distance_m,baseline_duration_seconds,driving_detour_seconds,routing_engine,planner_version,finalized_at,finalization_provider) VALUES($1,$2,1,'finalized','{}',ST_GeomFromText('LINESTRING(-80 35,-79 36)',4326),1,1,1,1,0,'valhalla','test',now(),'here')`, [versionId, tripId]);
  await pool.query("UPDATE trips SET status='traveled',current_version_id=$1,started_at=now(),ended_at=now(),travel_confirmation_at=now() WHERE id=$2", [versionId, tripId]);
  await pool.query("INSERT INTO route_coverage(user_id,trip_version_id,h3_index,h3_resolution,coverage_source) SELECT $1,$2,x,10,'valhalla_inferred' FROM unnest($3::text[]) x", [userId, versionId, cells]);
  return { tripId, versionId };
}

try {
  const baseA = latLngToCell(35.2271, -80.8431, 10); const baseB = latLngToCell(35.3, -80.7, 10);
  assert.deepEqual([[5.49, 5], [5.5, 6], [6.99, 6], [7, 7], [8.49, 7], [8.5, 8], [9.99, 8], [10, 9], [11.49, 9], [11.5, 10]].map(([zoom, expected]) => coverageDisplayResolution(zoom) === expected), Array(10).fill(true));
  for (const resolution of [9, 8, 7, 6, 5]) assert.equal(deriveDisplayCells([baseA], resolution)[0], cellToParent(baseA, resolution));
  assert.equal(deriveDisplayCells([baseA, baseA], 7).length, 1);
  const visible = buildPersonalCoverageResponse([baseA, baseA, baseB], 7, { west: -81, south: 35, east: -80.5, north: 35.5 }); assert.equal(visible.baseCellCount, 2); assert.ok(visible.cells.length > 0); assert.ok(visible.cells.every(cell => getResolution(cell) === visible.displayResolution));
  const hidden = buildPersonalCoverageResponse([baseA], 12, { west: -105, south: 39, east: -104, north: 40 }); assert.equal(hidden.returnedCellCount, 0);
  const geojson = coverageCellsToGeoJSON([baseA]); const ring = geojson.features[0].geometry.coordinates[0]; assert.deepEqual(ring[0], ring.at(-1)); assert.ok(Math.abs(ring[0][0]) > Math.abs(ring[0][1]));
  assert.throws(() => parseCoverageRequest("http://local/api/map/coverage?zoom=x&west=-81&south=35&east=-80&north=36")); assert.throws(() => parseCoverageRequest("http://local/api/map/coverage?zoom=7&west=-80&south=35&east=-81&north=36"));
  const anonymous = await coverageResponseForUser(null, new Request("http://local/api/map/coverage?zoom=7&west=-81&south=35&east=-80&north=36")); assert.equal(anonymous.status, 401);

  const owner = await user(); const other = await user(); const emptyUser = await user(); const first = await fixture(owner, [baseA, baseB]); const second = await fixture(owner, [baseA]); await fixture(other, [latLngToCell(39.7392, -104.9903, 10)]);
  const aggregate = await loadPersonalBaseCoverageCells(owner); assert.deepEqual(aggregate, [baseA, baseB].sort()); assert.equal((await loadPersonalBaseCoverageCells(other)).length, 1);
  const before = (await pool.query("SELECT (SELECT balance FROM trip_credit_accounts WHERE user_id=$1) balance,(SELECT count(*)::int FROM trip_poi_visit_confirmations WHERE user_id=$1) poi_count", [owner])).rows[0];
  const response = await coverageResponseForUser(owner, new Request("http://local/api/map/coverage?zoom=12&west=-81&south=35&east=-80&north=36")); assert.equal(response.status, 200); const body = await response.json(); const serialized = JSON.stringify(body); assert.equal(body.baseCellCount, 2); assert.equal(body.returnedCellCount, 2); assert.ok(!serialized.includes("user_id") && !serialized.includes("trip_version_id"));
  const emptyResponse = await coverageResponseForUser(emptyUser, new Request("http://local/api/map/coverage?zoom=7&west=-125&south=24&east=-66&north=50")); assert.equal(emptyResponse.status, 200); assert.equal((await emptyResponse.json()).returnedCellCount, 0);
  const invalidResponse = await coverageResponseForUser(owner, new Request("http://local/api/map/coverage?zoom=99&west=-81&south=35&east=-80&north=36")); assert.equal(invalidResponse.status, 400);
  await pool.query("DELETE FROM route_coverage WHERE trip_version_id=$1", [first.versionId]); assert.deepEqual(await loadPersonalBaseCoverageCells(owner), [baseA]);
  await pool.query("DELETE FROM route_coverage WHERE trip_version_id=$1", [second.versionId]); assert.deepEqual(await loadPersonalBaseCoverageCells(owner), []);
  const after = (await pool.query("SELECT (SELECT balance FROM trip_credit_accounts WHERE user_id=$1) balance,(SELECT count(*)::int FROM trip_poi_visit_confirmations WHERE user_id=$1) poi_count", [owner])).rows[0]; assert.deepEqual(after, before);
  const resolutions = await pool.query("SELECT DISTINCT h3_resolution FROM route_coverage WHERE user_id=ANY($1::uuid[])", [[owner, other]]); assert.ok(resolutions.rows.every(row => row.h3_resolution === 10));
  console.log("Coverage auth boundary, aggregate DISTINCT, zoom parents, viewport filtering, compact contract, overlap, and read-only invariants passed.");
} finally {
  for (const id of trips) await pool.query("DELETE FROM trips WHERE id=$1", [id]);
  if (users.length) await pool.query("DELETE FROM users WHERE id=ANY($1::uuid[])", [users]);
  await pool.end();
}
