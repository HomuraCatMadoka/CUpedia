import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "pg";

const hasDb = Boolean(process.env.DATABASE_URL);
const migrationPath = path.resolve(
  "src/db/migrations/0076_provision-and-backfill-canteen-menu-sources.sql",
);

describe.skipIf(!hasDb)("canteen menu source identity migration", () => {
  let client: Client;
  let migrationSql: string;
  const schemas = new Set<string>();

  beforeAll(async () => {
    client = new Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();
    migrationSql = await readFile(migrationPath, "utf8");
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
  });

  it("normalizes order-place writes from an old app instance during rollout", async () => {
    const fixture = await createLegacyFixture("aigens:102830");
    await runMigration(fixture.schema);
    const newItemId = randomUUID();

    await client.query(`set search_path to ${fixture.schema}, public`);
    await client.query(
      `insert into ${fixture.schema}.canteen_menu_items
        (id, canteen_id, external_source, external_key)
       values ($1, $2, 'order-place:102830', 'product-99:dinner')`,
      [newItemId, fixture.canteenId],
    );
    await client.query("set search_path to public");

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
    `);
    await client.query(
      `insert into ${schema}.canteens (id, name) values
        ($1, 'Legacy Aigens canteen'),
        ('8cced094-25b7-439d-8989-ad484ae4b652', 'uc-can')`,
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
    await client.query("begin");
    try {
      await client.query(`set local search_path to ${schema}, public`);
      await client.query(migrationSql);
      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw error;
    }
  }
});
