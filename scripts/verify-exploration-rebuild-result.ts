import assert from "node:assert/strict";
import { parseArgs } from "node:util";
import { getPostgresPool } from "../src/lib/db/postgres.ts";
import { EXPLORATION_H3_RESOLUTIONS } from "../src/lib/exploration-intelligence/validation.ts";

const { values } = parseArgs({ options: { target: { type: "string", default: "local" } } });
if (values.target !== "local" && values.target !== "rds") throw new Error("target must be local or rds.");
if (values.target === "rds") {
  if (!process.env.RDS_DATABASE_URL) throw new Error("RDS_DATABASE_URL is required for --target rds.");
  if (!process.env.RDS_SSL_ROOT_CERT) throw new Error("RDS_SSL_ROOT_CERT is required for --target rds.");
  process.env.DATABASE_URL = process.env.RDS_DATABASE_URL;
}

const pool = getPostgresPool();
try {
  const metadata = (await pool.query(`SELECT model_version,built_at,source_row_count,accepted_row_count
    FROM public.exploration_intelligence_metadata WHERE singleton_key=1`)).rows[0];
  assert.ok(metadata, "Exploration Intelligence metadata is missing.");
  const aggregateTotals = (await pool.query(`SELECT h3_resolution,count(DISTINCT h3_index)::int cells,
    sum(attraction_count)::int attractions FROM public.attraction_h3_category_aggregates
    GROUP BY h3_resolution ORDER BY h3_resolution`)).rows;
  const cellTotals = (await pool.query(`SELECT h3_resolution,count(*)::int cells,
    sum(total_attraction_count)::int attractions FROM public.attraction_h3_cells
    GROUP BY h3_resolution ORDER BY h3_resolution`)).rows;
  assert.deepEqual(aggregateTotals.map((row) => row.h3_resolution), [...EXPLORATION_H3_RESOLUTIONS]);
  assert.deepEqual(cellTotals.map((row) => row.h3_resolution), [...EXPLORATION_H3_RESOLUTIONS]);
  assert.ok(aggregateTotals.every((row) => row.attractions === metadata.accepted_row_count));
  assert.ok(cellTotals.every((row) => row.attractions === metadata.accepted_row_count));
  assert.deepEqual(aggregateTotals.map((row) => row.cells), cellTotals.map((row) => row.cells));
  const missingCells = (await pool.query(`SELECT count(*)::int count
    FROM public.attraction_h3_category_aggregates a LEFT JOIN public.attraction_h3_cells c
      ON c.h3_resolution=a.h3_resolution AND c.h3_index=a.h3_index
    WHERE c.h3_index IS NULL`)).rows[0].count;
  assert.equal(missingCells, 0);
  const extent = (await pool.query(`SELECT ST_XMin(ST_Extent(center_geom)) west,ST_YMin(ST_Extent(center_geom)) south,
    ST_XMax(ST_Extent(center_geom)) east,ST_YMax(ST_Extent(center_geom)) north
    FROM public.attraction_h3_cells WHERE h3_resolution=4`)).rows[0];
  const northwest = (await pool.query(`SELECT count(DISTINCT a.h3_index)::int cells,sum(a.attraction_count)::int attractions
    FROM public.attraction_h3_category_aggregates a JOIN public.attraction_h3_cells c
      ON c.h3_resolution=a.h3_resolution AND c.h3_index=a.h3_index
    WHERE a.h3_resolution=4 AND c.center_geom && ST_MakeEnvelope(-125,42,-110,50,4326)`)).rows[0];
  console.log(JSON.stringify({ event: "exploration_intelligence_rebuild_verified", metadata, aggregateTotals, cellTotals, missingCells, resolutionFourExtent: extent, northwest }, null, 2));
} finally {
  await pool.end();
}
