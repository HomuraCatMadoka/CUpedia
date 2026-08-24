import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "pg";

const hasDb = Boolean(process.env.DATABASE_URL);
const migrationPath = path.resolve(
  "src/db/migrations/0090_configure-cafe-tolo-sync-schedule.sql",
);

describe.skipIf(!hasDb)(
  "canteen source schedule configuration migration",
  () => {
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

    it("configures only Cafe Tolo for its published weekly service schedule", async () => {
      const schema = `closed_weekdays_${randomUUID().replaceAll("-", "")}`;
      schemas.add(schema);
      await client.query(`create schema ${schema}`);
      await client.query(`
      create table ${schema}.canteen_menu_sources (
        provider text not null,
        external_store_id text not null,
        closed_weekdays integer[] not null default '{}',
        sync_meal_periods text[] not null default array['breakfast', 'lunch', 'dinner']::text[],
        updated_at timestamptz not null default now()
      )
    `);
      await client.query(
        `insert into ${schema}.canteen_menu_sources
        (provider, external_store_id, closed_weekdays)
       values
        ('pinme', '4899', '{}'),
        ('pinme', '4898', '{}'),
        ('aigens', '4899', '{}')`,
      );

      await client.query("begin");
      try {
        await client.query(`set local search_path to ${schema}`);
        await client.query(migrationSql);
        await client.query(migrationSql);
        await client.query("commit");
      } catch (error) {
        await client.query("rollback");
        throw error;
      }

      const result = await client.query<{
        provider: string;
        external_store_id: string;
        closed_weekdays: number[];
        sync_meal_periods: string[];
      }>(`
      select provider, external_store_id, closed_weekdays, sync_meal_periods
      from ${schema}.canteen_menu_sources
      order by provider, external_store_id
    `);
      expect(result.rows).toEqual([
        {
          provider: "aigens",
          external_store_id: "4899",
          closed_weekdays: [],
          sync_meal_periods: ["breakfast", "lunch", "dinner"],
        },
        {
          provider: "pinme",
          external_store_id: "4898",
          closed_weekdays: [],
          sync_meal_periods: ["breakfast", "lunch", "dinner"],
        },
        {
          provider: "pinme",
          external_store_id: "4899",
          closed_weekdays: [0],
          sync_meal_periods: ["lunch", "dinner"],
        },
      ]);
    });
  },
);
