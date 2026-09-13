import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { getResolution, latLngToCell } from "h3-js";
import { getPostgresPool } from "../src/lib/db/postgres.ts";
import { buildH3CategoryAggregates } from "../src/lib/exploration-intelligence/aggregation.ts";
import { buildAreaExplorationIntelligence, rawExplorationPotential } from "../src/lib/exploration-intelligence/model.ts";
import { areaExplorationResponse } from "../src/lib/exploration-intelligence/response.ts";
import { getAreaExplorationIntelligence } from "../src/lib/exploration-intelligence/service.ts";
import { EXPLORATION_H3_RESOLUTIONS, parseAreaIntelligenceQuery } from "../src/lib/exploration-intelligence/validation.ts";
import { INTEREST_CATEGORY_KEYS } from "../src/lib/interests/taxonomy.ts";

const pool = getPostgresPool(); const userA = randomUUID(); const userB = randomUUID(); const genericUser = randomUUID();
const profile = (categories: typeof INTEREST_CATEGORY_KEYS) => ({ interests: categories.map((category) => ({ category, weight: 1, source: "explicit" as const })) });
const invariants = () => pool.query(`SELECT
  (SELECT count(*)::int FROM trips) trips,(SELECT count(*)::int FROM trip_versions) versions,
  (SELECT md5(COALESCE(string_agg(id::text || ':' || preferences::text, ',' ORDER BY id),'')) FROM trip_versions) preferences,
  (SELECT md5(COALESCE(string_agg(id::text || ':' || status, ',' ORDER BY id),'')) FROM trips) lifecycle,
  (SELECT count(*)::int FROM route_coverage) coverage,(SELECT count(*)::int FROM trip_poi_visit_confirmations) confirmations,
  (SELECT count(*)::int FROM trip_credit_ledger) credit_rows,(SELECT COALESCE(sum(balance),0)::int FROM trip_credit_accounts) credits,
  (SELECT count(*)::int FROM provider_route_cache) provider_cache`);

