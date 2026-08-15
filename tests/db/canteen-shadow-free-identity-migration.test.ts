import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "pg";
import { runCanteenMenuIdentityPreflight } from "@/lib/canteen-menu-identity-preflight";

const hasDb = Boolean(process.env.DATABASE_URL);
const requiresDb = process.env.MIGRATION_COMPATIBILITY_TEST === "1";
const execFileAsync = promisify(execFile);
if (requiresDb && !hasDb) {
  throw new Error(
    "DATABASE_URL is required when MIGRATION_COMPATIBILITY_TEST=1",
  );
}

describe.skipIf(!hasDb)("canteen shadow-free identity migration", () => {
  let client: Client;
  let migrationSql: string;
  let historicalFixtureSql: string;
  let zhparserSql: string;
  const schemas = new Set<string>();

  beforeAll(async () => {
    client = new Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();
    [migrationSql, historicalFixtureSql, zhparserSql] = await Promise.all([
      readFile(
        path.resolve(
          "src/db/migrations/0084_prepare-shadow-free-menu-identity-writes.sql",
        ),
        "utf8",
      ),
      readFile(
        path.resolve(
          "tests/db/fixtures/canteen-menu-identity-history-0081.sql",
        ),
        "utf8",
      ),
      readFile(path.resolve("init-zhparser.sql"), "utf8"),
    ]);
  });

  afterAll(async () => {
    for (const schema of schemas) {
      await client.query(`drop schema if exists ${schema} cascade`);
    }
    await client.end();
  });

  it("applies in the fresh migration chain and accepts both writer generations", async () => {
    const databaseName = `shadow_free_${randomUUID().replaceAll("-", "")}`;
    const databaseUrl = new URL(process.env.DATABASE_URL!);
    databaseUrl.pathname = `/${databaseName}`;
    await client.query(`create database ${databaseName}`);
    const freshClient = new Client({
      connectionString: databaseUrl.toString(),
    });
    try {
      await freshClient.connect();
      await freshClient.query(zhparserSql);
      await execFileAsync(
        process.execPath,
        ["--import", "tsx", path.resolve("scripts/run-db-migrations.ts")],
        {
          env: { ...process.env, DATABASE_URL: databaseUrl.toString() },
          timeout: 120_000,
        },
      );
      const canteenId = randomUUID();
      const sourceId = randomUUID();
      await freshClient.query(
        `insert into canteens (id, name) values ($1, 'fresh fixture')`,
        [canteenId],
      );
      await freshClient.query(
        `insert into canteen_menu_sources
          (id, canteen_id, provider, external_store_id)
         values ($1, $2, 'pinme', 'fresh-store')`,
        [sourceId, canteenId],
      );
      await freshClient.query(
        `insert into canteen_menu_items
          (id, canteen_id, name, menu_source_id, external_product_id)
         values ($1, $2, 'current writer', $3, 'current-product')`,
        [randomUUID(), canteenId, sourceId],
      );
      await freshClient.query(
        `insert into canteen_menu_items
          (id, canteen_id, name, menu_source_id, external_product_id,
           external_source, external_key)
         values ($1, $2, 'previous writer', $3, 'previous-product',
           'pinme:fresh-store', 'previous-product')`,
        [randomUUID(), canteenId, sourceId],
      );

      const state = await identityObjectState(freshClient, "public");
      expect(state).toEqual({
        rolloutConstraint: false,
        fillTrigger: false,
        fillFunction: false,
        shadowPairConstraint: true,
        shadowIndex: true,
        shadowColumns: 2,
      });
      const rows = await freshClient.query<{
        external_source: string | null;
        external_key: string | null;
      }>(
        `select external_source, external_key from canteen_menu_items
         where menu_source_id = $1 order by external_product_id`,
        [sourceId],
      );
      expect(rows.rows).toEqual([
        { external_source: null, external_key: null },
        {
          external_source: "pinme:fresh-store",
          external_key: "previous-product",
        },
      ]);
    } finally {
      await freshClient.end().catch(() => undefined);
      await client.query(
        `select pg_terminate_backend(pid) from pg_stat_activity
         where datname = $1 and pid <> pg_backend_pid()`,
        [databaseName],
      );
      await client.query(`drop database if exists ${databaseName}`);
    }
  }, 150_000);

  it("preserves historical UUID, price, vote, comment, and shadow rows exactly", async () => {
    const schema = `shadow_history_${randomUUID().replaceAll("-", "")}`;
    schemas.add(schema);
    await client.query(`create schema ${schema}`);
    await client.query(historicalFixtureSql.replaceAll("__SCHEMA__", schema));
    await client.query(`
      create unique index canteen_menu_items_external_identity_uidx
        on ${schema}.canteen_menu_items
        (canteen_id, external_source, external_key)
        where external_source is not null and external_key is not null;
      alter table ${schema}.canteen_menu_items
        add constraint canteen_menu_items_external_identity_chk
        check ((external_source is null) = (external_key is null));
      alter table ${schema}.canteen_menu_items
        add constraint canteen_menu_items_rollout_identity_chk
        check ((external_source is null) = (menu_source_id is null));
      create function ${schema}.canteen_menu_items_fill_normalized_identity()
      returns trigger language plpgsql as $$ begin return new; end $$;
      create trigger canteen_menu_items_fill_normalized_identity_trg
      before insert or update of external_source, external_key,
        menu_source_id, external_product_id
      on ${schema}.canteen_menu_items for each row
      execute function ${schema}.canteen_menu_items_fill_normalized_identity();
    `);
    const canteenId = randomUUID();
    const sourceId = randomUUID();
    const historicalItemId = randomUUID();
    const priceId = randomUUID();
    const voteId = randomUUID();
    const commentId = randomUUID();
    await client.query(
      `insert into ${schema}.canteens (id, name) values ($1, 'historical')`,
      [canteenId],
    );
    await client.query(
      `insert into ${schema}.canteen_menu_sources
        (id, canteen_id, provider, external_store_id)
       values ($1, $2, 'pinme', 'historical-store')`,
      [sourceId, canteenId],
    );
    await client.query(
      `insert into ${schema}.canteen_menu_items
        (id, canteen_id, name, price, menu_source_id, external_product_id,
         external_source, external_key)
       values ($1, $2, 'historical item', 42, $3, 'product-42',
         'pinme:historical-store', 'product-42#period=lunch')`,
      [historicalItemId, canteenId, sourceId],
    );
    await client.query(
      `insert into ${schema}.canteen_menu_item_prices
        (id, menu_item_id, amount_minor) values ($1, $2, 4200)`,
      [priceId, historicalItemId],
    );
    await client.query(
      `insert into ${schema}.canteen_dish_votes
        (id, menu_item_id, anonymous_session_id, vote)
       values ($1, $2, $3, 'like')`,
      [voteId, historicalItemId, randomUUID()],
    );
    await client.query(
      `insert into ${schema}.canteen_dish_comments
        (id, menu_item_id, user_id, content)
       values ($1, $2, $3, 'preserve history')`,
      [commentId, historicalItemId, randomUUID()],
    );
    const before = await snapshotHistory(schema);

    await runMigration(schema);

    expect(await snapshotHistory(schema)).toEqual(before);
    expect(await identityObjectState(client, schema)).toEqual({
      rolloutConstraint: false,
      fillTrigger: false,
      fillFunction: false,
      shadowPairConstraint: true,
      shadowIndex: true,
      shadowColumns: 2,
    });

    await client.query(
      `insert into ${schema}.canteen_menu_items
        (id, canteen_id, name, menu_source_id, external_product_id,
         external_source, external_key)
       values
        ($1, $3, 'previous writer', $4, 'previous-product',
          'pinme:historical-store', 'previous-product'),
        ($2, $3, 'current writer', $4, 'current-product', null, null)`,
      [randomUUID(), randomUUID(), canteenId, sourceId],
    );
    const report = await runCanteenMenuIdentityPreflight(client, {
      schema,
      applicationCommit: "0123456789abcdef",
      generatedAt: new Date("2026-08-15T01:00:00.000Z"),
    });
    expect(report.resultCode).toBe("PREFLIGHT_SAFE");
  });

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

  async function snapshotHistory(schema: string) {
    const tables = [
      "canteen_menu_items",
      "canteen_menu_item_prices",
      "canteen_dish_votes",
      "canteen_dish_comments",
    ];
    const snapshot: Record<string, unknown[]> = {};
    for (const table of tables) {
      const result = await client.query<{ row: unknown }>(
        `select to_jsonb(value) as row from ${schema}.${table} value
         order by to_jsonb(value)::text`,
      );
      snapshot[table] = result.rows.map(({ row }) => row);
    }
    return snapshot;
  }
});

