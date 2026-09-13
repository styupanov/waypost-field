import { randomUUID } from "node:crypto";
import { cellToLatLng } from "h3-js";
import { classifyRawAttractionCategory } from "../attractions/category-mapping.ts";
import { buildH3CategoryAggregates, type ExplorationAggregateRow } from "./aggregation.ts";
import { EXPLORATION_H3_RESOLUTIONS } from "./validation.ts";

export const EXPLORATION_REBUILD_ADVISORY_LOCK_ID = 741_025_2026;
const INSERT_BATCH_SIZE = 5_000;

export type ExplorationSourceRow = {
  category: string | null;
  latitude: number | null;
  longitude: number | null;
  nullGeometry: boolean;
};

type QueryResult<Row> = { rows: Row[]; rowCount: number | null };
export type RebuildDatabase = {
  query<Row = Record<string, unknown>>(sql: string, parameters?: unknown[]): Promise<QueryResult<Row>>;
};

export type CategoryCount = { category: string | null; count: number };
export type SourceValidationReport = {
  scopedRows: number;
  validCoordinateRows: number;
  invalidCoordinateRows: number;
  nullGeometryRows: number;
  invalidLatitudeRows: number;
  invalidLongitudeRows: number;
  nonFiniteCoordinateRows: number;
  nullCategoryRows: number;
  canonicallyMappedRows: number;
  intentionallyExcludedRows: number;
  otherCategoryRows: number;
  unknownCategoryRows: number;
  skippedRows: number;
  admittedRows: number;
  mappedCategories: CategoryCount[];
  intentionallyExcludedCategories: CategoryCount[];
  otherCategories: CategoryCount[];
  unknownCategories: CategoryCount[];
};

export type PreparedExplorationModel = {
  validation: SourceValidationReport;
  aggregates: ExplorationAggregateRow[];
  cells: { resolution: number; h3Index: string; count: number; latitude: number; longitude: number }[];
  resolutions: { resolution: number; cells: number; attractions: number }[];
  resolutionFourExtent: { west: number; south: number; east: number; north: number } | null;
};

export class ExplorationRebuildValidationError extends Error {
  readonly report: SourceValidationReport;
  constructor(report: SourceValidationReport) {
    super("Exploration Intelligence source validation failed.");
    this.name = "ExplorationRebuildValidationError";
    this.report = report;
  }
}

export class ExplorationRebuildLockError extends Error {
  constructor() {
    super("Another Exploration Intelligence rebuild is already running.");
    this.name = "ExplorationRebuildLockError";
  }
}

function countedCategories(rows: ExplorationSourceRow[], disposition: "mapped" | "excluded" | "other" | "unknown") {
  const counts = new Map<string | null, number>();
  for (const row of rows) {
    if (classifyRawAttractionCategory(row.category) !== disposition) continue;
    counts.set(row.category, (counts.get(row.category) ?? 0) + 1);
  }
  return [...counts].map(([category, count]) => ({ category, count }))
    .sort((left, right) => right.count - left.count || (left.category ?? "").localeCompare(right.category ?? ""));
}

export function validateExplorationSource(rows: ExplorationSourceRow[]): SourceValidationReport {
  let validCoordinateRows = 0;
  let nullGeometryRows = 0;
  let invalidLatitudeRows = 0;
  let invalidLongitudeRows = 0;
  let nonFiniteCoordinateRows = 0;
  let nullCategoryRows = 0;
  let canonicallyMappedRows = 0;
  let intentionallyExcludedRows = 0;
  let otherCategoryRows = 0;
  let unknownCategoryRows = 0;

  for (const row of rows) {
    if (row.category === null) nullCategoryRows += 1;
    const disposition = classifyRawAttractionCategory(row.category);
    if (disposition === "mapped") canonicallyMappedRows += 1;
    else if (disposition === "excluded") intentionallyExcludedRows += 1;
    else if (disposition === "other") otherCategoryRows += 1;
    else if (disposition === "unknown") unknownCategoryRows += 1;

    if (row.nullGeometry || row.latitude === null || row.longitude === null) {
      nullGeometryRows += 1;
      continue;
    }
    if (!Number.isFinite(row.latitude) || !Number.isFinite(row.longitude)) {
      nonFiniteCoordinateRows += 1;
      continue;
    }
    let valid = true;
    if (row.latitude < -90 || row.latitude > 90) { invalidLatitudeRows += 1; valid = false; }
    if (row.longitude < -180 || row.longitude > 180) { invalidLongitudeRows += 1; valid = false; }
    if (valid) validCoordinateRows += 1;
  }

  const invalidCoordinateRows = rows.length - validCoordinateRows;
  const valid = invalidCoordinateRows === 0 && unknownCategoryRows === 0;
  const skippedRows = nullCategoryRows;
  return {
    scopedRows: rows.length,
    validCoordinateRows,
    invalidCoordinateRows,
    nullGeometryRows,
    invalidLatitudeRows,
    invalidLongitudeRows,
    nonFiniteCoordinateRows,
    nullCategoryRows,
    canonicallyMappedRows,
    intentionallyExcludedRows,
    otherCategoryRows,
    unknownCategoryRows,
    skippedRows,
    admittedRows: valid ? rows.length - skippedRows : 0,
    mappedCategories: countedCategories(rows, "mapped"),
    intentionallyExcludedCategories: countedCategories(rows, "excluded"),
    otherCategories: countedCategories(rows, "other"),
    unknownCategories: countedCategories(rows, "unknown"),
  };
}

