import assert from "node:assert/strict";
import {
  ExplorationRebuildLockError,
  ExplorationRebuildValidationError,
  prepareExplorationModel,
  rebuildExplorationIntelligence,
  type ExplorationSourceRow,
  type RebuildDatabase,
} from "../src/lib/exploration-intelligence/rebuild.ts";
import { rawExplorationPotential } from "../src/lib/exploration-intelligence/model.ts";
import { potentialNormalizationCacheKey } from "../src/lib/exploration-potential/service.ts";
import { EXPLORATION_H3_RESOLUTIONS } from "../src/lib/exploration-intelligence/validation.ts";

const source = (category: string | null = "Nature & Parks", latitude = 45, longitude = -122): ExplorationSourceRow => ({
  category, latitude, longitude, nullGeometry: false,
});

const small = [source(), source("Museums", 46, -123), source("Fun & Games", 47, -124), source("Other", 48, -125)];
const prepared = prepareExplorationModel(small);
assert.equal(prepared.validation.scopedRows, 4);
assert.equal(prepared.validation.canonicallyMappedRows, 2);
assert.equal(prepared.validation.intentionallyExcludedRows, 1);
assert.equal(prepared.validation.otherCategoryRows, 1);
assert.equal(prepared.validation.admittedRows, 4);
assert.equal(prepared.aggregates.filter((row) => row.sourceCategory === "Other").length, EXPLORATION_H3_RESOLUTIONS.length);
assert.deepEqual(prepared.resolutions.map((row) => row.resolution), [...EXPLORATION_H3_RESOLUTIONS]);
assert.ok(prepared.resolutions.every((row) => row.attractions === 4));

const grown = prepareExplorationModel(Array.from({ length: 1_001 }, (_, index) => source("Nature & Parks", 42 + (index % 50) / 100, -124 + (index % 50) / 100)));
assert.equal(grown.validation.admittedRows, 1_001, "Dataset growth must not require a hardcoded count change.");
assert.ok(grown.resolutions.every((row) => row.attractions === 1_001));

assert.throws(
  () => prepareExplorationModel([...small, source("Unexpected New Category")]),
  (error: unknown) => error instanceof ExplorationRebuildValidationError && error.report.unknownCategories.some((item) => item.category === "Unexpected New Category" && item.count === 1)
);
const withNullCategory = prepareExplorationModel([...small, source(null, 44, -121)]);
assert.equal(withNullCategory.validation.nullCategoryRows, 1);
assert.equal(withNullCategory.validation.skippedRows, 1);
assert.equal(withNullCategory.validation.admittedRows, small.length);
assert.ok(withNullCategory.resolutions.every((row) => row.attractions === small.length));
assert.throws(
  () => prepareExplorationModel([...small, { category: "Museums", latitude: null, longitude: null, nullGeometry: true }]),
  (error: unknown) => error instanceof ExplorationRebuildValidationError && error.report.nullGeometryRows === 1
);

class FakeDatabase implements RebuildDatabase {
  queries: string[] = [];
  modelVersion = "before";
  readonly sourceRows: ExplorationSourceRow[];
  readonly lockAvailable: boolean;
  constructor(sourceRows: ExplorationSourceRow[], lockAvailable = true) {
    this.sourceRows = sourceRows;
    this.lockAvailable = lockAvailable;
  }
  async query<Row = Record<string, unknown>>(sql: string, parameters: unknown[] = []) {
    this.queries.push(sql);
    let rows: unknown[] = [];
    let rowCount = 0;
    if (sql.includes("pg_try_advisory_lock")) { rows = [{ acquired: this.lockAvailable }]; rowCount = 1; }
    else if (sql.includes("FROM public.attractions")) { rows = this.sourceRows; rowCount = this.sourceRows.length; }
    else if (sql.includes("sum(attraction_count)")) { rows = EXPLORATION_H3_RESOLUTIONS.map((h3_resolution) => ({ h3_resolution, source_rows: this.sourceRows.length })); rowCount = rows.length; }
    else if (sql.includes("sum(total_attraction_count)")) { rows = EXPLORATION_H3_RESOLUTIONS.map((h3_resolution) => ({ h3_resolution, source_rows: this.sourceRows.length })); rowCount = rows.length; }
    else if (sql.includes("missing H3") || sql.includes("LEFT JOIN public.attraction_h3_cells")) { rows = [{ count: 0 }]; rowCount = 1; }
    else if (sql.startsWith("UPDATE public.exploration_intelligence_metadata")) { this.modelVersion = String(parameters[0]); rowCount = 1; }
    return { rows: rows as Row[], rowCount };
  }
}

const failed = new FakeDatabase([...small, source("Unknown")]);
await assert.rejects(() => rebuildExplorationIntelligence(failed), ExplorationRebuildValidationError);
assert.equal(failed.modelVersion, "before");
assert.equal(failed.queries.some((sql) => sql === "BEGIN" || sql.startsWith("TRUNCATE")), false, "Validation must finish before replacement starts.");

const dryRun = new FakeDatabase(small);
const dryResult = await rebuildExplorationIntelligence(dryRun, { dryRun: true });
assert.equal(dryResult.transaction, "SKIPPED");
assert.equal(dryRun.modelVersion, "before");
assert.equal(dryRun.queries.some((sql) => sql === "BEGIN" || sql.startsWith("TRUNCATE")), false);

const successful = new FakeDatabase(small);
const successResult = await rebuildExplorationIntelligence(successful, { modelVersion: "after" });
assert.equal(successResult.transaction, "COMMITTED");
assert.equal(successful.modelVersion, "after");
assert.ok(successful.queries.includes("COMMIT"));

class FailingInsertDatabase extends FakeDatabase {
  override async query<Row = Record<string, unknown>>(sql: string, parameters: unknown[] = []) {
    if (sql.startsWith("INSERT INTO public.attraction_h3_category_aggregates")) {
      this.queries.push(sql);
      throw new Error("fixture insert failure");
    }
    return super.query<Row>(sql, parameters);
  }
}
const failedInsert = new FailingInsertDatabase(small);
await assert.rejects(() => rebuildExplorationIntelligence(failedInsert, { modelVersion: "must-not-activate" }), /fixture insert failure/);
assert.equal(failedInsert.modelVersion, "before");
assert.ok(failedInsert.queries.includes("ROLLBACK"));
assert.equal(potentialNormalizationCacheKey("before", 4, []), "before:4:generic");
assert.equal(potentialNormalizationCacheKey("after", 4, []), "after:4:generic");
assert.notEqual(potentialNormalizationCacheKey("before", 4, []), potentialNormalizationCacheKey("after", 4, []));

const locked = new FakeDatabase(small, false);
await assert.rejects(() => rebuildExplorationIntelligence(locked), ExplorationRebuildLockError);
assert.equal(locked.queries.some((sql) => sql.includes("FROM public.attractions")), false);

assert.equal(rawExplorationPotential(10, 2), Math.round(Math.log1p(10) * 1.08 * 1000) / 1000);
console.log("Exploration Intelligence rebuild validation, atomicity, versioning, locking, and growth checks passed.");
