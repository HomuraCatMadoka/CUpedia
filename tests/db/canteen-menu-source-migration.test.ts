import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "pg";

const hasDb = Boolean(process.env.DATABASE_URL);
const requiresDb = process.env.MIGRATION_COMPATIBILITY_TEST === "1";
if (requiresDb && !hasDb) {
  throw new Error(
    "DATABASE_URL is required when MIGRATION_COMPATIBILITY_TEST=1",
  );
}
const migrationPath = path.resolve(
  "src/db/migrations/0076_provision-and-backfill-canteen-menu-sources.sql",
);
const repairMigrationPath = path.resolve(
  "src/db/migrations/0080_repair-legacy-canteen-menu-source-alias.sql",
);

describe.skipIf(!hasDb)("canteen menu source identity migration", () => {
  let client: Client;
  let migrationSql: string;
  let repairMigrationSql: string;
  const schemas = new Set<string>();

  beforeAll(async () => {
    client = new Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();
    migrationSql = await readFile(migrationPath, "utf8");
    repairMigrationSql = await readFile(repairMigrationPath, "utf8");
  });

  afterAll(async () => {
    for (const schema of schemas) {
      await client.query(`drop schema if exists ${schema} cascade`);
    }
    await client.end();
  });

  it("normalizes order-place rows in place without losing votes or comments", async () => {
    const fixture = await createLegacyFixture("order-place:102830");

    await runMigration(fixture.schema);

    const item = await client.query<{
      id: string;
      external_source: string;
      external_product_id: string;
      provider: string;
      external_store_id: string;
    }>(
      `
      select item.id, item.external_source, item.external_product_id,
        source.provider, source.external_store_id
      from ${fixture.schema}.canteen_menu_items item
      join ${fixture.schema}.canteen_menu_sources source
        on source.id = item.menu_source_id
      where item.id = $1
    `,
      [fixture.itemId],
    );
    expect(item.rows).toEqual([
      {
        id: fixture.itemId,
        external_source: "aigens:102830",
        external_product_id: "product-42",
        provider: "aigens",
        external_store_id: "102830",
      },
    ]);

    const history = await client.query<{ votes: string; comments: string }>(
      `
      select
        (select count(*) from ${fixture.schema}.canteen_dish_votes where menu_item_id = $1) as votes,
        (select count(*) from ${fixture.schema}.canteen_dish_comments where menu_item_id = $1) as comments
    `,
      [fixture.itemId],
    );
    expect(history.rows[0]).toEqual({ votes: "1", comments: "1" });
  });

  it("reports an unsupported namespace and rolls back every migration write", async () => {
    const fixture = await createLegacyFixture("mystery-pos:102830");
    const aliasCanteenId = randomUUID();
    const aliasItemId = randomUUID();
    await client.query(
      `insert into ${fixture.schema}.canteens (id, name) values ($1, '演示食堂 C')`,
      [aliasCanteenId],
    );
    await client.query(
      `insert into ${fixture.schema}.canteen_menu_items
        (id, canteen_id, external_source, external_key)
       values ($1, $2, 'order-place:102830', 'product-99:dinner')`,
      [aliasItemId, aliasCanteenId],
    );

    await expect(runMigration(fixture.schema)).rejects.toThrow(
      /unsupported legacy external source namespace[\s\S]*mystery-pos:102830[\s\S]*1 item/,
    );

    const state = await client.query<{
      external_source: string;
      menu_source_id: string | null;
      source_count: string;
    }>(
      `
      select item.external_source, item.menu_source_id,
        (select count(*) from ${fixture.schema}.canteen_menu_sources) as source_count
      from ${fixture.schema}.canteen_menu_items item
      where item.id = $1
    `,
      [fixture.itemId],
    );
    expect(state.rows[0]).toEqual({
      external_source: "mystery-pos:102830",
      menu_source_id: null,
      source_count: "0",
    });
    const rolledBackAlias = await client.query<{ external_source: string }>(
      `select external_source from ${fixture.schema}.canteen_menu_items where id = $1`,
      [aliasItemId],
    );
    expect(rolledBackAlias.rows[0].external_source).toBe("order-place:102830");
    const migrationObjects = await client.query<{ object_count: string }>(`
      select (
        (select count(*) from pg_proc
          where pronamespace = '${fixture.schema}'::regnamespace
            and proname = 'canteen_menu_items_fill_normalized_identity')
        +
        (select count(*) from pg_trigger
          where tgrelid = '${fixture.schema}.canteen_menu_items'::regclass
            and tgname = 'canteen_menu_items_fill_normalized_identity_trg')
        +
        (select count(*) from pg_constraint
          where conrelid = '${fixture.schema}.canteen_menu_items'::regclass
            and conname = 'canteen_menu_items_rollout_identity_chk')
      )::text as object_count
    `);
    expect(migrationObjects.rows[0].object_count).toBe("0");
  });

  it("fails closed when legacy and canonical rows have the same external key", async () => {
    const fixture = await createLegacyFixture("order-place:102830");
    const canonicalItemId = randomUUID();
    await client.query(
      `insert into ${fixture.schema}.canteen_menu_items
        (id, canteen_id, external_source, external_key)
       values ($1, $2, 'aigens:102830', 'product-42:lunch')`,
      [canonicalItemId, fixture.canteenId],
    );

    await expect(runMigration(fixture.schema)).rejects.toThrow(
      /legacy order-place source collides with an existing canonical menu item/,
    );

    const sources = await client.query<{ external_source: string }>(
      `select external_source from ${fixture.schema}.canteen_menu_items
       where id in ($1, $2) order by external_source`,
      [fixture.itemId, canonicalItemId],
    );
    expect(sources.rows.map((row) => row.external_source)).toEqual([
      "aigens:102830",
      "order-place:102830",
    ]);
  });

  it("normalizes order-place writes from an old app instance during rollout", async () => {
    const fixture = await createLegacyFixture("aigens:102830");
    await runMigration(fixture.schema);
    const newItemId = randomUUID();

    await client.query("begin");
    try {
      await client.query(`set local search_path to ${fixture.schema}, public`);
      await client.query(
        `insert into ${fixture.schema}.canteen_menu_items
          (id, canteen_id, external_source, external_key)
         values ($1, $2, 'order-place:102830', 'product-99:dinner')`,
        [newItemId, fixture.canteenId],
      );
      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw error;
    }

    const inserted = await client.query<{
      external_source: string;
      external_product_id: string;
      provider: string;
    }>(
      `
      select item.external_source, item.external_product_id, source.provider
      from ${fixture.schema}.canteen_menu_items item
      join ${fixture.schema}.canteen_menu_sources source
        on source.id = item.menu_source_id
      where item.id = $1
    `,
      [newItemId],
    );
    expect(inserted.rows[0]).toEqual({
      external_source: "aigens:102830",
      external_product_id: "product-99",
      provider: "aigens",
    });
  });

  it("repairs an environment that already recorded the original migration", async () => {
    const fixture = await createLegacyFixture("aigens:102830");
    await runMigration(fixture.schema);
    await client.query(
      `alter table ${fixture.schema}.canteen_menu_items
       disable trigger canteen_menu_items_fill_normalized_identity_trg`,
    );
    await client.query(
      `update ${fixture.schema}.canteen_menu_items
       set external_source = 'order-place:102830'
       where id = $1`,
      [fixture.itemId],
    );
    await client.query(
      `alter table ${fixture.schema}.canteen_menu_items
       enable trigger canteen_menu_items_fill_normalized_identity_trg`,
    );

    await runSqlMigration(fixture.schema, repairMigrationSql);

    const repaired = await client.query<{ external_source: string }>(
      `select external_source from ${fixture.schema}.canteen_menu_items where id = $1`,
      [fixture.itemId],
    );
    expect(repaired.rows[0].external_source).toBe("aigens:102830");

    const rollingItemId = randomUUID();
    await client.query("begin");
    try {
      await client.query(`set local search_path to ${fixture.schema}, public`);
      await client.query(
        `insert into ${fixture.schema}.canteen_menu_items
          (id, canteen_id, external_source, external_key)
         values ($1, $2, 'order-place:102830', 'product-100:breakfast')`,
        [rollingItemId, fixture.canteenId],
      );
      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw error;
    }
    const rollingWrite = await client.query<{ external_source: string }>(
      `select external_source from ${fixture.schema}.canteen_menu_items where id = $1`,
      [rollingItemId],
    );
    expect(rollingWrite.rows[0].external_source).toBe("aigens:102830");
  });

  async function createLegacyFixture(externalSource: string) {
    const schema = `migration_${randomUUID().replaceAll("-", "")}`;
    const canteenId = randomUUID();
    const itemId = randomUUID();
    const userId = randomUUID();
    schemas.add(schema);

    await client.query(`create schema ${schema}`);
    await client.query(`
      create table ${schema}.canteens (
        id uuid primary key,
        name text not null,
        location text,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      );
      create table ${schema}.canteen_menu_sources (
        id uuid primary key default gen_random_uuid(),
        canteen_id uuid not null references ${schema}.canteens(id),
        provider text not null,
        external_owner_id text,
        external_store_id text not null,
        config jsonb not null default '{}'::jsonb,
        enabled boolean not null default true,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now(),
        unique (canteen_id),
        unique (id, canteen_id),
        unique (provider, external_owner_id, external_store_id)
      );
      create table ${schema}.canteen_menu_items (
        id uuid primary key,
        canteen_id uuid not null references ${schema}.canteens(id),
        external_source text,
        external_key text,
        menu_source_id uuid,
        external_product_id text,
        updated_at timestamptz not null default now()
      );
      create table ${schema}.canteen_dish_votes (
        id uuid primary key default gen_random_uuid(),
        menu_item_id uuid not null references ${schema}.canteen_menu_items(id),
        user_id uuid not null
      );
      create table ${schema}.canteen_dish_comments (
        id uuid primary key default gen_random_uuid(),
        menu_item_id uuid not null references ${schema}.canteen_menu_items(id),
        user_id uuid not null,
        content text not null
      );
      create table ${schema}.canteen_ordering_handoffs (
        canteen_id uuid primary key references ${schema}.canteens(id),
        provider text not null,
        url text not null,
        enabled boolean not null default true,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      );
      create unique index canteen_menu_items_legacy_source_key_uidx
        on ${schema}.canteen_menu_items
        (canteen_id, external_source, external_key)
        where external_source is not null and external_key is not null;
      create unique index canteen_menu_items_source_product_uidx
        on ${schema}.canteen_menu_items (menu_source_id, external_product_id)
        where menu_source_id is not null and external_product_id is not null;
      alter table ${schema}.canteen_menu_items
        add constraint canteen_menu_items_source_product_identity_chk
        check ((menu_source_id is null) = (external_product_id is null));
      alter table ${schema}.canteen_menu_items
        add constraint canteen_menu_items_source_canteen_fk
        foreign key (menu_source_id, canteen_id)
        references ${schema}.canteen_menu_sources(id, canteen_id);
    `);
    await client.query(
      `insert into ${schema}.canteens (id, name) values
        ($1, '演示食堂 A'),
        ('8cced094-25b7-439d-8989-ad484ae4b652', '演示食堂 B')`,
      [canteenId],
    );
    await client.query(
      `insert into ${schema}.canteen_menu_items
        (id, canteen_id, external_source, external_key)
       values ($1, $2, $3, 'product-42:lunch')`,
      [itemId, canteenId, externalSource],
    );
    await client.query(
      `insert into ${schema}.canteen_dish_votes (menu_item_id, user_id)
       values ($1, $2)`,
      [itemId, userId],
    );
    await client.query(
      `insert into ${schema}.canteen_dish_comments (menu_item_id, user_id, content)
       values ($1, $2, 'preserve this history')`,
      [itemId, userId],
    );
    return { schema, canteenId, itemId };
  }

  async function runMigration(schema: string) {
    await runSqlMigration(schema, migrationSql);
  }

  async function runSqlMigration(schema: string, sql: string) {
    await client.query("begin");
    try {
      await client.query(`set local search_path to ${schema}, public`);
      await client.query(sql);
      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw error;
    }
  }
});
