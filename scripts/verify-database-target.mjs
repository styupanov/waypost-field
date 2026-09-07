import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, unlinkSync, rmdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { rootCertificates } from "node:tls";
import { databaseConfig, migrationPreflight } from "./database-target.mjs";

const directory = mkdtempSync(path.join(tmpdir(), "waypost-db-target-"));
const certificate = path.join(directory, "test-ca.pem");
writeFileSync(certificate, rootCertificates[0]);
try {
  const env = { DATABASE_URL: "postgresql://local:placeholder@localhost/travel", RDS_DATABASE_URL: "postgresql://rds:placeholder@db.example.com/travel", RDS_SSL_ROOT_CERT: certificate };
  const before = { ...env };
  assert.deepEqual(databaseConfig("local", env), { connectionString: env.DATABASE_URL });
  const config = databaseConfig("rds", env);
  assert.equal(config.host, "db.example.com");
  assert.equal(config.database, "travel");
  assert.equal(config.ssl.rejectUnauthorized, true);
  assert.equal(config.ssl.servername, "db.example.com");
  assert.equal(config.ssl.ca, rootCertificates[0]);
  assert.equal(config.connectionString, undefined);
  assert.deepEqual(env, before);
  assert.throws(() => databaseConfig("rds", { DATABASE_URL: env.DATABASE_URL }), /RDS_DATABASE_URL/);
  assert.throws(() => databaseConfig("other", env), /target/);
  for (const query of ["sslmode=disable", "sslmode=require", "ssl=no-verify", "sslmode=verify-full&sslmode=disable", "host=localhost"]) {
    assert.throws(() => databaseConfig("rds", { ...env, RDS_DATABASE_URL: env.RDS_DATABASE_URL + "?" + query }));
  }
  assert.throws(() => databaseConfig("rds", { ...env, RDS_SSL_ROOT_CERT: "missing-certificate" }), /readable PEM/);
  assert.throws(() => databaseConfig("rds", { ...env, RDS_DATABASE_URL: "secret-invalid-url" }), /PostgreSQL URL/);
  const urlCertificate = databaseConfig("rds", { RDS_DATABASE_URL: env.RDS_DATABASE_URL + "?sslmode=verify-full&sslrootcert=" + encodeURIComponent(certificate) });
  assert.equal(urlCertificate.ssl.rejectUnauthorized, true);
  assert.equal(await migrationPreflight({ query: async (sql) => sql.includes("pg_extension") ? { rowCount: 1, rows: [{ extversion: "3.6" }] } : { rows: [{ present: true }] } }), "3.6");
  await assert.rejects(() => migrationPreflight({ query: async () => ({ rowCount: 0 }) }), /PostGIS/);
  assert.equal(await migrationPreflight({ query: async (sql) => sql.includes("pg_available_extensions") ? { rowCount: 1, rows: [{ default_version: "3.6" }] } : { rowCount: 0 } }), null);
  console.log("Database target, verified TLS, local isolation, and migration preflight checks passed.");
} finally {
  unlinkSync(certificate);
  rmdirSync(directory);
}
