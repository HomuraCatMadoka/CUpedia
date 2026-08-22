import { drizzle } from "drizzle-orm/node-postgres";
import { eq } from "drizzle-orm";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  CAMPUS_MAP_FACT_SCHEMA_V1,
  campusMapBuildings,
  campusMapChangesets,
  campusMapCurrentFacts,
  campusMapCurrentRevisions,
  campusMapFactRevisions,
  campusMapFactSchemas,
  campusMapFloors,
  campusMapPlaceChanges,
  campusMapPlaces,
  campusMapProvenanceSources,
  campusMapRevisionProvenance,
  campusMapRevisionVisibility,
} from "@/db/schema";
import {
  getCampusMapChangeset,
  getCampusMapCurrentPlace,
  getCampusMapFactSchema,
  getCampusMapPlaceHistory,
  listCampusMapChangesets,
  listCampusMapCurrentPlaces,
} from "@/lib/campus-map/fact-store";

const hasDb = Boolean(process.env.DATABASE_URL);

const ids = {
  actor: "00000000-0000-4000-8000-000000000701",
  building: "00000000-0000-4000-8000-000000000702",
  floor: "00000000-0000-4000-8000-000000000703",
  place: "00000000-0000-4000-8000-000000000704",
  changeset: "00000000-0000-4000-8000-000000000705",
  placeChange: "00000000-0000-4000-8000-000000000706",
  revision: "00000000-0000-4000-8000-000000000707",
  provenance: "00000000-0000-4000-8000-000000000708",
} as const;

