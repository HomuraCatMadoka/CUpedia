import { readFile } from "node:fs/promises";
import path from "node:path";

import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { listCampusMapBrowseBuildings } from "@/lib/campus-map/fact-store";

const hasDb = Boolean(process.env.DATABASE_URL);
const officialSourceRef =
  "cuhk-campus-map:buildings:20161006:sha256:3307c3936e3b8a787607c0c708454f52c2f5767e49f2a6e3062e949b5ce12cda";
const officialItemSourcePrefix = `${officialSourceRef}:building:`;
const scienceCentreComplexSourceRef =
  "cuhk-cdo:building-directory:20241111:science-centre-complex";
const scienceCentreProviderProvenanceId =
  "39515576-131d-4440-9fee-0ec2469c7a48";
const scienceCentreBuildingId = "d0f66212-4138-5ab3-b8e5-04980cf64fb3";
const highKunBuildingId = "b1b8bdb0-e9dc-4b20-af14-6490b31088f2";
const maLinBuildingId = "acdb9ef2-f6ca-43ce-ae18-a06a1f677da5";
const legacyScienceCentreId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

describe.skipIf(!hasDb)("Campus Map Building directory bootstrap", () => {
  let pool: Pool;

  beforeAll(() => {
    pool = new Pool({ connectionString: process.env.DATABASE_URL });
  });

  afterAll(async () => {
    await pool?.end();
  });

  it("makes the official CUHK Building directory available to facility Add", async () => {
    const buildings = await listCampusMapBrowseBuildings();
    const scienceCentre = buildings.find(
      (building) => building.englishName === "University Science Centre",
    );

    expect(buildings.length).toBeGreaterThanOrEqual(160);
    expect(scienceCentre).toMatchObject({
      name: "科学馆",
      code: "H10",
      aliases: expect.arrayContaining(["科學館", "SC"]),
      anchor: {
        longitude: 114.207928776741,
        latitude: 22.4194639630236,
        crs: "wgs84",
      },
      floors: [],
    });
    expect(
      buildings.some(
        (building) => building.englishName === "Si Yuan Amphitheatre",
      ),
    ).toBe(false);
  });

  it("records explicit official item provenance without bypassing the mapping registry", async () => {
    const migrationSql = await readFile(
      path.resolve("src/db/migrations/0120_bootstrap_campus_map_buildings.sql"),
      "utf8",
    );
    const client = await pool.connect();

    try {
      await client.query("begin");
      const mappingSnapshot = () =>
        client.query<{
          id: string;
          provider: string;
          providerObjectId: string;
          targetKind: string;
          buildingId: string | null;
          placeId: string | null;
          provenanceId: string | null;
          createdAt: Date;
        }>(
          `select id::text,
                  provider,
                  provider_object_id as "providerObjectId",
                  target_kind as "targetKind",
                  building_id as "buildingId",
                  place_id as "placeId",
                  provenance_id as "provenanceId",
                  created_at as "createdAt"
           from campus_map_provider_mappings
           order by provider, provider_object_id`,
        );
      const providerMappingsBefore = await mappingSnapshot();

      await client.query(migrationSql);

      const providerMappingsAfter = await mappingSnapshot();
      const provenance = await client.query<{ buildingCount: string }>(
        `select count(distinct link.building_id)::text as "buildingCount"
         from campus_map_building_provenance link
         join campus_map_provenance_sources source
           on source.id = link.provenance_id
         where source.source_kind = 'official' and source.source_ref like $1`,
        [`${officialItemSourcePrefix}%`],
      );
      const scienceCentreItem = await client.query<{
        buildingId: string;
        sourceRef: string;
        coordinateX: number | null;
        coordinateY: number | null;
        coordinateCrs: string | null;
      }>(
        `select link.building_id as "buildingId",
                source.source_ref as "sourceRef",
                source_coordinate_x as "coordinateX",
                source_coordinate_y as "coordinateY",
                source_coordinate_crs as "coordinateCrs"
         from campus_map_provenance_sources source
         join campus_map_building_provenance link
           on link.provenance_id = source.id
         where source.source_kind = 'official' and source.source_ref = $1`,
        [`${officialItemSourcePrefix}15`],
      );

      expect(providerMappingsAfter.rows).toEqual(providerMappingsBefore.rows);
      expect(Number(provenance.rows[0]?.buildingCount)).toBe(158);
      expect(scienceCentreItem.rows).toEqual([
        {
          buildingId: scienceCentreBuildingId,
          sourceRef: `${officialItemSourcePrefix}15`,
          coordinateX: 114.207928776741,
          coordinateY: 22.4194639630236,
          coordinateCrs: "wgs84",
        },
      ]);
    } finally {
      await client.query("rollback");
      client.release();
    }
  });

  it("creates distinct Science Centre complex Buildings and exact AMap mappings", async () => {
    const migrationSql = await readFile(
      path.resolve(
        "src/db/migrations/0123_campus_map_amap_hotspot_mappings.sql",
      ),
      "utf8",
    );
    const client = await pool.connect();

    try {
      await client.query("begin");
      await client.query(migrationSql);
      await client.query(migrationSql);

      const buildings = await client.query<{
        id: string;
        name: string;
        englishName: string | null;
        aliases: string[];
      }>(
        `select id::text, name, english_name as "englishName", aliases
         from campus_map_buildings
         where id = any($1::uuid[])
         order by id`,
        [[scienceCentreBuildingId, highKunBuildingId, maLinBuildingId]],
      );
      const mappings = await client.query<{
        providerObjectId: string;
        buildingId: string;
      }>(
        `select provider_object_id as "providerObjectId",
                building_id::text as "buildingId"
         from campus_map_provider_mappings
         where provider = 'amap'
           and provider_object_id = any($1::text[])
         order by provider_object_id`,
        [["B0J2RXUQB6", "B0FFF2MN12", "B0FFF292L7"]],
      );
      const provenance = await client.query<{ buildingId: string }>(
        `select link.building_id::text as "buildingId"
         from campus_map_building_provenance link
         join campus_map_provenance_sources source
           on source.id = link.provenance_id
         where link.building_id = any($1::uuid[])
           and source.source_kind = 'official'
           and source.source_ref = $2
         order by link.building_id`,
        [
          [scienceCentreBuildingId, highKunBuildingId, maLinBuildingId],
          scienceCentreComplexSourceRef,
        ],
      );

      expect(buildings.rows).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: scienceCentreBuildingId,
            name: "科学馆",
            aliases: expect.not.arrayContaining([
              "高锟楼",
              "Charles Kuen Kao Building",
              "马临楼",
              "Ma Lin Building",
            ]),
          }),
          expect.objectContaining({
            id: highKunBuildingId,
            name: "高锟楼",
            englishName: "Charles Kuen Kao Building",
          }),
          expect.objectContaining({
            id: maLinBuildingId,
            name: "马临楼",
            englishName: "Ma Lin Building",
          }),
        ]),
      );
      expect(mappings.rows).toEqual([
        { providerObjectId: "B0FFF292L7", buildingId: maLinBuildingId },
        { providerObjectId: "B0FFF2MN12", buildingId: highKunBuildingId },
        { providerObjectId: "B0J2RXUQB6", buildingId: scienceCentreBuildingId },
      ]);
      expect(provenance.rows.map(({ buildingId }) => buildingId)).toEqual(
        [
          scienceCentreBuildingId,
          highKunBuildingId,
          maLinBuildingId,
        ].toSorted(),
      );
    } finally {
      await client.query("rollback");
      client.release();
    }
  });

  it("records the reviewed Science Centre AMap object as candidate evidence", async () => {
    const evidence = await pool.query<{
      sourceKind: string;
      sourceRef: string;
      coordinateX: number | null;
      coordinateY: number | null;
      coordinateCrs: string | null;
    }>(
      `select source_kind as "sourceKind",
              source_ref as "sourceRef",
              source_coordinate_x as "coordinateX",
              source_coordinate_y as "coordinateY",
              source_coordinate_crs as "coordinateCrs"
       from campus_map_provenance_sources
       where id = $1`,
      [scienceCentreProviderProvenanceId],
    );

    expect(evidence.rows).toEqual([
      {
        sourceKind: "provider-candidate",
        sourceRef: "amap:poi:B0J2RXUQB6:hotspotclick:2026-08-26",
        coordinateX: 114.20801,
        coordinateY: 22.41966,
        coordinateCrs: "gcj02",
      },
    ]);
  });

  it("does not attach official identity to a same-name legacy Building", async () => {
    const migrationSql = await readFile(
      path.resolve("src/db/migrations/0120_bootstrap_campus_map_buildings.sql"),
      "utf8",
    );
    const client = await pool.connect();

    try {
      await client.query("begin");
      await client.query(
        `insert into campus_map_buildings (id, name, english_name)
         values ($1, '科学馆', 'University Science Centre')`,
        [legacyScienceCentreId],
      );
      await client.query(migrationSql);

      const legacyLinks = await client.query<{ linkCount: string }>(
        `select count(*)::text as "linkCount"
         from campus_map_building_provenance link
         join campus_map_provenance_sources source
           on source.id = link.provenance_id
         where link.building_id = $1
           and source.source_kind = 'official'
           and source.source_ref = $2`,
        [legacyScienceCentreId, officialSourceRef],
      );

      expect(Number(legacyLinks.rows[0]?.linkCount)).toBe(0);
    } finally {
      await client.query("rollback");
      client.release();
    }
  });
});
