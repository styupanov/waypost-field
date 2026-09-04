import "server-only";
import { Pool } from "pg";

const globalForPostgres = globalThis as typeof globalThis & {
  waypostPostgresPool?: Pool;
};

let pool = globalForPostgres.waypostPostgresPool;

export class DatabaseConfigurationError extends Error {
  constructor() {
    super("DATABASE_URL is not configured.");
    this.name = "DatabaseConfigurationError";
  }
}

export function getPostgresPool() {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new DatabaseConfigurationError();
  }

  if (!pool) {
    pool = new Pool({
      connectionString,
      max: 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
    });

    if (process.env.NODE_ENV !== "production") {
      globalForPostgres.waypostPostgresPool = pool;
    }
  }

  return pool;
}