describe.skipIf(!hasDb)("Campus Map fact-store read interface (#717)", () => {
  let pool: Pool;
  let database: ReturnType<typeof drizzle>;

  beforeAll(async () => {
    pool = new Pool({ connectionString: process.env.DATABASE_URL });
    database = drizzle(pool);

    await database.insert(campusMapFactSchemas).values({
      version: 701,
      status: "draft",
      definition: CAMPUS_MAP_FACT_SCHEMA_V1,
      displayMetadata: { name: { label: "名称" } },
    });
    await database.insert(campusMapProvenanceSources).values({
      id: ids.provenance,
      sourceKind: "field-observation",
      sourceRef: "test:library-gf-water",
      accessedOn: "2026-08-22",
      observedAt: new Date("2026-08-21T03:00:00Z"),
      rightsStatus: "original-observation",
      limitations: "Test fixture only",
    });
    await database.insert(campusMapBuildings).values({
      id: ids.building,
      name: "大学图书馆",
      englishName: "University Library",
      code: "UL",
      anchorLongitude: 114.2,
      anchorLatitude: 22.4,
      anchorCrs: "wgs84",
    });
    await database.insert(campusMapFloors).values({
      id: ids.floor,
      buildingId: ids.building,
      displayLabel: "G/F",
      sortOrder: 0,
    });
    await database.insert(campusMapPlaces).values({ id: ids.place });
    await database.insert(campusMapChangesets).values({
      id: ids.changeset,
      actorIdSnapshot: ids.actor,
      actorNicknameSnapshot: "测试贡献者",
      comment: "添加已现场核对的饮水点",
      sourceSummary: "现场观察",
      clientName: "test",
      clientVersion: "1",
      affectedCount: 1,
      createdCount: 1,
    });
    await database.insert(campusMapPlaceChanges).values({
      id: ids.placeChange,
      changesetId: ids.changeset,
      placeId: ids.place,
      operation: "create",
      fieldDiff: {
        name: { before: null, after: "大学图书馆饮水点", label: "名称" },
      },
    });
    await database.insert(campusMapFactRevisions).values({
      id: ids.revision,
      placeId: ids.place,
      changesetId: ids.changeset,
      placeChangeId: ids.placeChange,
      factSchemaVersion: 701,
      fieldMetadata: { name: { label: "名称" } },
      status: "active",
      actorIdSnapshot: ids.actor,
      actorNicknameSnapshot: "测试贡献者",
      name: "大学图书馆饮水点",
      buildingId: ids.building,
      floorId: ids.floor,
      pinType: "water",
      audience: "cuhk-member",
      credentialRequirement: "library-card",
      reservationRequirement: "none",
      temporaryStatus: "normal",
      locationKind: "floor",
      observedAt: new Date("2026-08-21T03:00:00Z"),
    });
    await database.insert(campusMapRevisionProvenance).values({
      revisionId: ids.revision,
      provenanceId: ids.provenance,
    });
    await database.insert(campusMapRevisionVisibility).values({
      revisionId: ids.revision,
    });
    await database.insert(campusMapCurrentRevisions).values({
      placeId: ids.place,
      revisionId: ids.revision,
      status: "active",
    });
    await database.insert(campusMapCurrentFacts).values({
      placeId: ids.place,
      revisionId: ids.revision,
      factSchemaVersion: 701,
      name: "大学图书馆饮水点",
      buildingId: ids.building,
      floorId: ids.floor,
      pinType: "water",
      audience: "cuhk-member",
      credentialRequirement: "library-card",
      reservationRequirement: "none",
      temporaryStatus: "normal",
      locationKind: "floor",
      observedAt: new Date("2026-08-21T03:00:00Z"),
      publishedAt: new Date("2026-08-22T01:00:00Z"),
    });
  });

  afterAll(async () => {
    if (!pool) return;
    await database
      .delete(campusMapCurrentFacts)
      .where(eq(campusMapCurrentFacts.placeId, ids.place));
    await database
      .delete(campusMapCurrentRevisions)
      .where(eq(campusMapCurrentRevisions.placeId, ids.place));
    await database
      .delete(campusMapRevisionVisibility)
      .where(eq(campusMapRevisionVisibility.revisionId, ids.revision));
    await database
      .delete(campusMapRevisionProvenance)
      .where(eq(campusMapRevisionProvenance.revisionId, ids.revision));
    await database
      .delete(campusMapFactRevisions)
      .where(eq(campusMapFactRevisions.id, ids.revision));
    await database
      .delete(campusMapPlaceChanges)
      .where(eq(campusMapPlaceChanges.id, ids.placeChange));
    await database
      .delete(campusMapChangesets)
      .where(eq(campusMapChangesets.id, ids.changeset));
    await database
      .delete(campusMapPlaces)
      .where(eq(campusMapPlaces.id, ids.place));
    await database
      .delete(campusMapFloors)
      .where(eq(campusMapFloors.id, ids.floor));
    await database
      .delete(campusMapBuildings)
      .where(eq(campusMapBuildings.id, ids.building));
    await database
      .delete(campusMapProvenanceSources)
      .where(eq(campusMapProvenanceSources.id, ids.provenance));
    await database
      .delete(campusMapFactSchemas)
      .where(eq(campusMapFactSchemas.version, 701));
    await pool.end();
  });

  it("returns one safe active Place projection with honest floor evidence", async () => {
    await expect(getCampusMapCurrentPlace(ids.place)).resolves.toEqual({
      id: ids.place,
      revisionId: ids.revision,
      factSchemaVersion: 701,
      name: "大学图书馆饮水点",
      pinType: "water",
      capabilities: [],
      access: {
        audience: "cuhk-member",
        credentialRequirement: "library-card",
        schedule: { kind: "unknown" },
        reservationRequirement: "none",
        temporaryStatus: "normal",
      },
      facets: { gender: "unknown", wheelchairAccess: "unknown" },
      location: {
        kind: "floor",
        building: {
          id: ids.building,
          name: "大学图书馆",
          englishName: "University Library",
          code: "UL",
        },
        floor: { id: ids.floor, displayLabel: "G/F", sortOrder: 0 },
      },
      observedAt: new Date("2026-08-21T03:00:00Z"),
      verifiedAt: null,
      publishedAt: new Date("2026-08-22T01:00:00Z"),
      provenance: [
        {
          kind: "field-observation",
          ref: "test:library-gf-water",
          url: null,
          version: null,
          accessedOn: "2026-08-22",
          observedAt: new Date("2026-08-21T03:00:00Z"),
          rightsStatus: "original-observation",
          limitations: "Test fixture only",
          sourceCoordinate: null,
        },
      ],
    });
  });

  it("returns revision-addressable preset metadata without Drizzle rows", async () => {
    await expect(getCampusMapFactSchema(701)).resolves.toMatchObject({
      version: 701,
      definition: {
        fields: {
          accessSchedule: {
            kind: "access-schedule",
            variants: ["unknown", "always", "weekly"],
            timezone: "Asia/Hong_Kong",
          },
        },
        pinTypes: {
          water: {
            requiredFields: ["name", "pinType", "location"],
          },
        },
      },
      displayMetadata: { name: { label: "名称" } },
    });
  });

  it("exposes the canonical schema by version before the first publication", async () => {
    await expect(getCampusMapFactSchema(1)).resolves.toMatchObject({
      version: 1,
      definition: CAMPUS_MAP_FACT_SCHEMA_V1,
      displayMetadata: expect.objectContaining({
        name: expect.objectContaining({ label: "名称" }),
      }),
    });
  });

  it("returns null instead of exposing retired or unknown Places", async () => {
    await expect(
      getCampusMapCurrentPlace("00000000-0000-4000-8000-000000000799"),
    ).resolves.toBeNull();
  });

  it("filters the active projection by canonical directory and map fields", async () => {
    await expect(
      listCampusMapCurrentPlaces({
        buildingId: ids.building,
        floorId: ids.floor,
        pinType: "water",
        limit: 10,
      }),
    ).resolves.toMatchObject({
      items: [{ id: ids.place, revisionId: ids.revision }],
      nextCursor: null,
    });

    await expect(
      listCampusMapCurrentPlaces({ pinType: "printer", limit: 10 }),
    ).resolves.toEqual({ items: [], nextCursor: null });

    await expect(
      listCampusMapCurrentPlaces({
        bounds: { west: 114.1, south: 22.3, east: 114.3, north: 22.5 },
        limit: 10,
      }),
    ).resolves.toMatchObject({
      items: [{ id: ids.place }],
      nextCursor: null,
    });
  });

  it("reads history using the revision's own schema and display metadata", async () => {
    const history = await getCampusMapPlaceHistory(ids.place);
    expect(history).toMatchObject({
      items: [
        {
          id: ids.revision,
          placeId: ids.place,
          status: "active",
          factSchemaVersion: 701,
          operation: "create",
          actor: { id: ids.actor, nickname: "测试贡献者" },
          fieldMetadata: { name: { label: "名称" } },
          fieldDiff: {
            name: {
              before: null,
              after: "大学图书馆饮水点",
              label: "名称",
            },
          },
          content: {
            visibility: "public",
            fact: { name: "大学图书馆饮水点", pinType: "water" },
          },
        },
      ],
      nextCursor: null,
    });
    expect(history.items[0]?.content).toEqual({
      visibility: "public",
      fact: {
        name: "大学图书馆饮水点",
        pinType: "water",
        capabilities: [],
        gender: "unknown",
        wheelchairAccess: "unknown",
        audience: "cuhk-member",
        credentialRequirement: "library-card",
        accessSchedule: { kind: "unknown" },
        reservationRequirement: "none",
        temporaryStatus: "normal",
        buildingId: ids.building,
        floorId: ids.floor,
        locationKind: "floor",
        pointPrecision: null,
        longitude: null,
        latitude: null,
        coordinateCrs: null,
        observedAt: new Date("2026-08-21T03:00:00Z"),
        verifiedAt: null,
        verifiedByActorIdSnapshot: null,
        provenance: [
          {
            kind: "field-observation",
            ref: "test:library-gf-water",
            url: null,
            version: null,
            accessedOn: "2026-08-22",
            observedAt: new Date("2026-08-21T03:00:00Z"),
            rightsStatus: "original-observation",
            limitations: "Test fixture only",
            sourceCoordinate: null,
          },
        ],
      },
    });
  });

  it("fails closed when a revision payload is redacted", async () => {
    await database
      .update(campusMapRevisionVisibility)
      .set({ visibility: "redacted", redactionRef: "moderation:test" })
      .where(eq(campusMapRevisionVisibility.revisionId, ids.revision));

    try {
      const history = await getCampusMapPlaceHistory(ids.place);
      expect(history.items[0]?.content).toEqual({ visibility: "redacted" });
      expect(history.items[0]?.fieldDiff).toBeNull();
      expect(history.items[0]).not.toHaveProperty("content.fact");
      await expect(getCampusMapChangeset(ids.changeset)).resolves.toMatchObject(
        {
          changes: [{ id: ids.placeChange, fieldDiff: null }],
        },
      );
    } finally {
      await database
        .update(campusMapRevisionVisibility)
        .set({ visibility: "public", redactionRef: null })
        .where(eq(campusMapRevisionVisibility.revisionId, ids.revision));
    }
  });

  it("returns a typed public Changeset without private idempotency data", async () => {
    const changeset = await getCampusMapChangeset(ids.changeset);

    expect(changeset).toMatchObject({
      id: ids.changeset,
      actor: { id: ids.actor, nickname: "测试贡献者" },
      comment: "添加已现场核对的饮水点",
      counts: { affected: 1, created: 1 },
      changes: [
        {
          id: ids.placeChange,
          placeId: ids.place,
          operation: "create",
        },
      ],
    });
    expect(changeset).not.toHaveProperty("idempotencyKey");
    expect(changeset).not.toHaveProperty("requestFingerprint");
  });

  it("pages the public Changeset feed with a typed cursor", async () => {
    const feed = await listCampusMapChangesets({ limit: 10 });

    expect(feed.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: ids.changeset,
          publishedAt: expect.any(Date),
        }),
      ]),
    );
    expect(feed.nextCursor).toBeNull();
  });
});
