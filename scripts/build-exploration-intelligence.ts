import { performance } from "node:perf_hooks";
import { parseArgs } from "node:util";
import { getPostgresPool } from "../src/lib/db/postgres.ts";
import {
  ExplorationRebuildLockError,
  ExplorationRebuildValidationError,
  rebuildExplorationIntelligence,
  type SourceValidationReport,
} from "../src/lib/exploration-intelligence/rebuild.ts";

const { values } = parseArgs({ options: {
  "dry-run": { type: "boolean", default: false },
  target: { type: "string", default: "local" },
} });
if (values.target !== "local" && values.target !== "rds") throw new Error("target must be local or rds.");
if (values.target === "rds") {
  if (!process.env.RDS_DATABASE_URL) throw new Error("RDS_DATABASE_URL is required for --target rds.");
  if (!process.env.RDS_SSL_ROOT_CERT) throw new Error("RDS_SSL_ROOT_CERT is required for --target rds.");
  process.env.DATABASE_URL = process.env.RDS_DATABASE_URL;
}
const started = performance.now();
const pool = getPostgresPool();

function sourceSummary(report: SourceValidationReport) {
  return {
    scopedAttractions: report.scopedRows,
    validCoordinates: report.validCoordinateRows,
    invalidCoordinates: report.invalidCoordinateRows,
    nullGeometry: report.nullGeometryRows,
    invalidLatitude: report.invalidLatitudeRows,
    invalidLongitude: report.invalidLongitudeRows,
    nonFiniteCoordinates: report.nonFiniteCoordinateRows,
    nullCategories: report.nullCategoryRows,
    canonicallyMapped: report.canonicallyMappedRows,
    intentionallyExcluded: report.intentionallyExcludedRows,
    other: report.otherCategoryRows,
    unknownCategories: report.unknownCategoryRows,
    skipped: report.skippedRows,
    aggregated: report.admittedRows,
  };
}

function printReport(result: Awaited<ReturnType<typeof rebuildExplorationIntelligence>>) {
  const report = {
    event: "exploration_intelligence_rebuild_completed",
    dryRun: result.dryRun,
    source: sourceSummary(result.validation),
    categoryValidation: {
      excluded: result.validation.intentionallyExcludedCategories,
      other: result.validation.otherCategories,
      unknown: result.validation.unknownCategories,
    },
    h3: result.resolutions,
    resolutionFourExtent: result.resolutionFourExtent,
    modelVersion: result.modelVersion,
    status: { validation: "PASS", transaction: result.transaction, integrity: "PASS" },
    durationMs: Math.round(performance.now() - started),
  };
  console.log("Exploration Intelligence rebuild");
  console.log(`Source: ${report.source.scopedAttractions} scoped / ${report.source.validCoordinates} valid coordinates / ${report.source.aggregated} aggregated`);
  console.log(`Categories: ${report.source.canonicallyMapped} mapped / ${report.source.intentionallyExcluded} intentionally excluded from personalization / ${report.source.other} Other / ${report.source.nullCategories} null skipped / ${report.source.unknownCategories} unknown`);
  for (const row of result.resolutions) console.log(`H3 res ${row.resolution}: ${row.cells} cells / ${row.attractions} attractions`);
  if (result.resolutionFourExtent) console.log(`Extent res 4: west ${result.resolutionFourExtent.west}, south ${result.resolutionFourExtent.south}, east ${result.resolutionFourExtent.east}, north ${result.resolutionFourExtent.north}`);
  console.log(`Status: validation PASS / transaction ${result.transaction} / integrity PASS`);
  console.log(JSON.stringify(report));
}

try {
  const client = await pool.connect();
  try {
    printReport(await rebuildExplorationIntelligence(client, { dryRun: values["dry-run"] }));
  } finally {
    client.release();
  }
} catch (error) {
  if (error instanceof ExplorationRebuildValidationError) {
    console.error(JSON.stringify({
      event: "exploration_intelligence_validation_failed",
      source: sourceSummary(error.report),
      intentionallyExcludedCategories: error.report.intentionallyExcludedCategories,
      otherCategories: error.report.otherCategories,
      unknownCategories: error.report.unknownCategories,
    }));
  } else if (error instanceof ExplorationRebuildLockError) {
    console.error(JSON.stringify({ event: "exploration_intelligence_rebuild_locked", message: error.message }));
  } else {
    console.error(JSON.stringify({ event: "exploration_intelligence_rebuild_failed", errorType: error instanceof Error ? error.name : "UnknownError" }));
  }
  process.exitCode = 1;
} finally {
  await pool.end();
}
