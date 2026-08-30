import { resolve } from "node:path";
import { config } from "dotenv";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { assertCampusMapMigrationHistoryCompatible } from "./campus-map-migration-preflight";
import { postgresErrorCode, runMigrationWithRetry } from "./migration-retry";

config({ path: ".env.local" });
config({ path: ".env" });

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL_NOT_CONFIGURED");
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 1,
    connectionTimeoutMillis: 15_000,
    allowExitOnIdle: true,
  });
  try {
    await assertCampusMapMigrationHistoryCompatible(pool);
    await runMigrationWithRetry(
      () =>
        migrate(drizzle(pool), {
          migrationsFolder: resolve("src/db/migrations"),
        }),
      {
        onRetry(attempt, delayMs, code) {
          console.warn(
            `Migration lock unavailable (SQLSTATE ${code}) after attempt ${attempt}; retrying in ${delayMs}ms.`,
          );
        },
      },
    );
    console.info("Database migrations applied.");
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  const code = postgresErrorCode(error) ?? "UNKNOWN";
  console.error(`Database migration failed (SQLSTATE ${code}).`);
  console.error(error);
  process.exitCode = 1;
});
