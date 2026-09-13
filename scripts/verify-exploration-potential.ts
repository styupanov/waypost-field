import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { getPostgresPool } from "../src/lib/db/postgres.ts";
import { rawExplorationPotential } from "../src/lib/exploration-intelligence/model.ts";
import { unexploredPotentialPointGeoJSON } from "../src/lib/exploration-potential/map-cells.ts";
import { coverageDisplayResolution } from "../src/lib/coverage/map-coverage.ts";
import { normalizePotential, potentialNormalization } from "../src/lib/exploration-potential/normalization.ts";
import { explorationPotentialResponse } from "../src/lib/exploration-potential/response.ts";
import { clearPotentialNormalizationCache, getExplorationPotential } from "../src/lib/exploration-potential/service.ts";
import { parsePotentialViewport } from "../src/lib/exploration-potential/validation.ts";

const pool = getPostgresPool(); const userA = randomUUID(); const userB = randomUUID(); const genericUser = randomUUID();
const viewports = {
  easternUs: { west: -90, south: 30, east: -70, north: 43 },
  washington: { west: -78.5, south: 37.5, east: -75.5, north: 40 },
  denver: { west: -106, south: 38.5, east: -103.5, north: 41 },
  urban: { west: -77.2, south: 38.75, east: -76.85, north: 39.05 },
};
const invariants = () => pool.query(`SELECT (SELECT count(*)::int FROM trips) trips,(SELECT count(*)::int FROM trip_versions) versions,
 (SELECT count(*)::int FROM route_coverage) coverage,(SELECT count(*)::int FROM trip_poi_visit_confirmations) confirmations,
 (SELECT count(*)::int FROM trip_credit_ledger) credit_rows,(SELECT COALESCE(sum(balance),0)::int FROM trip_credit_accounts) credits,
 (SELECT count(*)::int FROM provider_route_cache) provider_cache`);

