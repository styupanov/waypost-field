import { readFileSync } from "node:fs";
import { createSecureContext } from "node:tls";
import type { PoolConfig } from "pg";

export class DatabaseConfigurationError extends Error {
  constructor(message = "DATABASE_URL is not configured.") {
    super(message);
    this.name = "DatabaseConfigurationError";
  }
}

function connectionStringWithoutTlsQuery(connectionString: string) {
  let parsed: URL;
  try {
    parsed = new URL(connectionString);
  } catch {
    throw new DatabaseConfigurationError("DATABASE_URL is not a valid PostgreSQL URL.");
  }

  if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") {
    throw new DatabaseConfigurationError("DATABASE_URL must use the postgres or postgresql protocol.");
  }

  const sslMode = parsed.searchParams.get("sslmode");
  if (sslMode && sslMode !== "verify-full") {
    throw new DatabaseConfigurationError(
      "DATABASE_URL sslmode must be verify-full when RDS_SSL_ROOT_CERT is configured."
    );
  }

  const ssl = parsed.searchParams.get("ssl")?.toLowerCase();
  if (ssl === "0" || ssl === "false" || ssl === "no-verify") {
    throw new DatabaseConfigurationError(
      "DATABASE_URL must not disable TLS verification when RDS_SSL_ROOT_CERT is configured."
    );
  }

  // The separately configured CA is authoritative in production. Removing URL TLS
  // file options also prevents pg from trying to read a developer-machine path.
  for (const parameter of [
    "ssl",
    "sslmode",
    "sslrootcert",
    "sslcert",
    "sslkey",
    "uselibpqcompat",
  ]) {
    parsed.searchParams.delete(parameter);
  }

  return parsed.toString();
}

export function buildPostgresPoolConfig(
  env: Readonly<Record<string, string | undefined>> = process.env
): PoolConfig {
  const connectionString = env.DATABASE_URL;
  if (!connectionString) throw new DatabaseConfigurationError();

  const rootCertificatePath = env.RDS_SSL_ROOT_CERT?.trim();
  const baseConfig: PoolConfig = {
    connectionString,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  };

  if (!rootCertificatePath) return baseConfig;

  let ca: string;
  try {
    ca = readFileSync(rootCertificatePath, "utf8");
    createSecureContext({ ca });
  } catch {
    throw new DatabaseConfigurationError(
      "RDS_SSL_ROOT_CERT must point to a readable, valid PEM CA bundle."
    );
  }

  return {
    ...baseConfig,
    connectionString: connectionStringWithoutTlsQuery(connectionString),
    ssl: {
      ca,
      rejectUnauthorized: true,
    },
  };
}
