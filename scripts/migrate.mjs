import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import pg from "pg";
import { parseArgs } from "node:util";
import { databaseConfig, DatabaseTargetError, migrationPreflight } from "./database-target.mjs";

const { Client } = pg;
const migrationsDirectory = path.join(process.cwd(), "db", "migrations");

let client;

try {
  const { values } = parseArgs({ options: { target: { type: "string", default: "local" }, "check-only": { type: "boolean", default: false } } });
  client = new Client(databaseConfig(values.target));
  await client.connect();
  const identity = (await client.query("SELECT current_database() AS database, current_setting('server_version') AS server_version, (SELECT ssl FROM pg_stat_ssl WHERE pid=pg_backend_pid()) AS tls")).rows[0];
  if (values.target === "rds" && (!identity.tls || client.connection.stream.authorized !== true)) {
    throw new DatabaseTargetError("RDS connection must have verified TLS.");
  }
  const postgisVersion = await migrationPreflight(client);
  console.log(JSON.stringify({ event: "migration_preflight_passed", target: values.target, postgisVersion, ...identity }));
  if (!values["check-only"]) {
    await client.query(`
      CREATE TABLE IF NOT EXISTS public.waypost_schema_migrations (
        name TEXT PRIMARY KEY,
        checksum TEXT NOT NULL,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);

    const migrationNames = (await readdir(migrationsDirectory))
      .filter((name) => /^\d+_.+\.sql$/.test(name))
      .sort();

    for (const name of migrationNames) {
      const sql = await readFile(path.join(migrationsDirectory, name), "utf8");
      const checksum = createHash("sha256").update(sql).digest("hex");
      const existing = await client.query(
        "SELECT checksum FROM public.waypost_schema_migrations WHERE name = $1",
        [name]
      );
      if (existing.rowCount) {
        if (existing.rows[0].checksum !== checksum) {
          throw new DatabaseTargetError(`Applied migration ${name} has changed.`);
        }
        console.log(`Already applied: ${name}`);
        continue;
      }

      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query(
          "INSERT INTO public.waypost_schema_migrations (name, checksum) VALUES ($1, $2)",
          [name, checksum]
        );
        await client.query("COMMIT");
        console.log(`Applied: ${name}`);
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    }
  }
} catch (error) {
  // Driver errors can embed connection details; only our static errors are printable.
  console.error(JSON.stringify({ event: "migration_failed", errorType: error?.name, code: error?.code,
    reason: error instanceof DatabaseTargetError ? error.message : undefined }));
  process.exitCode = 1;
} finally {
  if (client) await client.end();
}
