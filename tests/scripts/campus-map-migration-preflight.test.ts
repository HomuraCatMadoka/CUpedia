import { describe, expect, it, vi } from "vitest";

import {
  CAMPUS_MAP_RELEASE_MIGRATION_TIMESTAMP,
  assertCampusMapMigrationHistoryCompatible,
} from "../../scripts/campus-map-migration-preflight";

function queryable(...rows: unknown[][]) {
  return {
    query: vi
      .fn()
      .mockImplementation(() => Promise.resolve({ rows: rows.shift() ?? [] })),
  };
}

describe("Campus Map release migration preflight", () => {
  it("allows a main-only database with no Campus Map tables", async () => {
    const client = queryable([
      {
        campusMapTable: null,
        migrationJournal: "drizzle.__drizzle_migrations",
      },
    ]);

    await expect(
      assertCampusMapMigrationHistoryCompatible(client),
    ).resolves.toBeUndefined();
    expect(client.query).toHaveBeenCalledOnce();
  });

  it("rejects a database that retained the old feature migration chain", async () => {
    const client = queryable(
      [
        {
          campusMapTable: "campus_map_buildings",
          migrationJournal: "drizzle.__drizzle_migrations",
        },
      ],
      [{ lastMigrationAt: String(CAMPUS_MAP_RELEASE_MIGRATION_TIMESTAMP - 1) }],
    );

    await expect(
      assertCampusMapMigrationHistoryCompatible(client),
    ).rejects.toThrow("CAMPUS_MAP_LEGACY_MIGRATION_HISTORY");
  });

  it("allows an idempotent redeploy after the release migration chain", async () => {
    const client = queryable(
      [
        {
          campusMapTable: "campus_map_buildings",
          migrationJournal: "drizzle.__drizzle_migrations",
        },
      ],
      [{ lastMigrationAt: String(CAMPUS_MAP_RELEASE_MIGRATION_TIMESTAMP) }],
    );

    await expect(
      assertCampusMapMigrationHistoryCompatible(client),
    ).resolves.toBeUndefined();
  });
});