async function identityObjectState(client: Client, schema: string) {
  const result = await client.query<{
    rollout_constraint: boolean;
    fill_trigger: boolean;
    fill_function: boolean;
    shadow_pair_constraint: boolean;
    shadow_index: boolean;
    shadow_columns: number;
  }>(
    `select
      exists (
        select 1 from pg_constraint
        where conrelid = format('%I.canteen_menu_items', $1::text)::regclass
          and conname = 'canteen_menu_items_rollout_identity_chk'
      ) as rollout_constraint,
      exists (
        select 1 from pg_trigger
        where tgrelid = format('%I.canteen_menu_items', $1::text)::regclass
          and tgname = 'canteen_menu_items_fill_normalized_identity_trg'
          and not tgisinternal
      ) as fill_trigger,
      exists (
        select 1 from pg_proc procedure
        join pg_namespace namespace on namespace.oid = procedure.pronamespace
        where namespace.nspname = $1
          and procedure.proname = 'canteen_menu_items_fill_normalized_identity'
      ) as fill_function,
      exists (
        select 1 from pg_constraint
        where conrelid = format('%I.canteen_menu_items', $1)::regclass
          and conname = 'canteen_menu_items_external_identity_chk'
      ) as shadow_pair_constraint,
      exists (
        select 1 from pg_indexes
        where schemaname = $1
          and indexname = 'canteen_menu_items_external_identity_uidx'
      ) as shadow_index,
      (select count(*)::integer from information_schema.columns
       where table_schema = $1 and table_name = 'canteen_menu_items'
         and column_name in ('external_source', 'external_key')) as shadow_columns`,
    [schema],
  );
  const row = result.rows[0];
  return {
    rolloutConstraint: row.rollout_constraint,
    fillTrigger: row.fill_trigger,
    fillFunction: row.fill_function,
    shadowPairConstraint: row.shadow_pair_constraint,
    shadowIndex: row.shadow_index,
    shadowColumns: row.shadow_columns,
  };
}
