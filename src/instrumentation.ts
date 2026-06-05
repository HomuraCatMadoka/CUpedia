export async function register() {
  if (
    process.env.SKIP_EMAIL_WHITELIST === "true" &&
    process.env.NODE_ENV === "production"
  ) {
    throw new Error(
      "SKIP_EMAIL_WHITELIST must not be enabled in production. " +
        "Remove it from your environment variables.",
    );
  }

  // Opt-in for self-hosted deploys only. On Vercel migrations run at build
  // time (vercel-build) and src/db/migrations is not bundled into the
  // function — migrating here crashes every instance, forcing a cold start
  // per request (#133).
  if (process.env.RUN_MIGRATIONS_ON_BOOT === "true") {
    const { migrate } = await import("drizzle-orm/node-postgres/migrator");
    const { db } = await import("@/db");
    await migrate(db, { migrationsFolder: "./src/db/migrations" });
  }
}