export function prepareExplorationModel(rows: ExplorationSourceRow[]): PreparedExplorationModel {
  const validation = validateExplorationSource(rows);
  if (validation.invalidCoordinateRows > 0 || validation.unknownCategoryRows > 0) {
    throw new ExplorationRebuildValidationError(validation);
  }
  const { aggregates, validGeometryRows, invalidGeometryRows } = buildH3CategoryAggregates(
    rows.filter((row) => row.category !== null)
      .map((row) => ({ sourceCategory: row.category!, latitude: row.latitude!, longitude: row.longitude! }))
  );
  if (validGeometryRows !== validation.admittedRows || invalidGeometryRows !== 0) {
    throw new Error("Validated source and H3 aggregation counts differ.");
  }

  const cellCounts = new Map<string, number>();
  for (const row of aggregates) {
    const key = `${row.resolution}\u001f${row.h3Index}`;
    cellCounts.set(key, (cellCounts.get(key) ?? 0) + row.count);
  }
  const cells = [...cellCounts].map(([key, count]) => {
    const [resolution, h3Index] = key.split("\u001f");
    const [latitude, longitude] = cellToLatLng(h3Index);
    return { resolution: Number(resolution), h3Index, count, latitude, longitude };
  }).sort((left, right) => left.resolution - right.resolution || left.h3Index.localeCompare(right.h3Index));

  const resolutions = EXPLORATION_H3_RESOLUTIONS.map((resolution) => ({
    resolution,
    cells: cells.filter((row) => row.resolution === resolution).length,
    attractions: aggregates.filter((row) => row.resolution === resolution).reduce((sum, row) => sum + row.count, 0),
  }));
  if (resolutions.some((row) => row.attractions !== validation.admittedRows)) {
    throw new Error("In-memory aggregate totals do not match admitted source rows.");
  }
  const resolutionFour = cells.filter((row) => row.resolution === 4);
  const resolutionFourExtent = resolutionFour.length ? {
    west: Math.min(...resolutionFour.map((row) => row.longitude)),
    south: Math.min(...resolutionFour.map((row) => row.latitude)),
    east: Math.max(...resolutionFour.map((row) => row.longitude)),
    north: Math.max(...resolutionFour.map((row) => row.latitude)),
  } : null;
  return { validation, aggregates, cells, resolutions, resolutionFourExtent };
}

