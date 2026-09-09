import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { expect, it } from "vitest";

it.skipIf(!process.env.DATABASE_URL)(
  "seeds known floors idempotently and preserves an existing floor identity",
  async () => {
    const client = new Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();
    try {
      await client.query("begin");
      // Use temporary tables to exercise the data migration without touching app rows.
      await client.query(`
      create temporary table campus_map_buildings (id uuid primary key);
      create temporary table campus_map_floors (id uuid primary key default gen_random_uuid(), building_id uuid, display_label text, sort_order int, unique(building_id, display_label));
      create temporary table campus_map_provenance_sources (id uuid primary key default gen_random_uuid(), source_kind text, source_ref text, source_url text, source_owner text, source_version text, note text, accessed_on date, rights_status text, limitations text, unique(source_kind,source_ref));
      create temporary table campus_map_provider_mappings (provider text, provider_object_id text, target_kind text, building_id uuid, place_id uuid, provenance_id uuid, unique(provider,provider_object_id));
      create temporary table campus_map_floor_provenance (floor_id uuid, provenance_id uuid, primary key(floor_id,provenance_id));
      insert into campus_map_buildings values ('631f84c4-9daa-5a40-bafc-886dbb59121a'), ('41b66763-b2ae-5ede-989e-846e2153bdaa');
    `);
      const floorId = randomUUID();
      await client.query(
        "insert into campus_map_floors (id,building_id,display_label,sort_order) values ($1,'631f84c4-9daa-5a40-bafc-886dbb59121a','1',0)",
        [floorId],
      );
      const sql = await readFile(
        "src/db/migrations/0128_campus_map_known_building_floors.sql",
        "utf8",
      );
      const order = await readFile(
        "src/db/migrations/0129_campus_map_known_floor_order.sql",
        "utf8",
      );
      await client.query(sql);
      await client.query(order);
      await client.query(sql);
      const mapping = await readFile(
        "src/db/migrations/0130_campus_map_cheng_ming_hotspot.sql",
        "utf8",
      );
      await client.query(mapping);
      await client.query(mapping);
      expect(
        (
          await client.query(
            "select provider_object_id, building_id from campus_map_provider_mappings",
          )
        ).rows,
      ).toEqual([
        {
          provider_object_id: "B0FFF0ABIJ",
          building_id: "631f84c4-9daa-5a40-bafc-886dbb59121a",
        },
      ]);
      const floors = await client.query(
        "select id, display_label, sort_order from campus_map_floors where building_id='631f84c4-9daa-5a40-bafc-886dbb59121a' order by sort_order",
      );
      expect(floors.rows.map((row) => row.display_label)).toEqual([
        "G",
        "1",
        "2",
        "3",
      ]);
      expect(floors.rows[1].id).toBe(floorId);
      expect(
        (await client.query("select * from campus_map_floor_provenance"))
          .rowCount,
      ).toBe(6);
    } finally {
      await client.query("rollback");
      await client.end();
    }
  },
);
