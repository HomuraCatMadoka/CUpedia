import { randomUUID } from "node:crypto";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Client, Pool } from "pg";
import { isCampusMapRegularHours } from "@/lib/campus-map/regular-hours";

import {
  CAMPUS_MAP_FACT_DISPLAY_METADATA_V1,
  CAMPUS_MAP_FACT_DISPLAY_METADATA_V2,
  CAMPUS_MAP_FACT_SCHEMA_V1,
  CAMPUS_MAP_FACT_SCHEMA_V2,
} from "@/db/schema";

const hasDb = Boolean(process.env.DATABASE_URL);
const requiresDb = process.env.MIGRATION_COMPATIBILITY_TEST === "1";
if (requiresDb && !hasDb) {
  throw new Error(
    "DATABASE_URL is required when MIGRATION_COMPATIBILITY_TEST=1",
  );
}

const migrationsDirectory = path.resolve("src/db/migrations");

describe.skipIf(!hasDb)("Campus Map fact V2 migration (#865)", () => {
  let admin: Client;
  let preV2MigrationsDirectory: string;
  let zhparserBootstrap: string;
  let fullMigrationCount: number;
  let preV2MigrationCount: number;
  const databaseNames = new Set<string>();

  beforeAll(async () => {
    admin = new Client({ connectionString: process.env.DATABASE_URL });
    await admin.connect();
    zhparserBootstrap = await readFile(
      path.resolve("init-zhparser.sql"),
      "utf8",
    );
    preV2MigrationsDirectory = await mkdtemp(
      path.join(tmpdir(), "campus-map-v2-migrations-"),
    );
    await cp(migrationsDirectory, preV2MigrationsDirectory, {
      recursive: true,
    });
    const journalPath = path.join(
      preV2MigrationsDirectory,
      "meta/_journal.json",
    );
    const journal = JSON.parse(await readFile(journalPath, "utf8")) as {
      entries: Array<{ idx: number }>;
    };
    fullMigrationCount = journal.entries.length;
    journal.entries = journal.entries.filter((entry) => entry.idx <= 123);
    preV2MigrationCount = journal.entries.length;
    await writeFile(journalPath, `${JSON.stringify(journal, null, 2)}\n`);
    await rm(
      path.join(preV2MigrationsDirectory, "0124_campus_map_fact_v2.sql"),
      { force: true },
    );
  });

  afterAll(async () => {
    if (admin) {
      for (const databaseName of databaseNames) {
        await admin.query(
          `select pg_terminate_backend(pid) from pg_stat_activity
           where datname = $1 and pid <> pg_backend_pid()`,
          [databaseName],
        );
        await admin.query(`drop database if exists "${databaseName}"`);
      }
      await admin.end();
    }
    if (preV2MigrationsDirectory) {
      await rm(preV2MigrationsDirectory, { recursive: true, force: true });
    }
  });

  function isolatedDatabaseUrl(databaseName: string) {
    const url = new URL(process.env.DATABASE_URL!);
    url.pathname = `/${databaseName}`;
    return url.toString();
  }

  async function createDatabase(prefix: string) {
    const databaseName = `${prefix}_${randomUUID().replaceAll("-", "")}`;
    databaseNames.add(databaseName);
    await admin.query(`create database "${databaseName}"`);
    const databaseUrl = isolatedDatabaseUrl(databaseName);
    const client = new Client({ connectionString: databaseUrl });
    await client.connect();
    await client.query(zhparserBootstrap);
    await client.end();
    return databaseUrl;
  }

  async function migrateDatabase(databaseUrl: string, directory: string) {
    const pool = new Pool({ connectionString: databaseUrl, max: 1 });
    try {
      await migrate(drizzle(pool), { migrationsFolder: directory });
    } finally {
      await pool.end();
    }
  }

  it("replays the complete migration journal on a fresh database", async () => {
    const databaseUrl = await createDatabase("campus_map_v2_fresh");
    await migrateDatabase(databaseUrl, migrationsDirectory);
    const client = new Client({ connectionString: databaseUrl });
    await client.connect();
    try {
      const schema = await client.query<{
        version: number;
        status: string;
        definition: unknown;
        display_metadata: unknown;
      }>(
        `select version, status, definition, display_metadata
             from campus_map_fact_schemas
           where status = 'active'`,
      );
      expect(schema.rows).toEqual([
        {
          version: 2,
          status: "active",
          definition: CAMPUS_MAP_FACT_SCHEMA_V2,
          display_metadata: CAMPUS_MAP_FACT_DISPLAY_METADATA_V2,
        },
      ]);
      const journal = await client.query<{ count: string }>(
        `select count(*) from drizzle.__drizzle_migrations`,
      );
      expect(Number(journal.rows[0]?.count)).toBe(fullMigrationCount);
      const interval = { days: ["mon"], opensAt: "09:00", closesAt: "17:00" };
      const validHours = { timezone: "Asia/Hong_Kong", intervals: [interval] };
      const invalidHours = [
        {},
        { timezone: "Asia/Hong_Kong" },
        { intervals: [interval] },
        { ...validHours, timezone: null },
        { ...validHours, intervals: null },
        { ...validHours, intervals: [] },
        { ...validHours, extra: true },
        ...[null, [], {}, 900].map((value) => ({
          ...validHours,
          intervals: [value],
        })),
        ...[null, [], ["mon", "mon"], ["invalid"], [null], [["mon"]]].map(
          (days) => ({
            ...validHours,
            intervals: [{ ...interval, days }],
          }),
        ),
        ...["days", "opensAt", "closesAt"].map((field) => ({
          ...validHours,
          intervals: [
            Object.fromEntries(
              Object.entries(interval).filter(([key]) => key !== field),
            ),
          ],
        })),
        ...["opensAt", "closesAt"].flatMap((field) =>
          [null, 900, true, [], {}].map((value) => ({
            ...validHours,
            intervals: [{ ...interval, [field]: value }],
          })),
        ),
      ];
      for (const [value, expected] of [
        [validHours, true],
        [
          {
            ...validHours,
            intervals: [{ ...interval, opensAt: "22:00", closesAt: "06:00" }],
          },
          true,
        ],
        ...invalidHours.map((value) => [value, false]),
      ]) {
        const result = await client.query<{ valid: boolean }>(
          "select public.campus_map_regular_hours_are_valid($1::jsonb) as valid",
          [JSON.stringify(value)],
        );
        expect(result.rows[0]?.valid, JSON.stringify(value)).toBe(expected);
        expect(isCampusMapRegularHours(value), JSON.stringify(value)).toBe(
          expected,
        );
      }
      const representativeProviderEvidence = await client.query<{
        count: string;
      }>(
        `select count(*)::text as count
           from campus_map_provenance_sources
          where source_kind = 'provider-candidate'
            and source_ref like 'amap:poi:%:place-page:2026-09-04'`,
      );
      expect(Number(representativeProviderEvidence.rows[0]?.count)).toBe(0);
    } finally {
      await client.end();
    }
  }, 180_000);

  it("refuses to activate V2 when the audited empty-V1-Current precondition is false", async () => {
    const databaseUrl = await createDatabase("campus_map_v2_mixed_current");
    await migrateDatabase(databaseUrl, preV2MigrationsDirectory);
    const ids = {
      actor: "10000000-0000-4000-8000-000000000011",
      place: "20000000-0000-4000-8000-000000000011",
      changeset: "30000000-0000-4000-8000-000000000011",
      change: "40000000-0000-4000-8000-000000000011",
      revision: "50000000-0000-4000-8000-000000000011",
    } as const;
    let client = new Client({ connectionString: databaseUrl });
    await client.connect();
    try {
      await client.query(
        `insert into campus_map_fact_schemas
           (version, status, definition, display_metadata)
         values (1, 'active', $1::jsonb, $2::jsonb)`,
        [
          JSON.stringify(CAMPUS_MAP_FACT_SCHEMA_V1),
          JSON.stringify(CAMPUS_MAP_FACT_DISPLAY_METADATA_V1),
        ],
      );
      await client.query(`insert into campus_map_places (id) values ($1)`, [
        ids.place,
      ]);
      await client.query(
        `insert into campus_map_changesets
           (id, actor_id_snapshot, actor_nickname_snapshot, comment,
            source_summary, client_name, client_version, affected_count,
            created_count, published_at)
         values ($1, $2, '迁移测试', '建立 V1 Current', '官方资料', 'test',
           '1', 1, 1, '2026-08-20T01:00:00Z')`,
        [ids.changeset, ids.actor],
      );
      await client.query(
        `insert into campus_map_place_changes
           (id, changeset_id, place_id, operation, field_diff)
         values ($1, $2, $3, 'create', '{}')`,
        [ids.change, ids.changeset, ids.place],
      );
      await client.query(
        `insert into campus_map_fact_revisions
           (id, place_id, changeset_id, place_change_id,
            fact_schema_version, field_metadata, status, actor_id_snapshot,
            actor_nickname_snapshot, name, pin_type, location_kind,
            point_precision, longitude, latitude, coordinate_crs, created_at)
         values ($1, $2, $3, $4, 1, '{"name":{"label":"名称"}}',
           'active', $5, '迁移测试', '仍在 Current 的旧饮水点', 'water',
           'outdoor-point', 'precise', 114.2, 22.4, 'wgs84',
           '2026-08-20T01:00:00Z')`,
        [ids.revision, ids.place, ids.changeset, ids.change, ids.actor],
      );
      await client.query(
        `insert into campus_map_revision_visibility (revision_id) values ($1)`,
        [ids.revision],
      );
      await client.query(
        `insert into campus_map_current_revisions
           (place_id, revision_id, status) values ($1, $2, 'active')`,
        [ids.place, ids.revision],
      );
      await client.query(
        `insert into campus_map_current_facts
           (place_id, revision_id, fact_schema_version, name, pin_type,
            location_kind, point_precision, longitude, latitude,
            coordinate_crs, published_at)
         values ($1, $2, 1, '仍在 Current 的旧饮水点', 'water',
           'outdoor-point', 'precise', 114.2, 22.4, 'wgs84',
           '2026-08-20T01:00:00Z')`,
        [ids.place, ids.revision],
      );
    } finally {
      await client.end();
    }

    await expect(
      migrateDatabase(databaseUrl, migrationsDirectory),
    ).rejects.toThrow(
      /Campus Map V2 activation requires an empty V1 Current projection/,
    );

    client = new Client({ connectionString: databaseUrl });
    await client.connect();
    try {
      const state = await client.query<{
        active_version: number;
        current_version: number;
        migration_count: string;
      }>(
        `select
           (select version from campus_map_fact_schemas where status = 'active') as active_version,
           (select fact_schema_version from campus_map_current_facts where place_id = $1) as current_version,
           (select count(*)::text from drizzle.__drizzle_migrations) as migration_count`,
        [ids.place],
      );
      expect(state.rows).toEqual([
        {
          active_version: 1,
          current_version: 1,
          migration_count: String(preV2MigrationCount),
        },
      ]);
    } finally {
      await client.end();
    }
  }, 180_000);

  it("upgrades a V1 ledger without rewriting its historical payload", async () => {
    const databaseUrl = await createDatabase("campus_map_v2_upgrade");
    await migrateDatabase(databaseUrl, preV2MigrationsDirectory);
    let client = new Client({ connectionString: databaseUrl });
    await client.connect();
    try {
      const ids = {
        actor: "10000000-0000-4000-8000-000000000001",
        v1Place: "20000000-0000-4000-8000-000000000001",
        v1Changeset: "30000000-0000-4000-8000-000000000001",
        v1Change: "40000000-0000-4000-8000-000000000001",
        v1Revision: "50000000-0000-4000-8000-000000000001",
        v2Place: "20000000-0000-4000-8000-000000000002",
        v2Changeset: "30000000-0000-4000-8000-000000000002",
        v2Change: "40000000-0000-4000-8000-000000000002",
        v2Revision: "50000000-0000-4000-8000-000000000002",
      } as const;
      await client.query(
        `insert into campus_map_fact_schemas
             (version, status, definition, display_metadata)
           values (1, 'active', $1::jsonb, $2::jsonb)`,
        [
          JSON.stringify(CAMPUS_MAP_FACT_SCHEMA_V1),
          JSON.stringify(CAMPUS_MAP_FACT_DISPLAY_METADATA_V1),
        ],
      );
      await client.query(`insert into campus_map_places (id) values ($1)`, [
        ids.v1Place,
      ]);
      await client.query(
        `insert into campus_map_changesets
             (id, actor_id_snapshot, actor_nickname_snapshot, comment,
              source_summary, client_name, client_version, affected_count,
              retired_count, published_at)
           values ($1, $2, '迁移测试', '保留 V1 历史', '官方资料', 'test',
             '1', 1, 1, '2026-08-20T01:00:00Z')`,
        [ids.v1Changeset, ids.actor],
      );
      await client.query(
        `insert into campus_map_place_changes
             (id, changeset_id, place_id, operation, field_diff)
           values ($1, $2, $3, 'retire', '{}')`,
        [ids.v1Change, ids.v1Changeset, ids.v1Place],
      );
      await client.query(
        `insert into campus_map_fact_revisions
             (id, place_id, changeset_id, place_change_id,
              fact_schema_version, field_metadata, status, actor_id_snapshot,
              actor_nickname_snapshot, name, pin_type, audience,
              credential_requirement, access_schedule,
              reservation_requirement, temporary_status, location_kind,
              point_precision, longitude, latitude, coordinate_crs, created_at)
           values ($1, $2, $3, $4, 1, '{"name":{"label":"名称"}}',
             'retired', $5, '迁移测试', '旧饮水点', 'water', 'cuhk-member',
             'campus-card', '{"kind":"unknown"}', 'none', 'unknown',
             'outdoor-point', 'precise', 114.2, 22.4, 'wgs84',
             '2026-08-20T01:00:00Z')`,
        [ids.v1Revision, ids.v1Place, ids.v1Changeset, ids.v1Change, ids.actor],
      );
      await client.query(
        `insert into campus_map_revision_visibility (revision_id)
           values ($1)`,
        [ids.v1Revision],
      );

      await client.end();
      await migrateDatabase(databaseUrl, migrationsDirectory);
      client = new Client({ connectionString: databaseUrl });
      await client.connect();

      const schemas = await client.query<{
        version: number;
        status: string;
        definition: unknown;
        display_metadata: unknown;
      }>(
        `select version, status, definition, display_metadata
           from campus_map_fact_schemas order by version`,
      );
      expect(schemas.rows[0]).toEqual({
        version: 1,
        status: "superseded",
        definition: CAMPUS_MAP_FACT_SCHEMA_V1,
        display_metadata: CAMPUS_MAP_FACT_DISPLAY_METADATA_V1,
      });
      expect(schemas.rows[1]).toMatchObject({
        version: 2,
        status: "active",
        definition: CAMPUS_MAP_FACT_SCHEMA_V2,
        display_metadata: CAMPUS_MAP_FACT_DISPLAY_METADATA_V2,
      });

      const historical = await client.query(
        `select fact_schema_version, name, pin_type, audience,
                  credential_requirement, reservation_requirement,
                  regular_hours, official_actions, visit_note
           from campus_map_fact_revisions where id = $1`,
        [ids.v1Revision],
      );
      expect(historical.rows).toEqual([
        {
          fact_schema_version: 1,
          name: "旧饮水点",
          pin_type: "water",
          audience: "cuhk-member",
          credential_requirement: "campus-card",
          reservation_requirement: "none",
          regular_hours: null,
          official_actions: [],
          visit_note: null,
        },
      ]);

      await client.query(`insert into campus_map_places (id) values ($1)`, [
        ids.v2Place,
      ]);
      await client.query(
        `insert into campus_map_changesets
             (id, actor_id_snapshot, actor_nickname_snapshot, comment,
              source_summary, client_name, client_version, affected_count,
              created_count, published_at)
           values ($1, $2, '迁移测试', '建立 V2 地点', '官方资料', 'test',
             '2', 1, 1, '2026-08-21T01:00:00Z')`,
        [ids.v2Changeset, ids.actor],
      );
      await client.query(
        `insert into campus_map_place_changes
             (id, changeset_id, place_id, operation, field_diff)
           values ($1, $2, $3, 'create', '{}')`,
        [ids.v2Change, ids.v2Changeset, ids.v2Place],
      );
      await client.query(
        `insert into campus_map_fact_revisions
             (id, place_id, changeset_id, place_change_id,
              fact_schema_version, field_metadata, status, actor_id_snapshot,
              actor_nickname_snapshot, name, pin_type, capabilities, gender,
              wheelchair_access, temporary_status, regular_hours,
              official_actions, visit_note, location_kind, point_precision,
              longitude, latitude, coordinate_crs, created_at)
           values ($1, $2, $3, $4, 2, '{"name":{"label":"名称"}}',
             'active', $5, '迁移测试', '大学游泳池', 'sports-facility', '{}',
             null, null, null,
             '{"timezone":"Asia/Hong_Kong","intervals":[{"days":["mon"],"opensAt":"10:30","closesAt":"13:30"}]}',
             '[{"label":"官网","url":"https://www.osa.cuhk.edu.hk/"}]',
             '入口位于水上活动中心', 'outdoor-point', 'approximate',
             114.2, 22.4, 'wgs84', '2026-08-21T01:00:00Z')`,
        [ids.v2Revision, ids.v2Place, ids.v2Changeset, ids.v2Change, ids.actor],
      );
      await client.query(
        `insert into campus_map_current_revisions
             (place_id, revision_id, status)
           values ($1, $2, 'active')`,
        [ids.v2Place, ids.v2Revision],
      );
      await client.query(
        `insert into campus_map_current_facts
           (place_id, revision_id, fact_schema_version, name, pin_type,
              capabilities, gender, wheelchair_access, temporary_status,
              regular_hours, official_actions, visit_note, location_kind,
              point_precision, longitude, latitude, coordinate_crs,
              published_at)
           values ($1, $2, 2, '大学游泳池', 'sports-facility', '{}',
             null, null, null,
             '{"timezone":"Asia/Hong_Kong","intervals":[{"days":["mon"],"opensAt":"10:30","closesAt":"13:30"}]}',
             '[{"label":"官网","url":"https://www.osa.cuhk.edu.hk/"}]',
             '入口位于水上活动中心', 'outdoor-point', 'approximate',
             114.2, 22.4, 'wgs84', '2026-08-21T01:00:00Z')`,
        [ids.v2Place, ids.v2Revision],
      );
      const current = await client.query(
        `select fact_schema_version, pin_type, visit_note
           from campus_map_current_facts where place_id = $1`,
        [ids.v2Place],
      );
      expect(current.rows).toEqual([
        {
          fact_schema_version: 2,
          pin_type: "sports-facility",
          visit_note: "入口位于水上活动中心",
        },
      ]);
    } finally {
      await client.end().catch(() => undefined);
    }
  }, 180_000);
});
