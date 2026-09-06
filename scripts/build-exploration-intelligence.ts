import { performance } from "node:perf_hooks";
import { cellToLatLng } from "h3-js";
import { getPostgresPool } from "../src/lib/db/postgres.ts";
import { mapRawAttractionCategory } from "../src/lib/attractions/category-mapping.ts";
import { EXPLORATION_H3_RESOLUTIONS } from "../src/lib/exploration-intelligence/validation.ts";
import { buildH3CategoryAggregates } from "../src/lib/exploration-intelligence/aggregation.ts";

type SourceRow = { category: string; latitude: number; longitude: number };
const started = performance.now();
const pool = getPostgresPool();

try {
  const source = await pool.query<SourceRow>(`SELECT category,ST_Y(geom::geometry) latitude,ST_X(geom::geometry) longitude
    FROM public.attractions WHERE source_group='attractions'`);
  const sourceCategoryCounts = new Map<string, number>();
  let mappedRows = 0;
  for (const row of source.rows) {
    sourceCategoryCounts.set(row.category, (sourceCategoryCounts.get(row.category) ?? 0) + 1);
    if (mapRawAttractionCategory(row.category)) mappedRows += 1;
  }
  const { aggregates: entries, validGeometryRows, invalidGeometryRows } = buildH3CategoryAggregates(source.rows.map((row) => ({ sourceCategory: row.category, latitude: row.latitude, longitude: row.longitude })));
  const cellCounts = new Map<string, number>();
  for (const row of entries) { const key = `${row.resolution}\u001f${row.h3Index}`; cellCounts.set(key, (cellCounts.get(key) ?? 0) + row.count); }
  const cells = [...cellCounts.entries()].map(([key, count]) => { const [resolution, h3Index] = key.split("\u001f"); const [latitude, longitude] = cellToLatLng(h3Index); return { resolution: Number(resolution), h3Index, count, latitude, longitude }; })
    .sort((a, b) => a.resolution - b.resolution || a.h3Index.localeCompare(b.h3Index));
  if (source.rowCount !== 53_731) throw new Error(`Expected 53,731 source_group=attractions rows, received ${source.rowCount}.`);
  if (invalidGeometryRows !== 0 || validGeometryRows !== source.rowCount) throw new Error("Every scoped attraction must have valid coordinates before rebuild.");
  if (mappedRows !== 45_253) throw new Error(`Expected 45,253 canonically mapped rows, received ${mappedRows}.`);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("TRUNCATE public.attraction_h3_cells");
    await client.query("TRUNCATE public.attraction_h3_category_aggregates");
    for (let offset = 0; offset < entries.length; offset += 5_000) {
      const batch = entries.slice(offset, offset + 5_000);
      await client.query(`INSERT INTO public.attraction_h3_category_aggregates
        (h3_resolution,h3_index,source_category,attraction_count)
        SELECT * FROM unnest($1::smallint[],$2::text[],$3::text[],$4::integer[])`, [
        batch.map((row) => row.resolution), batch.map((row) => row.h3Index), batch.map((row) => row.sourceCategory), batch.map((row) => row.count),
      ]);
    }
    for (let offset = 0; offset < cells.length; offset += 5_000) {
      const batch = cells.slice(offset, offset + 5_000);
      await client.query(`INSERT INTO public.attraction_h3_cells
        (h3_resolution,h3_index,total_attraction_count,center_geom)
        SELECT resolution,h3_index,total_count,ST_SetSRID(ST_MakePoint(longitude,latitude),4326)
        FROM unnest($1::smallint[],$2::text[],$3::integer[],$4::float8[],$5::float8[]) AS data(resolution,h3_index,total_count,latitude,longitude)`, [
        batch.map((row) => row.resolution), batch.map((row) => row.h3Index), batch.map((row) => row.count), batch.map((row) => row.latitude), batch.map((row) => row.longitude),
      ]);
    }
    const sums = await client.query<{ h3_resolution: number; source_rows: number }>("SELECT h3_resolution,sum(attraction_count)::int source_rows FROM public.attraction_h3_category_aggregates GROUP BY h3_resolution ORDER BY h3_resolution");
    if (sums.rows.length !== EXPLORATION_H3_RESOLUTIONS.length || sums.rows.some((row) => row.source_rows !== validGeometryRows)) throw new Error("Aggregate validation failed.");
    const cellSums = await client.query<{ h3_resolution: number; source_rows: number }>("SELECT h3_resolution,sum(total_attraction_count)::int source_rows FROM public.attraction_h3_cells GROUP BY h3_resolution ORDER BY h3_resolution");
    if (cellSums.rows.length !== EXPLORATION_H3_RESOLUTIONS.length || cellSums.rows.some((row) => row.source_rows !== validGeometryRows)) throw new Error("Cell index validation failed.");
    await client.query("COMMIT");
  } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
  await pool.query("ANALYZE public.attraction_h3_category_aggregates");
  await pool.query("ANALYZE public.attraction_h3_cells");
  const rowsByResolution = Object.fromEntries(EXPLORATION_H3_RESOLUTIONS.map((resolution) => [resolution, entries.filter((row) => row.resolution === resolution).length]));
  const sizes = (await pool.query("SELECT pg_size_pretty(pg_relation_size('public.attraction_h3_category_aggregates')) table_size,pg_size_pretty(pg_indexes_size('public.attraction_h3_category_aggregates')) index_size")).rows[0];
  const cellSizes = (await pool.query("SELECT pg_size_pretty(pg_relation_size('public.attraction_h3_cells')) cell_table_size,pg_size_pretty(pg_indexes_size('public.attraction_h3_cells')) cell_index_size")).rows[0];
  console.log(JSON.stringify({
    sourceGroupFilter: "source_group='attractions'", sourceRows: source.rowCount, validGeometryRows, invalidGeometryRows,
    sourceCategoryCounts: Object.fromEntries([...sourceCategoryCounts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))),
    canonicalMappedRows: mappedRows, canonicalUnmappedRows: source.rowCount - mappedRows,
    canonicalMappingCoveragePercent: Math.round(mappedRows / source.rowCount * 10_000) / 100,
    aggregateRowsByResolution: rowsByResolution, aggregateRowCount: entries.length, ...sizes,
    cellRowsByResolution: Object.fromEntries(EXPLORATION_H3_RESOLUTIONS.map((resolution) => [resolution, cells.filter((row) => row.resolution === resolution).length])), cellRowCount: cells.length, ...cellSizes,
    buildDurationMs: Math.round(performance.now() - started),
  }, null, 2));
} finally { await pool.end(); }
