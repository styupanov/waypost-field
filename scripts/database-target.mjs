import { readFileSync } from "node:fs";
import { createSecureContext } from "node:tls";

export class DatabaseTargetError extends Error {}

// Administrative commands only. The Next.js pool continues using DATABASE_URL.
export function databaseConfig(target = "local", env = process.env) {
  if (target === "local") {
    if (!env.DATABASE_URL) throw new DatabaseTargetError("DATABASE_URL is not configured.");
    return { connectionString: env.DATABASE_URL };
  }
  if (target !== "rds") throw new DatabaseTargetError("Database target must be local or rds.");
  if (!env.RDS_DATABASE_URL) throw new DatabaseTargetError("RDS_DATABASE_URL is not configured; no local fallback is allowed.");
  let url;
  try {
    url = new URL(env.RDS_DATABASE_URL);
    if (!["postgres:", "postgresql:"].includes(url.protocol) || !url.hostname || !url.username || url.pathname.length < 2 || url.hash) throw new Error();
  } catch {
    throw new DatabaseTargetError("RDS_DATABASE_URL must be a PostgreSQL URL with host, user, and database.");
  }
  for (const name of url.searchParams.keys()) {
    if (!["sslmode", "sslrootcert"].includes(name) || url.searchParams.getAll(name).length !== 1) {
      throw new DatabaseTargetError("RDS URL query supports only sslmode and sslrootcert.");
    }
  }
  if (url.searchParams.has("sslmode") && url.searchParams.get("sslmode") !== "verify-full") {
    throw new DatabaseTargetError("RDS requires sslmode=verify-full.");
  }
  const certificate = env.RDS_SSL_ROOT_CERT || url.searchParams.get("sslrootcert");
  if (!certificate) throw new DatabaseTargetError("RDS_SSL_ROOT_CERT or URL sslrootcert must identify the AWS CA bundle.");
  let ca;
  try {
    ca = readFileSync(certificate, "utf8");
    createSecureContext({ ca });
    if (!ca.includes("-----BEGIN CERTIFICATE-----")) throw new Error();
  } catch {
    throw new DatabaseTargetError("RDS CA bundle must be a readable PEM certificate file.");
  }
  try {
    // Explicit fields prevent pg connection-string parsing from replacing SSL options.
    return {
      host: url.hostname, port: Number(url.port || 5432),
      user: decodeURIComponent(url.username), password: decodeURIComponent(url.password),
      database: decodeURIComponent(url.pathname.slice(1)), connectionTimeoutMillis: 10_000,
      ssl: { ca, rejectUnauthorized: true, servername: url.hostname },
    };
  } catch {
    throw new DatabaseTargetError("RDS_DATABASE_URL contains invalid URL encoding.");
  }
}

export async function migrationPreflight(client) {
  const extension = await client.query("SELECT extversion FROM pg_extension WHERE extname='postgis'");
  if (extension.rowCount) return extension.rows[0].extversion;
  const available = await client.query("SELECT default_version FROM pg_available_extensions WHERE name='postgis'");
  if (!available.rowCount) throw new DatabaseTargetError("PostGIS must be installed on the PostgreSQL server before provisioning.");
  // A fresh database is supported: 000 enables PostGIS and creates the baseline.
  return null;
}
