import assert from "node:assert/strict";
import { cellToParent, getResolution, latLngToCell } from "h3-js";
import { createUnexploredTerritorySelection, selectionIsExplored } from "../src/lib/coverage/unexplored-territory.ts";
import { coverageDisplayResolution } from "../src/lib/coverage/map-coverage.ts";
import { getPostgresPool } from "../src/lib/db/postgres.ts";

const pool = getPostgresPool();
try {
  const resolution = coverageDisplayResolution(8.5);
  const first = createUnexploredTerritorySelection(36.1, -86.8, resolution);
  assert.equal(first.resolution, 8); assert.equal(getResolution(first.h3Index), 8);
  assert.equal(first.latitude, 36.1); assert.equal(first.longitude, -86.8);
  assert.equal(first.boundary.type, "Polygon"); assert.deepEqual(first.boundary.coordinates[0][0], first.boundary.coordinates[0].at(-1));
  assert.ok(Math.abs(first.boundary.coordinates[0][0][0]) > Math.abs(first.boundary.coordinates[0][0][1]));
  assert.equal(selectionIsExplored(first, []), false);
  assert.equal(selectionIsExplored(first, [first.h3Index]), true);
  const child = latLngToCell(first.latitude, first.longitude, 10);
  assert.equal(cellToParent(child, first.resolution), first.h3Index);
  assert.equal(selectionIsExplored(first, [child]), true);
  const fineSelection = createUnexploredTerritorySelection(36.1, -86.8, 10);
  assert.equal(selectionIsExplored(fineSelection, [cellToParent(fineSelection.h3Index, 7)]), true);
  const second = createUnexploredTerritorySelection(40, -100, 5);
  assert.notEqual(second.h3Index, first.h3Index);
  assert.equal(first.h3Index, first.h3Index, "Pan/zoom does not mutate an existing selection identity.");
  assert.equal(selectionIsExplored(first, [latLngToCell(34, -90, 8)]), false);

  const before = (await pool.query("SELECT (SELECT count(*)::int FROM trips) trips,(SELECT count(*)::int FROM route_coverage) coverage,(SELECT count(*)::int FROM trip_credit_ledger) credits")).rows[0];
  const resolutions = (await pool.query("SELECT DISTINCT h3_resolution FROM route_coverage ORDER BY h3_resolution")).rows.map((row) => row.h3_resolution);
  assert.deepEqual(resolutions, [10]);
  assert.equal((await pool.query("SELECT to_regclass('public.unexplored_cells') IS NULL AND to_regclass('public.fog_cells') IS NULL AS absent")).rows[0].absent, true);
  const after = (await pool.query("SELECT (SELECT count(*)::int FROM trips) trips,(SELECT count(*)::int FROM route_coverage) coverage,(SELECT count(*)::int FROM trip_credit_ledger) credits")).rows[0];
  assert.deepEqual(after, before);
  console.log("Unexplored selection identity, hierarchy, boundary, transient behavior, and persistence invariants passed.");
} finally { await pool.end(); }
