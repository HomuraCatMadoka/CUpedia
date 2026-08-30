import type { Pool } from "pg";

export const CAMPUS_MAP_RELEASE_MIGRATION_TIMESTAMP = 1788101000000;

const LEGACY_MIGRATION_ERROR = "CAMPUS_MAP_LEGACY_MIGRATION_HISTORY";

export async function assertCampusMapMigrationHistoryCompatible(
  client: Pick<Pool, "query">,
) {
  const relationResult = await client.query<{
    campusMapTable: string | null;
    migrationJournal: string | null;
  }>(`
    SELECT
      to_regclass('public.campus_map_buildings')::text AS "campusMapTable",
      to_regclass('drizzle.__drizzle_migrations')::text AS "migrationJournal"
  `);
  const relations = relationResult.rows[0];
  if (!relations?.campusMapTable) return;
  if (!relations.migrationJournal) throw new Error(LEGACY_MIGRATION_ERROR);

  const journalResult = await client.query<{ lastMigrationAt: string | null }>(`
    SELECT max(created_at)::text AS "lastMigrationAt"
    FROM drizzle.__drizzle_migrations
  `);
  const lastMigrationAt = Number(journalResult.rows[0]?.lastMigrationAt);
  if (
    !Number.isFinite(lastMigrationAt) ||
    lastMigrationAt < CAMPUS_MAP_RELEASE_MIGRATION_TIMESTAMP
  ) {
    throw new Error(LEGACY_MIGRATION_ERROR);
  }
}