async function replaceReadModel(database: RebuildDatabase, model: PreparedExplorationModel, modelVersion: string, builtAt: Date) {
  await database.query("BEGIN");
  try {
    await database.query("TRUNCATE public.attraction_h3_cells");
    await database.query("TRUNCATE public.attraction_h3_category_aggregates");
    for (let offset = 0; offset < model.aggregates.length; offset += INSERT_BATCH_SIZE) {
      const batch = model.aggregates.slice(offset, offset + INSERT_BATCH_SIZE);
      await database.query(`INSERT INTO public.attraction_h3_category_aggregates
        (h3_resolution,h3_index,source_category,attraction_count)
        SELECT * FROM unnest($1::smallint[],$2::text[],$3::text[],$4::integer[])`, [
        batch.map((row) => row.resolution), batch.map((row) => row.h3Index), batch.map((row) => row.sourceCategory), batch.map((row) => row.count),
      ]);
    }
    for (let offset = 0; offset < model.cells.length; offset += INSERT_BATCH_SIZE) {
      const batch = model.cells.slice(offset, offset + INSERT_BATCH_SIZE);
      await database.query(`INSERT INTO public.attraction_h3_cells
        (h3_resolution,h3_index,total_attraction_count,center_geom)
        SELECT resolution,h3_index,total_count,ST_SetSRID(ST_MakePoint(longitude,latitude),4326)
        FROM unnest($1::smallint[],$2::text[],$3::integer[],$4::float8[],$5::float8[]) AS data(resolution,h3_index,total_count,latitude,longitude)`, [
        batch.map((row) => row.resolution), batch.map((row) => row.h3Index), batch.map((row) => row.count), batch.map((row) => row.latitude), batch.map((row) => row.longitude),
      ]);
    }
    const sums = await database.query<{ h3_resolution: number; source_rows: number }>(
      "SELECT h3_resolution,sum(attraction_count)::int source_rows FROM public.attraction_h3_category_aggregates GROUP BY h3_resolution ORDER BY h3_resolution"
    );
    if (sums.rows.length !== EXPLORATION_H3_RESOLUTIONS.length || sums.rows.some((row) => row.source_rows !== model.validation.admittedRows)) {
      throw new Error("Persisted aggregate totals do not match admitted source rows.");
    }
    const cellSums = await database.query<{ h3_resolution: number; source_rows: number }>(
      "SELECT h3_resolution,sum(total_attraction_count)::int source_rows FROM public.attraction_h3_cells GROUP BY h3_resolution ORDER BY h3_resolution"
    );
    if (cellSums.rows.length !== EXPLORATION_H3_RESOLUTIONS.length || cellSums.rows.some((row) => row.source_rows !== model.validation.admittedRows)) {
      throw new Error("Persisted cell totals do not match admitted source rows.");
    }
    const missing = await database.query<{ count: number }>(`SELECT count(*)::int count
      FROM public.attraction_h3_category_aggregates a LEFT JOIN public.attraction_h3_cells c
        ON c.h3_resolution=a.h3_resolution AND c.h3_index=a.h3_index
      WHERE c.h3_index IS NULL`);
    if (missing.rows[0]?.count !== 0) throw new Error("An aggregate references a missing H3 cell.");
    const updated = await database.query(`UPDATE public.exploration_intelligence_metadata
      SET model_version=$1,built_at=$2,source_row_count=$3,accepted_row_count=$4 WHERE singleton_key=1`,
      [modelVersion, builtAt, model.validation.scopedRows, model.validation.admittedRows]);
    if (updated.rowCount !== 1) throw new Error("Exploration Intelligence metadata singleton is missing.");
    await database.query("ANALYZE public.attraction_h3_category_aggregates");
    await database.query("ANALYZE public.attraction_h3_cells");
    await database.query("COMMIT");
  } catch (error) {
    await database.query("ROLLBACK");
    throw error;
  }
}

export async function rebuildExplorationIntelligence(
  database: RebuildDatabase,
  options: { dryRun?: boolean; modelVersion?: string; builtAt?: Date } = {}
) {
  const lock = await database.query<{ acquired: boolean }>("SELECT pg_try_advisory_lock($1) acquired", [EXPLORATION_REBUILD_ADVISORY_LOCK_ID]);
  if (!lock.rows[0]?.acquired) throw new ExplorationRebuildLockError();
  try {
    const source = await database.query<ExplorationSourceRow>(`SELECT category,
      ST_Y(geom::geometry) latitude,ST_X(geom::geometry) longitude,(geom IS NULL) "nullGeometry"
      FROM public.attractions WHERE source_group='attractions'`);
    const model = prepareExplorationModel(source.rows);
    if (options.dryRun) return { ...model, dryRun: true, modelVersion: null, transaction: "SKIPPED" as const };
    const modelVersion = options.modelVersion ?? randomUUID();
    const builtAt = options.builtAt ?? new Date();
    await replaceReadModel(database, model, modelVersion, builtAt);
    return { ...model, dryRun: false, modelVersion, builtAt, transaction: "COMMITTED" as const };
  } finally {
    await database.query("SELECT pg_advisory_unlock($1)", [EXPLORATION_REBUILD_ADVISORY_LOCK_ID]);
  }
}
