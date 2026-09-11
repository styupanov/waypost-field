import "server-only";
import { Pool } from "pg";
import { buildPostgresPoolConfig } from "./postgres-config.ts";

export { DatabaseConfigurationError } from "./postgres-config.ts";

const globalForPostgres = globalThis as typeof globalThis & {
  waypostPostgresPool?: Pool;
};

let pool = globalForPostgres.waypostPostgresPool;

export function getPostgresPool() {
  if (!pool) {
    pool = new Pool(buildPostgresPoolConfig());

    if (process.env.NODE_ENV !== "production") {
      globalForPostgres.waypostPostgresPool = pool;
    }
  }

  return pool;
}
