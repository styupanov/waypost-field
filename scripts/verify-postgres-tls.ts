import assert from "node:assert/strict";
import { buildPostgresPoolConfig, DatabaseConfigurationError } from "../src/lib/db/postgres-config.ts";

const local = buildPostgresPoolConfig({ DATABASE_URL: "postgresql://localhost/travel" });
assert.equal(local.connectionString, "postgresql://localhost/travel");
assert.equal(local.ssl, undefined);

const secure = buildPostgresPoolConfig({
  DATABASE_URL: "postgresql://user:placeholder@db.example.com/travel?sslmode=verify-full&sslrootcert=C%3A%2Flocal.pem",
  RDS_SSL_ROOT_CERT: "certs/global-bundle.pem",
});
assert.equal(secure.ssl && typeof secure.ssl === "object" && secure.ssl.rejectUnauthorized, true);
assert.match(String(secure.ssl && typeof secure.ssl === "object" && secure.ssl.ca), /BEGIN CERTIFICATE/);
assert.doesNotMatch(String(secure.connectionString), /sslmode|sslrootcert/);

assert.throws(
  () => buildPostgresPoolConfig({
    DATABASE_URL: "postgresql://user:placeholder@db.example.com/travel?sslmode=disable",
    RDS_SSL_ROOT_CERT: "certs/global-bundle.pem",
  }),
  (error) => error instanceof DatabaseConfigurationError && /verify-full/.test(error.message)
);

assert.throws(
  () => buildPostgresPoolConfig({
    DATABASE_URL: "postgresql://user:placeholder@db.example.com/travel",
    RDS_SSL_ROOT_CERT: "certs/missing.pem",
  }),
  (error) => error instanceof DatabaseConfigurationError && /valid PEM/.test(error.message)
);

console.log("PostgreSQL TLS configuration verification passed.");
