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
const offeringIdentityMigrationPath = path.resolve(
  "src/db/migrations/0081_preserve-provider-menu-offering-identity.sql",
);

describe.skipIf(!hasDb)("canteen menu source identity migration", () => {
  let client: Client;
  let migrationSql: string;
  let repairMigrationSql: string;
  let offeringIdentityMigrationSql: string;
  const schemas = new Set<string>();

  beforeAll(async () => {
    client = new Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();
    migrationSql = await readFile(migrationPath, "utf8");
    repairMigrationSql = await readFile(repairMigrationPath, "utf8");
    offeringIdentityMigrationSql = await readFile(
      offeringIdentityMigrationPath,
      "utf8",
    );
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
        external_product_id: "product-42#offering-period=lunch",
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

  it("normalizes mixed PinMe product and product-period keys in place", async () => {
    const fixture = await createLegacyFixture("pinme:4898");
    const plainItemId = randomUUID();
    await client.query(
      `insert into ${fixture.schema}.canteen_menu_items
        (id, canteen_id, external_source, external_key)
       values ($1, $2, 'pinme:4898', 'product-99')`,
      [plainItemId, fixture.canteenId],
    );

    await runMigration(fixture.schema);

    const items = await client.query<{
      id: string;
      external_product_id: string;
      provider: string;
      external_store_id: string;
    }>(
      `select item.id, item.external_product_id,
        source.provider, source.external_store_id
       from ${fixture.schema}.canteen_menu_items item
       join ${fixture.schema}.canteen_menu_sources source
         on source.id = item.menu_source_id
       where item.id in ($1, $2)
       order by item.external_product_id`,
      [fixture.itemId, plainItemId],
    );
    expect(items.rows).toEqual([
      {
        id: fixture.itemId,
        external_product_id: "product-42",
        provider: "pinme",
        external_store_id: "4898",
      },
      {
        id: plainItemId,
        external_product_id: "product-99",
        provider: "pinme",
        external_store_id: "4898",
      },
    ]);

    const history = await client.query<{ votes: string; comments: string }>(
      `select
        (select count(*) from ${fixture.schema}.canteen_dish_votes where menu_item_id = $1) as votes,
        (select count(*) from ${fixture.schema}.canteen_dish_comments where menu_item_id = $1) as comments`,
      [fixture.itemId],
    );
    expect(history.rows[0]).toEqual({ votes: "1", comments: "1" });
  });

  it("preserves distinct Aigens period offerings and their history", async () => {
    const fixture = await createLegacyFixture("aigens:112891");
    const dinnerItemId = randomUUID();
    const dinnerUserId = randomUUID();
    await client.query(
      `insert into ${fixture.schema}.canteen_menu_items
        (id, canteen_id, external_source, external_key)
       values ($1, $2, 'aigens:112891', 'product-42:dinner')`,
      [dinnerItemId, fixture.canteenId],
    );
    await client.query(
      `insert into ${fixture.schema}.canteen_dish_votes (menu_item_id, user_id)
       values ($1, $2)`,
      [dinnerItemId, dinnerUserId],
    );
    await client.query(
      `insert into ${fixture.schema}.canteen_dish_comments
        (menu_item_id, user_id, content)
       values ($1, $2, 'dinner history')`,
      [dinnerItemId, dinnerUserId],
    );
    await client.query(
      `insert into ${fixture.schema}.canteen_menu_price_options
        (menu_item_id, amount_minor)
       values ($1, 1800), ($2, 2200)`,
      [fixture.itemId, dinnerItemId],
    );

    await runMigration(fixture.schema);

    const items = await client.query<{
      id: string;
      external_product_id: string;
      provider: string;
    }>(
      `select item.id, item.external_product_id, source.provider
       from ${fixture.schema}.canteen_menu_items item
       join ${fixture.schema}.canteen_menu_sources source
         on source.id = item.menu_source_id
       where item.id in ($1, $2)
       order by item.external_product_id`,
      [fixture.itemId, dinnerItemId],
    );
    expect(items.rows).toEqual([
      {
        id: dinnerItemId,
        external_product_id: "product-42#offering-period=dinner",
        provider: "aigens",
      },
      {
        id: fixture.itemId,
        external_product_id: "product-42#offering-period=lunch",
        provider: "aigens",
      },
    ]);
    const votes = await client.query<{ menu_item_id: string }>(
      `select menu_item_id from ${fixture.schema}.canteen_dish_votes
       where menu_item_id in ($1, $2) order by menu_item_id`,
      [fixture.itemId, dinnerItemId],
    );
    expect(votes.rows.map((row) => row.menu_item_id).sort()).toEqual(
      [fixture.itemId, dinnerItemId].sort(),
    );
    const history = await client.query<{
      id: string;
      amount_minor: number;
      comment_count: string;
    }>(
      `select item.id, price.amount_minor,
        (select count(*) from ${fixture.schema}.canteen_dish_comments comment
          where comment.menu_item_id = item.id) as comment_count
       from ${fixture.schema}.canteen_menu_items item
       join ${fixture.schema}.canteen_menu_price_options price
         on price.menu_item_id = item.id
       where item.id in ($1, $2)
       order by price.amount_minor`,
      [fixture.itemId, dinnerItemId],
    );
    expect(history.rows).toEqual([
      { id: fixture.itemId, amount_minor: 1800, comment_count: "1" },
      { id: dinnerItemId, amount_minor: 2200, comment_count: "1" },
    ]);
  });

  it("preserves audited static imports as manual menu items", async () => {
    const fixture = await createLegacyFixture("dst-menu");

    await runMigration(fixture.schema);

    const item = await client.query<{
      id: string;
      external_source: string | null;
      external_key: string | null;
      menu_source_id: string | null;
    }>(
      `select id, external_source, external_key, menu_source_id
       from ${fixture.schema}.canteen_menu_items where id = $1`,
      [fixture.itemId],
    );
    expect(item.rows[0]).toEqual({
      id: fixture.itemId,
      external_source: null,
      external_key: null,
      menu_source_id: null,
    });
    const history = await client.query<{ votes: string; comments: string }>(
      `select
        (select count(*) from ${fixture.schema}.canteen_dish_votes where menu_item_id = $1) as votes,
        (select count(*) from ${fixture.schema}.canteen_dish_comments where menu_item_id = $1) as comments`,
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

  it("reports a bounded source and key sample for an unparseable identity", async () => {
    const fixture = await createLegacyFixture("pinme:4898", "product#variant");

    await expect(runMigration(fixture.schema)).rejects.toThrow(
      /cannot safely parse legacy menu identit(?:y|ies)[\s\S]*pinme:4898[\s\S]*product#variant/,
    );

    const item = await client.query<{
      external_source: string;
      external_key: string;
      menu_source_id: string | null;
    }>(
      `select external_source, external_key, menu_source_id
       from ${fixture.schema}.canteen_menu_items where id = $1`,
      [fixture.itemId],
    );
    expect(item.rows[0]).toEqual({
      external_source: "pinme:4898",
      external_key: "product#variant",
      menu_source_id: null,
    });
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
      external_product_id: "product-99#offering-period=dinner",
      provider: "aigens",
    });
  });

  it("normalizes PinMe product-period writes from an old app instance", async () => {
    const fixture = await createLegacyFixture("pinme:4898", "product-42");
    await runMigration(fixture.schema);
    const newItemId = randomUUID();

    await client.query("begin");
    try {
      await client.query(`set local search_path to ${fixture.schema}, public`);
      await client.query(
        `insert into ${fixture.schema}.canteen_menu_items
          (id, canteen_id, external_source, external_key)
         values ($1, $2, 'pinme:4898', 'product-99:dinner')`,
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
      `select item.external_source, item.external_product_id, source.provider
       from ${fixture.schema}.canteen_menu_items item
       join ${fixture.schema}.canteen_menu_sources source
         on source.id = item.menu_source_id
       where item.id = $1`,
      [newItemId],
    );
    expect(inserted.rows[0]).toEqual({
      external_source: "pinme:4898",
      external_product_id: "product-99",
      provider: "pinme",
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
       set external_source = 'order-place:102830',
           external_product_id = 'product-42'
       where id = $1`,
      [fixture.itemId],
    );
    await client.query(
      `alter table ${fixture.schema}.canteen_menu_items
       enable trigger canteen_menu_items_fill_normalized_identity_trg`,
    );

    await runSqlMigration(fixture.schema, repairMigrationSql);
    await runSqlMigration(fixture.schema, offeringIdentityMigrationSql);

    const repaired = await client.query<{
      external_source: string;
      external_product_id: string;
    }>(
      `select external_source, external_product_id
       from ${fixture.schema}.canteen_menu_items where id = $1`,
      [fixture.itemId],
    );
    expect(repaired.rows[0].external_source).toBe("aigens:102830");
    expect(repaired.rows[0].external_product_id).toBe(
      "product-42#offering-period=lunch",
    );

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

  it("repairs an app-written single-period Aigens shadow key", async () => {
    const fixture = await createLegacyFixture("aigens:102830");
    await runMigration(fixture.schema);
    await runFixtureQuery(
      fixture.schema,
      `update ${fixture.schema}.canteen_menu_items
       set external_key = 'product-42#period=lunch',
           external_product_id = 'product-42'
       where id = $1`,
      [fixture.itemId],
    );

    await runSqlMigration(fixture.schema, offeringIdentityMigrationSql);

    const repaired = await client.query<{ external_product_id: string }>(
      `select external_product_id
       from ${fixture.schema}.canteen_menu_items where id = $1`,
      [fixture.itemId],
    );
    expect(repaired.rows[0].external_product_id).toBe(
      "product-42#offering-period=lunch",
    );
  });

  it("fails closed for an app-written multi-period Aigens shadow key", async () => {
    const fixture = await createLegacyFixture("aigens:102830");
    await runMigration(fixture.schema);
    await seedWithoutIdentityTrigger(
      fixture.schema,
      `update ${fixture.schema}.canteen_menu_items
       set external_key = 'product-42#period=lunch+dinner',
           external_product_id = 'product-42'
       where id = $1`,
      [fixture.itemId],
    );

    await expect(
      runSqlMigration(fixture.schema, offeringIdentityMigrationSql),
    ).rejects.toThrow(
      /ambiguous multi-period Aigens offering identity[\s\S]*102830[\s\S]*product-42#period=lunch\+dinner/,
    );

    const unchanged = await client.query<{ external_product_id: string }>(
      `select external_product_id
       from ${fixture.schema}.canteen_menu_items where id = $1`,
      [fixture.itemId],
    );
    expect(unchanged.rows[0].external_product_id).toBe("product-42");
  });

  it("leaves an already-normalized Aigens offering identity unchanged", async () => {
    const fixture = await createLegacyFixture("aigens:102830");
    await runMigration(fixture.schema);
    await runFixtureQuery(
      fixture.schema,
      `update ${fixture.schema}.canteen_menu_items
       set external_key = 'product-42#offering-period=lunch#period=lunch',
           external_product_id = 'product-42#offering-period=lunch'
       where id = $1`,
      [fixture.itemId],
    );

    await runSqlMigration(fixture.schema, offeringIdentityMigrationSql);

    const unchanged = await client.query<{ external_product_id: string }>(
      `select external_product_id
       from ${fixture.schema}.canteen_menu_items where id = $1`,
      [fixture.itemId],
    );
    expect(unchanged.rows[0].external_product_id).toBe(
      "product-42#offering-period=lunch",
    );
  });

  it("updates an already-migrated rollout trigger for PinMe period keys", async () => {
    const fixture = await createLegacyFixture("pinme:4898", "product-42");
    await runMigration(fixture.schema);
    await runSqlMigration(fixture.schema, repairMigrationSql);
    await runSqlMigration(fixture.schema, offeringIdentityMigrationSql);
    const rollingItemId = randomUUID();

    await client.query("begin");
    try {
      await client.query(`set local search_path to ${fixture.schema}, public`);
      await client.query(
        `insert into ${fixture.schema}.canteen_menu_items
          (id, canteen_id, external_source, external_key)
         values ($1, $2, 'pinme:4898', 'product-100:breakfast')`,
        [rollingItemId, fixture.canteenId],
      );
      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw error;
    }
    const rollingWrite = await client.query<{
      external_product_id: string;
    }>(
      `select external_product_id from ${fixture.schema}.canteen_menu_items
       where id = $1`,
      [rollingItemId],
    );
    expect(rollingWrite.rows[0].external_product_id).toBe("product-100");
  });

  it("normalizes the previous app's single-period Aigens write during rollout", async () => {
    const fixture = await createLegacyFixture("aigens:102830");
    await runMigration(fixture.schema);
    await runSqlMigration(fixture.schema, offeringIdentityMigrationSql);
    const rollingItemId = randomUUID();

    await runFixtureQuery(
      fixture.schema,
      `insert into ${fixture.schema}.canteen_menu_items
        (id, canteen_id, external_source, external_key,
         menu_source_id, external_product_id)
       select $1, $2, 'aigens:102830', 'product-100#period=dinner',
         source.id, 'product-100'
       from ${fixture.schema}.canteen_menu_sources source
       where source.canteen_id = $2`,
      [rollingItemId, fixture.canteenId],
    );

    const inserted = await client.query<{ external_product_id: string }>(
      `select external_product_id from ${fixture.schema}.canteen_menu_items
       where id = $1`,
      [rollingItemId],
    );
    expect(inserted.rows[0].external_product_id).toBe(
      "product-100#offering-period=dinner",
    );
  });

  it("rejects the previous app's multi-period Aigens write during rollout", async () => {
    const fixture = await createLegacyFixture("aigens:102830");
    await runMigration(fixture.schema);
    await runSqlMigration(fixture.schema, offeringIdentityMigrationSql);
    const rollingItemId = randomUUID();

    await expect(
      runFixtureQuery(
        fixture.schema,
        `insert into ${fixture.schema}.canteen_menu_items
          (id, canteen_id, external_source, external_key,
           menu_source_id, external_product_id)
         select $1, $2, 'aigens:102830',
           'product-100#period=lunch+dinner', source.id, 'product-100'
         from ${fixture.schema}.canteen_menu_sources source
         where source.canteen_id = $2`,
        [rollingItemId, fixture.canteenId],
      ),
    ).rejects.toThrow(/ambiguous multi-period Aigens offering identity/);

    const stored = await client.query<{ count: string }>(
      `select count(*) from ${fixture.schema}.canteen_menu_items where id = $1`,
      [rollingItemId],
    );
    expect(stored.rows[0].count).toBe("0");
  });

  async function createLegacyFixture(
    externalSource: string,
    externalKey = "product-42:lunch",
  ) {
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
      create table ${schema}.canteen_menu_price_options (
        id uuid primary key default gen_random_uuid(),
        menu_item_id uuid not null references ${schema}.canteen_menu_items(id),
        amount_minor integer not null
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
       values ($1, $2, $3, $4)`,
      [itemId, canteenId, externalSource, externalKey],
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

  async function runFixtureQuery(
    schema: string,
    sql: string,
    params: unknown[],
  ) {
    await client.query("begin");
    try {
      await client.query(`set local search_path to ${schema}, public`);
      const result = await client.query(sql, params);
      await client.query("commit");
      return result;
    } catch (error) {
      await client.query("rollback");
      throw error;
    }
  }

  async function seedWithoutIdentityTrigger(
    schema: string,
    sql: string,
    params: unknown[],
  ) {
    await client.query("begin");
    try {
      await client.query(`set local search_path to ${schema}, public`);
      await client.query(
        `alter table ${schema}.canteen_menu_items
         disable trigger canteen_menu_items_fill_normalized_identity_trg`,
      );
      await client.query(sql, params);
      await client.query(
        `alter table ${schema}.canteen_menu_items
         enable trigger canteen_menu_items_fill_normalized_identity_trg`,
      );
      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw error;
    }
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
