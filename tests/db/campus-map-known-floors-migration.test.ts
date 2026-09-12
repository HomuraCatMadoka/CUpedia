import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { expect, it } from "vitest";
import { campusMapOfficialFacilityFloorId } from "@/lib/campus-map/official-facility-manifest";

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

it.skipIf(!process.env.DATABASE_URL)(
  "seeds only source-backed official facility Floors and their provenance",
  async () => {
    const client = new Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();
    try {
      await client.query("begin");
      await client.query(`
        create temporary table campus_map_buildings (id uuid primary key);
        create temporary table campus_map_floors (
          id uuid primary key default gen_random_uuid(),
          building_id uuid not null,
          display_label text not null,
          sort_order int not null
        );
        create unique index campus_map_official_floor_label_test_uq
          on campus_map_floors (building_id, lower(btrim(display_label)));
        create temporary table campus_map_provenance_sources (
          id uuid primary key default gen_random_uuid(),
          source_kind text not null,
          source_ref text not null,
          source_url text,
          source_owner text,
          source_version text,
          snapshot_hash text,
          accessed_on date not null,
          rights_status text not null,
          limitations text,
          note text,
          unique(source_kind, source_ref)
        );
        create temporary table campus_map_floor_provenance (
          floor_id uuid not null,
          provenance_id uuid not null,
          primary key(floor_id, provenance_id)
        );
        insert into campus_map_buildings values
          ('367d9f99-13e6-5805-8447-5b523f7b36d3'),
          ('42186269-a5d4-57b4-ab6d-a75d13e379bc'),
          ('35b1dbbd-278f-501a-bd22-26f4f7eb2164'),
          ('545893b6-b89b-5067-aba0-c86518aa8fa8'),
          ('53db00f9-33b3-5155-9cce-518fcf3090dd'),
          ('c2ddb931-ae2e-5804-a949-9d9a4432b139'),
          ('e1f47035-39db-5cdf-9d69-ae5a16f12f14');
      `);
      const sql = await readFile(
        "src/db/migrations/0131_campus_map_official_facility_floors.sql",
        "utf8",
      );
      await client.query(sql);
      await client.query(sql);

      const floors = await client.query<{
        id: string;
        buildingId: string;
        displayLabel: string;
        sourceRef: string;
      }>(`
        select floor.id,
               floor.building_id as "buildingId",
               floor.display_label as "displayLabel",
               source.source_ref as "sourceRef"
          from campus_map_floors floor
          join campus_map_floor_provenance link on link.floor_id = floor.id
          join campus_map_provenance_sources source on source.id = link.provenance_id
         order by floor.building_id, floor.sort_order, floor.display_label
      `);
      expect(floors.rows).toHaveLength(16);
      expect(
        floors.rows
          .filter(
            (floor) =>
              floor.buildingId === "42186269-a5d4-57b4-ab6d-a75d13e379bc",
          )
          .map((floor) => floor.displayLabel),
      ).toEqual(["UG", "1", "7"]);
      expect(
        floors.rows
          .filter(
            (floor) =>
              floor.buildingId === "53db00f9-33b3-5155-9cce-518fcf3090dd",
          )
          .map((floor) => floor.displayLabel),
      ).toEqual(["4", "5"]);
      expect(
        floors.rows
          .filter(
            (floor) =>
              floor.buildingId === "c2ddb931-ae2e-5804-a949-9d9a4432b139",
          )
          .map((floor) => floor.displayLabel),
      ).toEqual(["4", "7", "8", "9"]);
      expect(
        floors.rows.filter((floor) =>
          [
            "367d9f99-13e6-5805-8447-5b523f7b36d3",
            "e1f47035-39db-5cdf-9d69-ae5a16f12f14",
          ].includes(floor.buildingId),
        ),
      ).toEqual([]);

      const yiaThirdFloor = floors.rows.find(
        (floor) =>
          floor.buildingId === "545893b6-b89b-5067-aba0-c86518aa8fa8" &&
          floor.displayLabel === "3",
      );
      expect(yiaThirdFloor).toEqual({
        id: campusMapOfficialFacilityFloorId(
          "545893b6-b89b-5067-aba0-c86518aa8fa8",
          "3",
        ),
        buildingId: "545893b6-b89b-5067-aba0-c86518aa8fa8",
        displayLabel: "3",
        sourceRef: "cuhk-osa:amenity:i-lounge:floor:2026-09-07",
      });
      expect(
        floors.rows.find(
          (floor) =>
            floor.buildingId === "35b1dbbd-278f-501a-bd22-26f4f7eb2164",
        )?.sourceRef,
      ).toBe("cuhk-osa:amenity:bfc:floor:2026-09-07");
    } finally {
      await client.query("rollback");
      await client.end();
    }
  },
);