try {
  const before = (await invariants()).rows[0];
  const synthetic = [
    { sourceCategory: "Nature & Parks", latitude: 36.1, longitude: -86.8 },
    { sourceCategory: "Nature & Parks", latitude: 36.1, longitude: -86.8 },
    { sourceCategory: "Fun & Games", latitude: 36.1, longitude: -86.8 },
    { sourceCategory: "Museums", latitude: Number.NaN, longitude: -86.8 },
  ];
  const firstBuild = buildH3CategoryAggregates(synthetic); const secondBuild = buildH3CategoryAggregates(synthetic);
  assert.deepEqual(firstBuild, secondBuild); assert.equal(firstBuild.validGeometryRows, 3); assert.equal(firstBuild.invalidGeometryRows, 1);
  assert.deepEqual([...new Set(firstBuild.aggregates.map((row) => row.resolution))], [...EXPLORATION_H3_RESOLUTIONS]);
  assert.ok(firstBuild.aggregates.every((row) => getResolution(row.h3Index) === row.resolution && row.count > 0));
  assert.ok(firstBuild.aggregates.some((row) => row.sourceCategory === "Fun & Games"));

  const area = { h3Index: latLngToCell(36.1, -86.8, 7), resolution: 7 };
  const rows = [{ sourceCategory: "Nature & Parks", count: 10 }, { sourceCategory: "Food & Drink", count: 6 }, { sourceCategory: "Museums", count: 4 }, { sourceCategory: "Fun & Games", count: 5 }];
  const personalized = buildAreaExplorationIntelligence(area, rows, profile(["nature_scenic", "museums_culture"]));
  assert.equal(personalized.mode, "personalized"); if (personalized.mode !== "personalized") throw new Error();
  assert.equal(personalized.totalPlaceCount, 25); assert.equal(personalized.matchedPlaceCount, 14); assert.equal(personalized.unmappedPlaceCount, 5);
  assert.deepEqual(personalized.categoryBreakdown.map(({ category, count }) => [category, count]), [["nature_scenic", 10], ["museums_culture", 4]]);
  const generic = buildAreaExplorationIntelligence(area, rows, profile([]));
  assert.equal(generic.mode, "generic"); assert.equal(generic.totalPlaceCount, 25); assert.equal(generic.canonicalSupportedPlaceCount, 20); assert.equal(generic.unmappedPlaceCount, 5);
  const zeroMatch = buildAreaExplorationIntelligence(area, rows, profile(["shopping"]));
  assert.equal(zeroMatch.mode, "personalized"); if (zeroMatch.mode === "personalized") assert.equal(zeroMatch.matchedPlaceCount, 0);
  assert.equal(rawExplorationPotential(0, 0), 0); assert.ok(rawExplorationPotential(20, 1) > rawExplorationPotential(10, 1));
  assert.ok(rawExplorationPotential(10, 2) >= rawExplorationPotential(10, 1)); assert.ok(Number.isFinite(rawExplorationPotential(10, 3)));

  assert.deepEqual(parseAreaIntelligenceQuery(`http://local/x?h3=${area.h3Index}&resolution=7`), area);
  assert.equal(parseAreaIntelligenceQuery("http://local/x?h3=bad&resolution=7"), null);
  assert.equal(parseAreaIntelligenceQuery(`http://local/x?h3=${area.h3Index}&resolution=8`), null);
  assert.equal(parseAreaIntelligenceQuery(`http://local/x?h3=${area.h3Index}&resolution=4`), null);
  assert.equal(parseAreaIntelligenceQuery(`http://local/x?h3=${area.h3Index}&resolution=7&user_id=${userA}`), null);
  assert.equal((await areaExplorationResponse(null, new Request(`http://local/x?h3=${area.h3Index}&resolution=7`))).status, 401);
  assert.equal((await areaExplorationResponse(userA, new Request("http://local/x?h3=bad&resolution=7"))).status, 400);

  const scope = (await pool.query(`SELECT count(*)::int total,count(*) FILTER(WHERE category IS NULL)::int null_categories,
    count(*) FILTER(WHERE CASE category WHEN 'Nature & Parks' THEN 1 WHEN 'Outdoor Activities' THEN 1 WHEN 'Boat Tours & Water Sports' THEN 1 WHEN 'Sights & Landmarks' THEN 1 WHEN 'Museums' THEN 1 WHEN 'Concerts & Shows' THEN 1 WHEN 'Food & Drink' THEN 1 WHEN 'Shopping' THEN 1 END IS NOT NULL)::int mapped
    FROM public.attractions WHERE source_group='attractions'`)).rows[0];
  assert.ok(scope.total > 0); assert.ok(scope.null_categories >= 0); assert.ok(scope.mapped > 0 && scope.mapped <= scope.total);
  assert.ok((await pool.query("SELECT count(*)::int count FROM public.attractions WHERE source_group='restaurants'")).rows[0].count > 0);
  const aggregateSums = (await pool.query("SELECT h3_resolution,sum(attraction_count)::int total FROM public.attraction_h3_category_aggregates GROUP BY h3_resolution ORDER BY h3_resolution")).rows;
  assert.deepEqual(aggregateSums.map((row) => row.h3_resolution), [...EXPLORATION_H3_RESOLUTIONS]);
  assert.ok(aggregateSums.every((row) => row.total === aggregateSums[0].total));
  assert.equal((await pool.query("SELECT count(*)::int count FROM information_schema.columns WHERE table_schema='public' AND table_name='attraction_h3_category_aggregates' AND column_name='user_id'")).rows[0].count, 0);
  assert.ok((await pool.query("SELECT count(*)::int count FROM public.attraction_h3_category_aggregates WHERE source_category='Fun & Games'")).rows[0].count > 0);
  const foodByResolution = (await pool.query("SELECT h3_resolution,sum(attraction_count)::int count FROM public.attraction_h3_category_aggregates WHERE source_category='Food & Drink' GROUP BY h3_resolution ORDER BY h3_resolution")).rows;
  assert.ok(foodByResolution.length === EXPLORATION_H3_RESOLUTIONS.length && foodByResolution.every((row) => row.count === foodByResolution[0].count));

  await pool.query("INSERT INTO public.users(id,auth_subject) VALUES($1,$2),($3,$4),($5,$6)", [userA, `explore-a-${userA}`, userB, `explore-b-${userB}`, genericUser, `explore-g-${genericUser}`]);
  await pool.query("INSERT INTO public.user_interest_preferences(user_id,category) VALUES($1,'nature_scenic'),($2,'food_drink')", [userA, userB]);
  const sameCell = "852a100ffffffff";
  const a = await getAreaExplorationIntelligence({ userId: userA, h3Index: sameCell, resolution: 5 });
  const b = await getAreaExplorationIntelligence({ userId: userB, h3Index: sameCell, resolution: 5 });
  assert.equal(a.mode, "personalized"); assert.equal(b.mode, "personalized"); assert.notDeepEqual(a.categoryBreakdown, b.categoryBreakdown);
  const api = await areaExplorationResponse(genericUser, new Request(`http://local/x?h3=${sameCell}&resolution=5`));
  assert.equal(api.status, 200); const apiBody = await api.json(); assert.equal(apiBody.mode, "generic"); assert.equal(JSON.stringify(apiBody).includes("userId"), false);
  const emptyOcean = latLngToCell(0, -140, 10); const empty = await getAreaExplorationIntelligence({ userId: genericUser, h3Index: emptyOcean, resolution: 10 }); assert.equal(empty.totalPlaceCount, 0);

  const representative: Record<string, unknown> = {};
  for (const [name, latitude, longitude] of [["Nashville", 36.1627, -86.7816], ["Washington", 38.9072, -77.0369], ["Denver", 39.7392, -104.9903]] as const) {
    representative[name] = {};
    for (const resolution of [4, 5, 7, 8, 10]) {
      const h3Index = latLngToCell(latitude, longitude, resolution); const samples: number[] = []; let result;
      for (let run = 0; run < 3; run += 1) { const started = performance.now(); result = await getAreaExplorationIntelligence({ userId: genericUser, h3Index, resolution }); samples.push(Math.round((performance.now() - started) * 100) / 100); }
      (representative[name] as Record<string, unknown>)[`res${resolution}`] = { totalPlaceCount: result?.totalPlaceCount, categoryBreakdown: result?.categoryBreakdown, latencyMs: samples };
    }
  }
  const sizes = (await pool.query("SELECT pg_size_pretty(pg_relation_size('public.attraction_h3_category_aggregates')) table_size,pg_size_pretty(pg_indexes_size('public.attraction_h3_category_aggregates')) index_size,count(*)::int rows FROM public.attraction_h3_category_aggregates")).rows[0];
  const plan = (await pool.query("EXPLAIN (ANALYZE,BUFFERS,FORMAT TEXT) SELECT source_category,attraction_count FROM public.attraction_h3_category_aggregates WHERE h3_resolution=5 AND h3_index=$1", [sameCell])).rows.map((row) => row["QUERY PLAN"]).join(" ");
  assert.match(plan, /Index Scan/);

  const hookSource = readFileSync(new URL("../src/lib/exploration-intelligence/use-area-intelligence.ts", import.meta.url), "utf8");
  assert.match(hookSource, /AbortController/); assert.match(hookSource, /sequence\.current === requestSequence/);
  const providerFree = ["model.ts", "service.ts", "response.ts"].map((file) => readFileSync(new URL(`../src/lib/exploration-intelligence/${file}`, import.meta.url), "utf8")).join("\n");
  for (const provider of ["Valhalla", "HERE", "Google", "/api/route", "/api/geocode"]) assert.equal(providerFree.includes(provider), false);

  await pool.query("DELETE FROM public.users WHERE id=ANY($1::uuid[])", [[userA, userB, genericUser]]);
  assert.deepEqual((await invariants()).rows[0], before);
  console.log(JSON.stringify({ scope, aggregateSums, sizes, indexUsed: true, representative }, null, 2));
} finally {
  await pool.query("DELETE FROM public.user_interest_preferences WHERE user_id=ANY($1::uuid[])", [[userA, userB, genericUser]]).catch(() => undefined);
  await pool.query("DELETE FROM public.users WHERE id=ANY($1::uuid[])", [[userA, userB, genericUser]]).catch(() => undefined);
  await pool.end();
}
