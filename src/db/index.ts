import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

const globalForDb = globalThis as unknown as {
  pgPool?: Pool;
};

function createPool() {
  const connectionString = process.env.DATABASE_URL;
  const isRemote =
    typeof connectionString === "string" &&
    !/localhost|127\.0\.0\.1/.test(connectionString);

  // Supabase Session Pooler + tiny role quotas: keep the pool small and reuse it
  // across HMR so we do not open a fresh default pool (max 10) every reload.
  return new Pool({
    connectionString,
    max: isRemote ? 2 : 10,
    idleTimeoutMillis: isRemote ? 8_000 : 30_000,
    connectionTimeoutMillis: 15_000,
    allowExitOnIdle: true,
  });
}

const pool = globalForDb.pgPool ?? createPool();

if (process.env.NODE_ENV !== "production") {
  globalForDb.pgPool = pool;
}

export const db = drizzle(pool, { schema });