try {
  const before = (await invariants()).rows[0];
  const bounds = potentialNormalization([0.5, 1, 2, 3, 10]); assert.deepEqual(bounds, potentialNormalization([10, 3, 2, 1, 0.5]));
  assert.equal(normalizePotential(bounds.lowerBound, bounds), 0); assert.equal(normalizePotential(999, bounds), 1);
  for (const value of [normalizePotential(-1, bounds), normalizePotential(2.5, bounds), normalizePotential(Number.NaN, bounds)]) assert.ok(Number.isFinite(value) && value >= 0 && value <= 1);
  assert.equal(rawExplorationPotential(0, 0), 0); assert.ok(rawExplorationPotential(10, 2) > rawExplorationPotential(5, 1));
  const query = `http://local/x?west=-90&south=30&east=-70&north=43&resolution=5`;
  assert.deepEqual(parsePotentialViewport(query), { ...viewports.easternUs, resolution: 5 });
  assert.deepEqual(parsePotentialViewport("http://local/x?west=-90&south=30&east=-70&north=43&resolution=4"), { ...viewports.easternUs, resolution: 4 });
  assert.equal(parsePotentialViewport("http://local/x?west=-90&south=30&east=-70&north=43&resolution=3"), null);
  assert.equal(parsePotentialViewport("http://local/x?west=-70&south=30&east=-90&north=43&resolution=5"), null);
  assert.equal(parsePotentialViewport(`${query}&user_id=${userA}`), null);
  assert.equal((await explorationPotentialResponse(null, new Request(query))).status, 401);
  assert.equal((await explorationPotentialResponse(userA, new Request("http://local/x?west=bad&south=30&east=-70&north=43&resolution=5"))).status, 400);

  await pool.query("INSERT INTO public.users(id,auth_subject) VALUES($1,$2),($3,$4),($5,$6)", [userA, `potential-a-${userA}`, userB, `potential-b-${userB}`, genericUser, `potential-g-${genericUser}`]);
  await pool.query("INSERT INTO public.user_interest_preferences(user_id,category) VALUES($1,'nature_scenic'),($2,'food_drink')", [userA, userB]);
  clearPotentialNormalizationCache();
  const generic = await getExplorationPotential(genericUser, 5, viewports.easternUs); assert.equal(generic.mode, "generic");
  const nature = await getExplorationPotential(userA, 5, viewports.easternUs); const food = await getExplorationPotential(userB, 5, viewports.easternUs);
  assert.equal(nature.mode, "personalized"); assert.equal(food.mode, "personalized"); assert.notDeepEqual(nature.cells, food.cells);
  assert.ok(generic.cells.every((cell) => cell.intensity > 0 && cell.intensity <= 1));
  const covered = generic.cells[0]?.h3Index;
  if (covered) {
    const maskedPoints = unexploredPotentialPointGeoJSON(generic.cells, [covered]);
    assert.equal(maskedPoints.features.some((feature) => feature.properties?.h3Index === covered), false);
    assert.equal(maskedPoints.features.length, generic.cells.length - 1);
  }
  const visiblePoints = unexploredPotentialPointGeoJSON(generic.cells, []); assert.equal(visiblePoints.features.length, generic.cells.length);
  for (const feature of visiblePoints.features) {
    const [longitude, latitude] = feature.geometry.coordinates;
    assert.ok(Number.isFinite(longitude) && longitude >= -180 && longitude <= 180);
    assert.ok(Number.isFinite(latitude) && latitude >= -90 && latitude <= 90);
  }

  const stableCell = nature.cells[0];
  if (stableCell) {
    const [latitude, longitude] = (await import("h3-js")).cellToLatLng(stableCell.h3Index);
    const smaller = { west: longitude - 1, south: latitude - 1, east: longitude + 1, north: latitude + 1 };
    const second = await getExplorationPotential(userA, 5, smaller);
    assert.equal(second.cells.find((cell) => cell.h3Index === stableCell.h3Index)?.intensity, stableCell.intensity);
  }

  const metrics: Record<string, unknown> = {};
  for (const [name, viewport] of Object.entries(viewports)) {
    metrics[name] = {};
    for (const resolution of [4, 5, 7, 8, 10]) {
      await getExplorationPotential(genericUser, resolution, viewport);
      const started = performance.now(); const result = await getExplorationPotential(genericUser, resolution, viewport); const latencyMs = Math.round((performance.now() - started) * 100) / 100;
      const cellsRead = (await pool.query("SELECT count(*)::int count FROM attraction_h3_cells WHERE h3_resolution=$1 AND center_geom && ST_MakeEnvelope($2,$3,$4,$5,4326)", [resolution, viewport.west, viewport.south, viewport.east, viewport.north])).rows[0].count;
      (metrics[name] as Record<string, unknown>)[`res${resolution}`] = { cellsRead, cellsReturned: result.cells.length, payloadBytes: Buffer.byteLength(JSON.stringify(result)), warmLatencyMs: latencyMs };
    }
  }
  const db = (await pool.query("SELECT count(*)::int rows,pg_size_pretty(pg_relation_size('attraction_h3_cells')) table_size,pg_size_pretty(pg_indexes_size('attraction_h3_cells')) index_size FROM attraction_h3_cells")).rows[0];
  const rowsByResolution = (await pool.query("SELECT h3_resolution,count(*)::int rows FROM attraction_h3_cells GROUP BY 1 ORDER BY 1")).rows;
  const plan = (await pool.query("EXPLAIN(ANALYZE,BUFFERS,FORMAT TEXT) SELECT h3_index FROM attraction_h3_cells WHERE h3_resolution=8 AND center_geom && ST_MakeEnvelope(-78.5,37.5,-75.5,40,4326)")).rows.map((row) => row["QUERY PLAN"]).join(" ");
  assert.match(plan, /Bitmap Index Scan|Index Scan/);
  assert.equal((await pool.query("SELECT count(*)::int count FROM information_schema.columns WHERE table_name IN('attraction_h3_cells','attraction_h3_category_aggregates') AND column_name='user_id'")).rows[0].count, 0);
  assert.ok((await pool.query("SELECT sum(attraction_count)::int count FROM attraction_h3_category_aggregates WHERE h3_resolution=5 AND source_category='Food & Drink'")).rows[0].count > 0);
  assert.ok((await pool.query("SELECT count(*)::int count FROM public.attractions WHERE source_group='restaurants'")).rows[0].count > 0);
  assert.deepEqual([4.9, 5.5, 7, 8.5, 10, 11.5, 15].map(coverageDisplayResolution), [4, 5, 6, 7, 8, 9, 9]);
  assert.deepEqual((await pool.query("SELECT DISTINCT h3_resolution FROM route_coverage ORDER BY 1")).rows.map((row) => row.h3_resolution), [10]);

  const mapSource = readFileSync(new URL("../src/components/map/MapCanvas.tsx", import.meta.url), "utf8");
  const plannerSource = readFileSync(new URL("../src/components/trip/TripPlanner.tsx", import.meta.url), "utf8");
  assert.match(mapSource, /waypost-exploration-potential/); assert.doesNotMatch(mapSource, /POTENTIAL_OUTLINE/);
  assert.match(mapSource, /waypost-exploration-potential-gold/); assert.doesNotMatch(mapSource, /waypost-exploration-potential-violet/);
  assert.doesNotMatch(mapSource, /waypost-exploration-potential-fill|unexploredPotentialGeoJSON|POTENTIAL_LAYER_ID/);
  assert.match(mapSource, /unexploredPotentialPointGeoJSON\(potential\.cells, coverage\.cells\)/);
  assert.match(mapSource, /\["\*", \["get", "intensity"\], \["get", "intensity"\]\]/);
  assert.match(mapSource, /circle-blur": 1/); assert.match(mapSource, /POTENTIAL_VISUAL_THRESHOLD = 0\.24/);
  assert.match(mapSource, /if \(!personalMapMode\) \{[\s\S]*?removeExplorationPotential\(mapInstance\)/);
  assert.match(mapSource, /queryRenderedFeatures\(event\.point, \{ layers: \[FOG_FILL_LAYER_ID\] \}\)/);
  assert.match(mapSource, /potential\.resolution === coverage\.displayResolution/); assert.match(mapSource, /potentialSequence === potentialRequestSequence\.current/);
  assert.doesNotMatch(plannerSource, /Exploration style|Current fill|Gold glow|Violet glow|explorationPotentialStyle/);

  await pool.query("DELETE FROM public.users WHERE id=ANY($1::uuid[])", [[userA, userB, genericUser]]);
  assert.deepEqual((await invariants()).rows[0], before);
  console.log(JSON.stringify({ rowsByResolution, db, indexUsed: true, metrics }, null, 2));
} finally {
  await pool.query("DELETE FROM public.user_interest_preferences WHERE user_id=ANY($1::uuid[])", [[userA, userB, genericUser]]).catch(() => undefined);
  await pool.query("DELETE FROM public.users WHERE id=ANY($1::uuid[])", [[userA, userB, genericUser]]).catch(() => undefined);
  await pool.end();
}
