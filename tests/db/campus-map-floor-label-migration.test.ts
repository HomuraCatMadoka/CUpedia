import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";

import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Client, Pool, type PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { CAMPUS_MAP_FLOOR_LABEL_TRIM_CHARACTERS } from "@/lib/campus-map/floor-label";

const hasDb = Boolean(process.env.DATABASE_URL);
const migrationPath = path.resolve(
  "src/db/migrations/0126_campus-map-floor-label-preflight.sql",
);
const migrationsDirectory = path.resolve("src/db/migrations");

describe.skipIf(!hasDb)("Campus Map Floor label identity migration", () => {
  let pool: Pool;
  let admin: Client;
  let migrationSql: string;
  let preFloorMigrationsDirectory: string;
  let zhparserBootstrap: string;
  const databaseNames = new Set<string>();

  beforeAll(async () => {
    pool = new Pool({ connectionString: process.env.DATABASE_URL });
    admin = new Client({ connectionString: process.env.DATABASE_URL });
    await admin.connect();
    [migrationSql, zhparserBootstrap] = await Promise.all([
      readFile(migrationPath, "utf8"),
      readFile(path.resolve("init-zhparser.sql"), "utf8"),
    ]);
    preFloorMigrationsDirectory = await mkdtemp(
      path.join(tmpdir(), "campus-map-floor-migrations-"),
    );
    await cp(migrationsDirectory, preFloorMigrationsDirectory, {
      recursive: true,
    });
    const journalPath = path.join(
      preFloorMigrationsDirectory,
      "meta/_journal.json",
    );
    const journal = JSON.parse(await readFile(journalPath, "utf8")) as {
      entries: Array<{ idx: number }>;
    };
    journal.entries = journal.entries.filter((entry) => entry.idx <= 125);
    await writeFile(journalPath, `${JSON.stringify(journal, null, 2)}\n`);
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
    if (preFloorMigrationsDirectory) {
      await rm(preFloorMigrationsDirectory, { recursive: true, force: true });
    }
    await pool?.end();
  });

  function isolatedDatabaseUrl(databaseName: string): string {
    const url = new URL(process.env.DATABASE_URL!);
    url.pathname = `/${databaseName}`;
    return url.toString();
  }

  async function createDatabase(prefix: string): Promise<string> {
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

  async function migrateDatabase(
    databaseUrl: string,
    directory: string,
  ): Promise<void> {
    const migrationPool = new Pool({ connectionString: databaseUrl, max: 1 });
    try {
      await migrate(drizzle(migrationPool), { migrationsFolder: directory });
    } finally {
      await migrationPool.end();
    }
  }

  async function withLegacySchema(
    run: (client: PoolClient, schema: string) => Promise<void>,
  ): Promise<void> {
    const client = await pool.connect();
    const schema = `floor_migration_${randomUUID().replaceAll("-", "")}`;
    try {
      await client.query("begin");
      await client.query(`create schema ${schema}`);
      await client.query(`set local search_path to ${schema}`);
      await client.query(`
        create table campus_map_floors (
          id uuid primary key,
          building_id uuid not null,
          display_label text not null,
          sort_order integer not null
        );
        create table campus_map_current_facts (
          id uuid primary key,
          revision_id uuid not null,
          building_id uuid not null,
          floor_id uuid
        );
        create table campus_map_fact_revisions (
          id uuid primary key,
          building_id uuid not null,
          floor_id uuid
        );
        create table campus_map_floor_provenance (
          floor_id uuid not null,
          provenance_id uuid not null,
          primary key (floor_id, provenance_id)
        );
        create function reject_fact_revision_mutation() returns trigger
        language plpgsql as $$
        begin
          raise exception 'campus_map_fact_revisions is append-only'
            using errcode = '55000';
        end
        $$;
        create trigger campus_map_fact_revisions_immutable_row
        before update or delete on campus_map_fact_revisions
        for each row execute function reject_fact_revision_mutation();
        create function validate_current_fact_projection() returns trigger
        language plpgsql as $$
        declare
          revision_floor_id uuid;
        begin
          select floor_id into revision_floor_id
          from campus_map_fact_revisions
          where id = new.revision_id;
          if not found or new.floor_id is distinct from revision_floor_id then
            raise exception 'Current fact does not match Fact revision %', new.revision_id
              using errcode = '23514';
          end if;
          return new;
        end
        $$;
        create trigger campus_map_current_facts_projection_check
        before insert or update on campus_map_current_facts
        for each row execute function validate_current_fact_projection();
      `);
      await run(client, schema);
    } finally {
      await client.query("rollback");
      client.release();
    }
  }

  it("fails closed on normalized duplicates without rewriting stable Floor history", async () => {
    await withLegacySchema(async (client) => {
      const buildingId = randomUUID();
      const canonicalFloorId = randomUUID();
      const duplicateFloorId = randomUUID();
      const currentFactId = randomUUID();
      const revisionId = randomUUID();
      const firstProvenanceId = randomUUID();
      const secondProvenanceId = randomUUID();
      await client.query(
        `insert into campus_map_floors (id, building_id, display_label, sort_order)
         values ($1, $2, ' LG1 ', 0), ($3, $2, 'lg1', 1)`,
        [canonicalFloorId, buildingId, duplicateFloorId],
      );
      await client.query(
        `insert into campus_map_fact_revisions (id, building_id, floor_id)
         values ($1, $2, $3)`,
        [revisionId, buildingId, duplicateFloorId],
      );
      await client.query(
        `insert into campus_map_current_facts
           (id, revision_id, building_id, floor_id)
         values ($1, $2, $3, $4)`,
        [currentFactId, revisionId, buildingId, duplicateFloorId],
      );
      await client.query(
        `insert into campus_map_floor_provenance (floor_id, provenance_id)
         values ($1, $2), ($3, $4)`,
        [
          canonicalFloorId,
          firstProvenanceId,
          duplicateFloorId,
          secondProvenanceId,
        ],
      );

      await client.query("savepoint before_migration");
      await expect(client.query(migrationSql)).rejects.toThrow(
        /normalized Floor labels require manual repair before migration/,
      );
      await client.query("rollback to savepoint before_migration");

      const floors = await client.query<{
        id: string;
        displayLabel: string;
      }>(
        `select id, display_label as "displayLabel"
           from campus_map_floors`,
      );
      expect(floors.rows).toEqual(
        expect.arrayContaining([
          { id: canonicalFloorId, displayLabel: " LG1 " },
          { id: duplicateFloorId, displayLabel: "lg1" },
        ]),
      );
      await expect(
        client.query(
          `select floor_id from campus_map_current_facts
           union all
           select floor_id from campus_map_fact_revisions`,
        ),
      ).resolves.toMatchObject({
        rows: [{ floor_id: duplicateFloorId }, { floor_id: duplicateFloorId }],
      });
      await expect(
        client.query(
          `select provenance_id from campus_map_floor_provenance
           order by provenance_id`,
        ),
      ).resolves.toMatchObject({
        rows: [firstProvenanceId, secondProvenanceId]
          .sort()
          .map((provenance_id) => ({ provenance_id })),
      });
    });
  });

  it("fails closed when boundary Unicode whitespace hides a duplicate label", async () => {
    await withLegacySchema(async (client) => {
      const buildingId = randomUUID();
      const hiddenWhitespaceFloorId = randomUUID();
      const canonicalFloorId = randomUUID();
      await client.query(
        `insert into campus_map_floors (id, building_id, display_label, sort_order)
         values ($1, $3, $4, 0), ($2, $3, 'G', 1)`,
        [hiddenWhitespaceFloorId, canonicalFloorId, buildingId, "G\t"],
      );
      await client.query("savepoint before_migration");

      await expect(client.query(migrationSql)).rejects.toThrow(
        /normalized Floor labels require manual repair before migration/,
      );
      await client.query("rollback to savepoint before_migration");

      await expect(
        client.query(
          `select id, display_label as "displayLabel"
             from campus_map_floors
            order by sort_order`,
        ),
      ).resolves.toMatchObject({
        rows: [
          { id: hiddenWhitespaceFloorId, displayLabel: "G\t" },
          { id: canonicalFloorId, displayLabel: "G" },
        ],
      });
    });
  });

  it("fails closed with a useful message for legacy labels that cannot be repaired", async () => {
    await withLegacySchema(async (client) => {
      await client.query(
        `insert into campus_map_floors (id, building_id, display_label, sort_order)
         values ($1, $2, '   ', 0), ($3, $2, $4, 1)`,
        [randomUUID(), randomUUID(), randomUUID(), "楼".repeat(22)],
      );
      await client.query("savepoint before_migration");

      await expect(client.query(migrationSql)).rejects.toThrow(
        /Campus Map Floor labels require manual repair before migration/,
      );
      await client.query("rollback to savepoint before_migration");

      const floors = await client.query<{ displayLabel: string }>(
        `select display_label as "displayLabel"
           from campus_map_floors
          order by sort_order`,
      );
      expect(floors.rows.map((row) => row.displayLabel)).toEqual([
        "   ",
        "楼".repeat(22),
      ]);
    });
  });

  it("trims compatible labels without changing stable Floor references", async () => {
    await withLegacySchema(async (client) => {
      const buildingId = randomUUID();
      const floorId = randomUUID();
      const revisionId = randomUUID();
      const provenanceId = randomUUID();
      await client.query(
        `insert into campus_map_floors (id, building_id, display_label, sort_order)
         values ($1, $2, ' G ', 0)`,
        [floorId, buildingId],
      );
      await client.query(
        `insert into campus_map_fact_revisions (id, building_id, floor_id)
         values ($1, $2, $3)`,
        [revisionId, buildingId, floorId],
      );
      await client.query(
        `insert into campus_map_current_facts
           (id, revision_id, building_id, floor_id)
         values ($1, $2, $3, $4)`,
        [randomUUID(), revisionId, buildingId, floorId],
      );
      await client.query(
        `insert into campus_map_floor_provenance (floor_id, provenance_id)
         values ($1, $2)`,
        [floorId, provenanceId],
      );

      await client.query(migrationSql);

      await expect(
        client.query(
          `select id, display_label as "displayLabel"
           from campus_map_floors`,
        ),
      ).resolves.toMatchObject({
        rows: [{ id: floorId, displayLabel: "G" }],
      });
      await expect(
        client.query(
          `select floor_id from campus_map_current_facts
           union all
           select floor_id from campus_map_fact_revisions`,
        ),
      ).resolves.toMatchObject({
        rows: [{ floor_id: floorId }, { floor_id: floorId }],
      });
      await expect(
        client.query(
          `select floor_id, provenance_id
           from campus_map_floor_provenance`,
        ),
      ).resolves.toMatchObject({
        rows: [{ floor_id: floorId, provenance_id: provenanceId }],
      });
    });
  });

  it("trims the same boundary whitespace characters as the application", async () => {
    await withLegacySchema(async (client) => {
      const floorIds: string[] = [];
      for (const [sortOrder, whitespace] of [
        ...CAMPUS_MAP_FLOOR_LABEL_TRIM_CHARACTERS,
      ].entries()) {
        const floorId = randomUUID();
        floorIds.push(floorId);
        await client.query(
          `insert into campus_map_floors
             (id, building_id, display_label, sort_order)
           values ($1, $2, $3, $4)`,
          [floorId, randomUUID(), `${whitespace}G${whitespace}`, sortOrder],
        );
      }

      await client.query(migrationSql);

      await expect(
        client.query<{ id: string; displayLabel: string }>(
          `select id, display_label as "displayLabel"
             from campus_map_floors
            where id = any($1::uuid[])
            order by sort_order`,
          [floorIds],
        ),
      ).resolves.toMatchObject({
        rows: floorIds.map((id) => ({ id, displayLabel: "G" })),
      });
    });
  });

  it("fails before touching a duplicate Floor referenced by the complete ledger schema", async () => {
    const databaseUrl = await createDatabase("campus_map_floor_duplicate");
    await migrateDatabase(databaseUrl, preFloorMigrationsDirectory);
    const client = new Client({ connectionString: databaseUrl });
    await client.connect();
    const ids = {
      actor: randomUUID(),
      building: "00000000-0000-4000-8000-000000000802",
      canonicalFloor: "00000000-0000-4000-8000-000000000803",
      duplicateFloor: randomUUID(),
      place: randomUUID(),
      changeset: randomUUID(),
      placeChange: randomUUID(),
      revision: randomUUID(),
    } as const;
    try {
      await client.query(
        `insert into campus_map_buildings (id, name)
         values ($1, '完整迁移链测试楼')`,
        [ids.building],
      );
      await client.query(
        `insert into campus_map_floors
           (id, building_id, display_label, sort_order)
         values ($1, $3, 'G/F', 0), ($2, $3, ' g/f ', 99)`,
        [ids.canonicalFloor, ids.duplicateFloor, ids.building],
      );
      await client.query(`insert into campus_map_places (id) values ($1)`, [
        ids.place,
      ]);
      await client.query(
        `insert into campus_map_changesets
           (id, actor_id_snapshot, actor_nickname_snapshot, comment,
            source_summary, client_name, client_version, affected_count,
            created_count, published_at)
         values ($1, $2, '迁移测试', '建立旧楼层事实', '现场观察', 'test',
           '1', 1, 1, '2026-09-01T01:00:00Z')`,
        [ids.changeset, ids.actor],
      );
      await client.query(
        `insert into campus_map_place_changes
           (id, changeset_id, place_id, operation, field_diff)
         values ($1, $2, $3, 'create', '{}')`,
        [ids.placeChange, ids.changeset, ids.place],
      );
      await client.query(
        `insert into campus_map_fact_revisions
           (id, place_id, changeset_id, place_change_id,
            fact_schema_version, field_metadata, status, actor_id_snapshot,
            actor_nickname_snapshot, name, building_id, floor_id, pin_type,
            capabilities, gender, wheelchair_access, temporary_status,
            regular_hours, official_actions, visit_note, location_kind,
            created_at)
         values ($1, $2, $3, $4, 2, '{"name":{"label":"名称"}}',
           'active', $5, '迁移测试', '旧楼层设施', $6, $7, 'water', '{}',
           null, null, null, null, '[]', null, 'floor',
           '2026-09-01T01:00:00Z')`,
        [
          ids.revision,
          ids.place,
          ids.changeset,
          ids.placeChange,
          ids.actor,
          ids.building,
          ids.duplicateFloor,
        ],
      );
      await client.query(
        `insert into campus_map_current_revisions
           (place_id, revision_id, status)
         values ($1, $2, 'active')`,
        [ids.place, ids.revision],
      );
      await client.query(
        `insert into campus_map_current_facts
           (place_id, revision_id, fact_schema_version, name, building_id,
            floor_id, pin_type, capabilities, gender, wheelchair_access,
            temporary_status, regular_hours, official_actions, visit_note,
            location_kind, published_at)
         values ($1, $2, 2, '旧楼层设施', $3, $4, 'water', '{}', null,
           null, null, null, '[]', null, 'floor',
           '2026-09-01T01:00:00Z')`,
        [ids.place, ids.revision, ids.building, ids.duplicateFloor],
      );

      await expect(
        migrateDatabase(databaseUrl, migrationsDirectory),
      ).rejects.toThrow(
        /normalized Floor labels require manual repair before migration/,
      );

      await expect(
        client.query(
          `select id, display_label as "displayLabel"
           from campus_map_floors
           where id in ($1, $2)
           order by id`,
          [ids.canonicalFloor, ids.duplicateFloor],
        ),
      ).resolves.toMatchObject({
        rows: expect.arrayContaining([
          { id: ids.canonicalFloor, displayLabel: "G/F" },
          { id: ids.duplicateFloor, displayLabel: " g/f " },
        ]),
      });
      await expect(
        client.query(
          `select floor_id from campus_map_current_facts where place_id = $1
           union all
           select floor_id from campus_map_fact_revisions where place_id = $1`,
          [ids.place],
        ),
      ).resolves.toMatchObject({
        rows: [
          { floor_id: ids.duplicateFloor },
          { floor_id: ids.duplicateFloor },
        ],
      });
    } finally {
      await client.end();
    }
  }, 180_000);

  it("enforces the application whitespace identity after a clean migration chain", async () => {
    const databaseUrl = await createDatabase("campus_map_floor_whitespace");
    await migrateDatabase(databaseUrl, migrationsDirectory);
    const client = new Client({ connectionString: databaseUrl });
    await client.connect();
    const buildingId = randomUUID();
    try {
      await client.query(
        `insert into campus_map_buildings (id, name)
         values ($1, '空白规则测试楼')`,
        [buildingId],
      );
      await client.query(
        `insert into campus_map_floors
           (id, building_id, display_label, sort_order)
         values ($1, $2, 'G', 0)`,
        [randomUUID(), buildingId],
      );

      for (const [index, whitespace] of [
        ...CAMPUS_MAP_FLOOR_LABEL_TRIM_CHARACTERS,
      ].entries()) {
        for (const displayLabel of [
          `${whitespace}G${whitespace}`,
          whitespace,
        ]) {
          await expect(
            client.query(
              `insert into campus_map_floors
                 (id, building_id, display_label, sort_order)
               values ($1, $2, $3, $4)`,
              [randomUUID(), buildingId, displayLabel, index + 1],
            ),
          ).rejects.toMatchObject({
            code: "23514",
            constraint: "campus_map_floors_display_label_check",
          });
        }
      }
    } finally {
      await client.end();
    }
  }, 180_000);
});
