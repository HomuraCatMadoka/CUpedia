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

export type DatabaseAdvisoryLockAttempt<T> =
  | { acquired: false }
  | { acquired: true; value: T };

/**
 * Holds a short-lived, process-safe PostgreSQL lock while `work` uses the
 * normal Drizzle pool. A competing caller returns immediately, leaving the
 * remaining pool connection available to the lock owner.
 */
export async function tryWithDatabaseAdvisoryLock<T>(
  lockName: string,
  work: () => Promise<T>,
): Promise<DatabaseAdvisoryLockAttempt<T>> {
  const client = await pool.connect();
  let acquired = false;
  let destroyClient = false;
  try {
    const lock = await client.query<{ acquired: boolean }>(
      "select pg_try_advisory_lock(hashtextextended($1, 0)) as acquired",
      [lockName],
    );
    acquired = lock.rows[0]?.acquired === true;
    if (!acquired) return { acquired: false };
    return { acquired: true, value: await work() };
  } finally {
    if (acquired) {
      try {
        await client.query(
          "select pg_advisory_unlock(hashtextextended($1, 0))",
          [lockName],
        );
      } catch {
        destroyClient = true;
      }
    }
    client.release(destroyClient);
  }
}
