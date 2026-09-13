import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import pg from "pg";
import { readSchema, schemaDifferences } from "./schema-catalog.mjs";

// DATABASE_URL identifies the schema reference only. All test writes target a newly
// generated database on the same local server. Never accept an existing test DB name.
let reference, admin, disposable;
let created = false;
const name = `waypost_schema_check_${randomUUID().replaceAll("-", "")}`;
let sourceName;
try {
  const sourceUrl = new URL(process.env.DATABASE_URL);
  assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(sourceUrl.hostname), "Schema reference must be local");
  sourceName = decodeURIComponent(sourceUrl.pathname.slice(1));
  reference = new pg.Client({ connectionString: sourceUrl.toString() });
  await reference.connect();
  await reference.query("BEGIN READ ONLY");
  const expected = await readSchema(reference);
  await reference.query("ROLLBACK");
  await reference.end();
  reference = null;

  const adminUrl = new URL(sourceUrl);
  adminUrl.pathname = "/postgres";
  admin = new pg.Client({ connectionString: adminUrl.toString() });
  await admin.connect();
  assert.ok(/^waypost_schema_check_[a-f0-9]{32}$/.test(name) && name !== sourceName);
  await admin.query(`CREATE DATABASE "${name}" TEMPLATE template0`);
  created = true;
  const testUrl = new URL(sourceUrl);
  testUrl.pathname = `/${name}`;
  disposable = new pg.Client({ connectionString: testUrl.toString() });
  await disposable.connect();
  assert.equal((await disposable.query("SELECT count(*)::int AS count FROM pg_tables WHERE schemaname='public'")).rows[0].count, 0);
  assert.equal((await disposable.query("SELECT count(*)::int AS count FROM pg_extension WHERE extname='postgis'")).rows[0].count, 0);

  const migrations = (await readdir("db/migrations")).filter((file) => /^\d+_.+\.sql$/.test(file)).sort();
  for (let attempt = 1; attempt <= 2; attempt++) {
    const run = spawnSync(process.execPath, ["scripts/migrate.mjs", "--target", "local"], {
      cwd: process.cwd(), env: { ...process.env, DATABASE_URL: testUrl.toString() }, encoding: "utf8",
    });
    // The runner sanitizes errors and never prints the connection URL.
    process.stdout.write(run.stdout || "");
    process.stderr.write(run.stderr || "");
    assert.equal(run.status, 0, "Disposable migration runner failed");
    assert.equal((await disposable.query("SELECT count(*)::int AS count FROM public.waypost_schema_migrations")).rows[0].count, migrations.length);
  }
  const actual = await readSchema(disposable);
  const differences = schemaDifferences(expected, actual);
  if (differences.length) console.log(JSON.stringify({ event: "schema_differences", differences }));
  assert.equal(differences.length, 0, "Provisioned schema differs from the schema reference");

  // Exercise adoption/replay of 000 without touching the working reference database.
  const baseline = await readFile(path.join("db/migrations", migrations[0]), "utf8");
  await disposable.query("BEGIN");
  await disposable.query(baseline);
  await disposable.query("COMMIT");
  assert.deepEqual(await readSchema(disposable), actual);
  // An existing placeholder/incompatible table must fail baseline adoption.
  await disposable.query("BEGIN");
  await disposable.query("ALTER TABLE public.attractions ALTER COLUMN name TYPE text");
  await assert.rejects(() => disposable.query(baseline), (error) => error.code === "P0001");
  await disposable.query("ROLLBACK");

  // Only migration history and the repository-defined metadata singleton may contain rows;
  // source/user data is never copied.
  for (const table of actual.tables.filter((table) => !["waypost_schema_migrations", "exploration_intelligence_metadata"].includes(table.name))) {
    assert.ok(/^[a-z_][a-z_0-9]*$/.test(table.name));
    assert.equal((await disposable.query(`SELECT count(*)::int AS count FROM public."${table.name}"`)).rows[0].count, 0);
  }
  assert.deepEqual(
    (await disposable.query("SELECT model_version,source_row_count,accepted_row_count FROM public.exploration_intelligence_metadata")).rows,
    [{ model_version: "legacy", source_row_count: 0, accepted_row_count: 0 }]
  );
  console.log(JSON.stringify({ event: "clean_database_verified", migrations: migrations.length,
    schemaObjects: Object.fromEntries(Object.entries(actual).map(([section, rows]) => [section, rows.length])),
    differences: 0, emptyStart: true, dataCopied: false, baselineReplay: true, incompatibleBaselineRejected: true,
    postgisVersion: (await disposable.query("SELECT extversion FROM pg_extension WHERE extname='postgis'")).rows[0].extversion }));
} catch (error) {
  console.error(JSON.stringify({ event: "clean_database_failed", errorType: error.name, code: error.code }));
  process.exitCode = 1;
} finally {
  if (reference) await reference.end();
  if (disposable) await disposable.end();
  if (created && admin) {
    // Destruction is limited to the exact database created by this run; no FORCE/CASCADE.
    assert.ok(/^waypost_schema_check_[a-f0-9]{32}$/.test(name) && name !== sourceName);
    await admin.query(`DROP DATABASE "${name}"`);
    console.log(JSON.stringify({ event: "disposable_database_removed" }));
  }
  if (admin) await admin.end();
}
