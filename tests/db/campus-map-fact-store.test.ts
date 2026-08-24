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
  getCampusMapPlaceRevision,
  CampusMapReadInputError,
  listCampusMapChangesets,
  listCampusMapCurrentPlaces,
} from "@/lib/campus-map/fact-store";

function collectKeys(value: unknown, keys = new Set<string>()): Set<string> {
  if (Array.isArray(value)) {
    value.forEach((item) => collectKeys(item, keys));
  } else if (value && typeof value === "object") {
    Object.entries(value).forEach(([key, child]) => {
      keys.add(key);
      collectKeys(child, keys);
    });
  }
  return keys;
}

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
  feedActor: "00000000-0000-4000-8000-000000000709",
  feedOtherActor: "00000000-0000-4000-8000-000000000710",
  feedA: "00000000-0000-4000-8000-000000000711",
  feedB: "00000000-0000-4000-8000-000000000712",
  feedC: "00000000-0000-4000-8000-000000000713",
  feedChangeA: "00000000-0000-4000-8000-000000000714",
  feedChangeB: "00000000-0000-4000-8000-000000000715",
  feedChangeC: "00000000-0000-4000-8000-000000000716",
  feedRevisionA: "00000000-0000-4000-8000-000000000717",
  feedRevisionB: "00000000-0000-4000-8000-000000000718",
  feedRevisionC: "00000000-0000-4000-8000-000000000719",
  feedPlaceA: "00000000-0000-4000-8000-000000000720",
  feedPlaceB: "00000000-0000-4000-8000-000000000721",
  feedPlaceC: "00000000-0000-4000-8000-000000000722",
} as const;

describe.skipIf(!hasDb)("Campus Map fact-store read interface (#717)", () => {
  let pool: Pool;
  let database: ReturnType<typeof drizzle>;

  async function cleanupFixture() {
    const client = await pool.connect();
    await client.query("begin");
    try {
      // The ledger is append-only in production. Fixture cleanup is an
      // explicit superuser maintenance operation scoped to this transaction.
      await client.query("set local session_replication_role = replica");
      await client.query(
        `delete from campus_map_current_facts where place_id = $1`,
        [ids.place],
      );
      await client.query(
        `delete from campus_map_current_revisions where place_id = $1`,
        [ids.place],
      );
      await client.query(
        `delete from campus_map_revision_visibility where revision_id = $1`,
        [ids.revision],
      );
      await client.query(
        `delete from campus_map_revision_visibility where revision_id = any($1::uuid[])`,
        [[ids.feedRevisionA, ids.feedRevisionB, ids.feedRevisionC]],
      );
      await client.query(
        `delete from campus_map_revision_provenance where revision_id = $1`,
        [ids.revision],
      );
      await client.query(
        `delete from campus_map_fact_revisions where id = $1`,
        [ids.revision],
      );
      await client.query(
        `delete from campus_map_fact_revisions where id = any($1::uuid[])`,
        [[ids.feedRevisionA, ids.feedRevisionB, ids.feedRevisionC]],
      );
      await client.query(`delete from campus_map_place_changes where id = $1`, [
        ids.placeChange,
      ]);
      await client.query(
        `delete from campus_map_place_changes where id = any($1::uuid[])`,
        [[ids.feedChangeA, ids.feedChangeB, ids.feedChangeC]],
      );
      await client.query(`delete from campus_map_changesets where id = $1`, [
        ids.changeset,
      ]);
      await client.query(
        `delete from campus_map_changesets where id = any($1::uuid[])`,
        [[ids.feedA, ids.feedB, ids.feedC]],
      );
      await client.query(`delete from campus_map_places where id = $1`, [
        ids.place,
      ]);
      await client.query(
        `delete from campus_map_places where id = any($1::uuid[])`,
        [[ids.feedPlaceA, ids.feedPlaceB, ids.feedPlaceC]],
      );
      await client.query(`delete from campus_map_floors where id = $1`, [
        ids.floor,
      ]);
      await client.query(`delete from campus_map_buildings where id = $1`, [
        ids.building,
      ]);
      await client.query(
        `delete from campus_map_provenance_sources where id = $1`,
        [ids.provenance],
      );
      await client.query(
        `delete from campus_map_fact_schemas where version = 701`,
      );
      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }

  beforeAll(async () => {
    pool = new Pool({ connectionString: process.env.DATABASE_URL });
    database = drizzle(pool);
    await cleanupFixture();

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
    await database
      .insert(campusMapPlaces)
      .values([
        { id: ids.feedPlaceA },
        { id: ids.feedPlaceB },
        { id: ids.feedPlaceC },
      ]);
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
      publishedAt: new Date("2026-08-22T01:00:00Z"),
    });
    await database.insert(campusMapPlaceChanges).values({
      id: ids.placeChange,
      changesetId: ids.changeset,
      placeId: ids.place,
      operation: "create",
      fieldDiff: {
        name: { before: null, after: "大学图书馆饮水点", label: "名称" },
        location: {
          before: null,
          after: {
            kind: "floor",
            buildingId: ids.building,
            floorId: ids.floor,
          },
          label: "位置",
        },
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
    await database.insert(campusMapChangesets).values([
      {
        id: ids.feedA,
        actorIdSnapshot: ids.feedActor,
        actorNicknameSnapshot: "同一作者",
        comment: "范围内且请求检查",
        sourceSummary: "公开摘要 A",
        reviewRequested: true,
        clientName: "private-client-a",
        clientVersion: "fingerprint-a",
        affectedCount: 1,
        updatedCount: 1,
        bboxWest: 114.19,
        bboxSouth: 22.39,
        bboxEast: 114.21,
        bboxNorth: 22.41,
        publishedAt: new Date("2026-08-23T01:00:00Z"),
      },
      {
        id: ids.feedB,
        actorIdSnapshot: ids.feedActor,
        actorNicknameSnapshot: "同一作者",
        comment: "同时间戳的第二笔",
        sourceSummary: "公开摘要 B",
        clientName: "private-client-b",
        clientVersion: "fingerprint-b",
        affectedCount: 1,
        updatedCount: 1,
        bboxWest: 114.2,
        bboxSouth: 22.4,
        bboxEast: 114.22,
        bboxNorth: 22.42,
        publishedAt: new Date("2026-08-23T01:00:00Z"),
      },
      {
        id: ids.feedC,
        actorIdSnapshot: ids.feedOtherActor,
        actorNicknameSnapshot: "其他作者",
        comment: "范围外",
        sourceSummary: "公开摘要 C",
        clientName: "private-client-c",
        clientVersion: "fingerprint-c",
        affectedCount: 1,
        updatedCount: 1,
        bboxWest: 113,
        bboxSouth: 21,
        bboxEast: 113.1,
        bboxNorth: 21.1,
        publishedAt: new Date("2026-08-23T00:00:00Z"),
      },
    ]);
    await database.insert(campusMapPlaceChanges).values([
      {
        id: ids.feedChangeA,
        changesetId: ids.feedA,
        placeId: ids.feedPlaceA,
        operation: "update",
        fieldDiff: {},
      },
      {
        id: ids.feedChangeB,
        changesetId: ids.feedB,
        placeId: ids.feedPlaceB,
        operation: "update",
        fieldDiff: {},
      },
      {
        id: ids.feedChangeC,
        changesetId: ids.feedC,
        placeId: ids.feedPlaceC,
        operation: "update",
        fieldDiff: {},
      },
    ]);
    await database.insert(campusMapFactRevisions).values(
      [
        [ids.feedRevisionA, ids.feedChangeA, ids.feedA, ids.feedActor],
        [ids.feedRevisionB, ids.feedChangeB, ids.feedB, ids.feedActor],
        [ids.feedRevisionC, ids.feedChangeC, ids.feedC, ids.feedOtherActor],
      ].map(([id, placeChangeId, changesetId, actorIdSnapshot]) => ({
        id,
        placeId:
          changesetId === ids.feedA
            ? ids.feedPlaceA
            : changesetId === ids.feedB
              ? ids.feedPlaceB
              : ids.feedPlaceC,
        changesetId,
        placeChangeId,
        factSchemaVersion: 701,
        fieldMetadata: { name: { label: "名称" } },
        status: "active" as const,
        actorIdSnapshot,
        actorNicknameSnapshot: "Feed 测试贡献者",
        name: "Feed 测试地点",
        buildingId: ids.building,
        floorId: ids.floor,
        pinType: "water" as const,
        audience: "cuhk-member" as const,
        credentialRequirement: "library-card" as const,
        reservationRequirement: "none" as const,
        temporaryStatus: "normal" as const,
        locationKind: "floor" as const,
      })),
    );
    await database
      .insert(campusMapRevisionVisibility)
      .values([
        { revisionId: ids.feedRevisionA },
        { revisionId: ids.feedRevisionB },
        { revisionId: ids.feedRevisionC },
      ]);
  });

  afterAll(async () => {
    if (!pool) return;
    await cleanupFixture();
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
          accessedOn: "2026-08-22",
          observedAt: new Date("2026-08-21T03:00:00Z"),
          rightsStatus: "original-observation",
          hasLocationEvidence: false,
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
          changesetId: ids.changeset,
          comment: "添加已现场核对的饮水点",
          sourceSummary: "现场观察",
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
        provenance: [
          {
            kind: "field-observation",
            accessedOn: "2026-08-22",
            observedAt: new Date("2026-08-21T03:00:00Z"),
            rightsStatus: "original-observation",
            hasLocationEvidence: false,
          },
        ],
      },
    });
  });

  it("prevents referenced historical schema metadata from being rewritten", async () => {
    await expect(
      pool.query(
        `update campus_map_fact_schemas
         set definition = '{"fields":{},"pinTypes":{}}'::jsonb,
             display_metadata = '{"name":{"label":"后来改名"}}'::jsonb
         where version = 701`,
      ),
    ).rejects.toMatchObject({
      code: "23514",
      message: expect.stringContaining("schema metadata is immutable"),
    });

    await expect(
      getCampusMapPlaceRevision(ids.place, ids.revision),
    ).resolves.toMatchObject({
      schema: {
        version: 701,
        definition: CAMPUS_MAP_FACT_SCHEMA_V1,
        displayMetadata: { name: { label: "名称" } },
      },
    });
  });

  it("reads one stable revision through a public-safe projection", async () => {
    const revision = await getCampusMapPlaceRevision(ids.place, ids.revision);

    expect(revision).toMatchObject({
      id: ids.revision,
      placeId: ids.place,
      changesetId: ids.changeset,
      comment: "添加已现场核对的饮水点",
      sourceSummary: "现场观察",
      schema: {
        version: 701,
        displayMetadata: { name: { label: "名称" } },
      },
      content: {
        visibility: "public",
        fact: {
          name: "大学图书馆饮水点",
          provenance: [
            {
              kind: "field-observation",
              accessedOn: "2026-08-22",
              rightsStatus: "original-observation",
              hasLocationEvidence: false,
            },
          ],
        },
      },
    });

    const keys = collectKeys(revision);
    [
      "actorUserId",
      "client",
      "conversion",
      "credential",
      "idempotencyKey",
      "limitations",
      "note",
      "provenanceId",
      "redactionRef",
      "ref",
      "requestFingerprint",
      "sourceCoordinate",
      "updatedBy",
      "url",
      "verifiedByActorIdSnapshot",
    ].forEach((key) => expect(keys).not.toContain(key));
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
          changes: [
            {
              visibility: "redacted",
              revisionId: ids.revision,
            },
          ],
        },
      );
      expect((await getCampusMapChangeset(ids.changeset))?.changes[0]).toEqual({
        visibility: "redacted",
        placeId: ids.place,
        revisionId: ids.revision,
      });
      expect(
        (await getCampusMapChangeset(ids.changeset))?.changes[0],
      ).not.toHaveProperty("id");
      expect(
        (await getCampusMapChangeset(ids.changeset))?.changes[0],
      ).not.toHaveProperty("diff");
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
          visibility: "public",
          placeId: ids.place,
          revisionId: ids.revision,
          operation: "create",
          schema: {
            version: 701,
            displayMetadata: { name: { label: "名称" } },
          },
          diff: {
            fields: {
              name: {
                before: null,
                after: "大学图书馆饮水点",
                label: "名称",
              },
            },
            position: {
              before: null,
              after: {
                kind: "floor",
                buildingId: ids.building,
                floorId: ids.floor,
              },
              label: "位置",
            },
            provenance: {
              before: [],
              after: [
                {
                  kind: "field-observation",
                  accessedOn: "2026-08-22",
                  observedAt: new Date("2026-08-21T03:00:00Z"),
                  rightsStatus: "original-observation",
                  hasLocationEvidence: false,
                },
              ],
            },
          },
        },
      ],
    });
    expect(changeset).not.toHaveProperty("idempotencyKey");
    expect(changeset).not.toHaveProperty("requestFingerprint");
    expect(changeset?.changes[0]).not.toHaveProperty("id");
    expect(Object.keys(changeset?.changes[0] ?? {}).sort()).toEqual(
      [
        "diff",
        "mergedIntoPlaceId",
        "operation",
        "placeId",
        "previousRevisionId",
        "revisionId",
        "schema",
        "status",
        "visibility",
      ].sort(),
    );
    const keys = collectKeys(changeset);
    [
      "actorUserId",
      "clientName",
      "clientVersion",
      "warningSummary",
      "redactionRef",
      "sourceRef",
      "sourceUrl",
    ].forEach((key) => expect(keys).not.toContain(key));
  });

  it("pages four explicit summary scopes with one opaque stable cursor", async () => {
    const first = await listCampusMapChangesets({
      scope: { kind: "recent" },
      limit: 1,
    });
    expect(first.items).toEqual([
      expect.objectContaining({ id: ids.feedB, publishedAt: expect.any(Date) }),
    ]);
    expect(typeof first.nextCursor).toBe("string");
    expect(first.nextCursor).not.toContain(ids.feedB);
    expect(first.items[0]).not.toHaveProperty("changes");
    expect(first.items[0]).not.toHaveProperty("client");
    expect(first.items[0]).not.toHaveProperty("warnings");

    const second = await listCampusMapChangesets({
      scope: { kind: "recent" },
      cursor: first.nextCursor!,
      limit: 1,
    });
    expect(second.items.map((item) => item.id)).toEqual([ids.feedA]);

    const actor = await listCampusMapChangesets({
      scope: { kind: "actor", actorId: ids.feedActor },
      limit: 10,
    });
    expect(actor.items.map((item) => item.id)).toEqual([ids.feedB, ids.feedA]);

    const bbox = await listCampusMapChangesets({
      scope: {
        kind: "bbox",
        bounds: { west: 114.18, south: 22.38, east: 114.23, north: 22.43 },
      },
      limit: 10,
    });
    expect(bbox.items.map((item) => item.id)).toEqual(
      expect.arrayContaining([ids.feedB, ids.feedA]),
    );
    expect(bbox.items.map((item) => item.id)).not.toContain(ids.feedC);

    const reviewRequested = await listCampusMapChangesets({
      scope: { kind: "reviewRequested" },
      limit: 10,
    });
    expect(reviewRequested.items.map((item) => item.id)).toEqual([ids.feedA]);
  });

  it("fails bbox projection closed when visibility evidence is missing", async () => {
    const client = await pool.connect();
    try {
      await client.query("begin");
      await client.query("set local session_replication_role = replica");
      await client.query(
        "delete from campus_map_revision_visibility where revision_id = $1",
        [ids.feedRevisionA],
      );
      await client.query("commit");

      const recent = await listCampusMapChangesets({
        scope: { kind: "recent" },
        limit: 10,
      });
      expect(recent.items.find((item) => item.id === ids.feedA)).toMatchObject({
        bbox: null,
      });
      const bbox = await listCampusMapChangesets({
        scope: {
          kind: "bbox",
          bounds: { west: 114.18, south: 22.38, east: 114.23, north: 22.43 },
        },
        limit: 10,
      });
      expect(bbox.items.map((item) => item.id)).not.toContain(ids.feedA);
    } finally {
      client.release();
      await database
        .insert(campusMapRevisionVisibility)
        .values({ revisionId: ids.feedRevisionA })
        .onConflictDoNothing();
    }
  });

  it("fails malformed public IDs and bounds without exposing PostgreSQL errors", async () => {
    await expect(getCampusMapPlaceHistory("not-a-place")).resolves.toEqual({
      placeExists: false,
      head: null,
      items: [],
      nextCursor: null,
    });
    await expect(
      getCampusMapPlaceRevision("not-a-place", "not-a-revision"),
    ).resolves.toBeNull();
    await expect(getCampusMapChangeset("not-a-changeset")).resolves.toBeNull();
    await expect(
      getCampusMapPlaceHistory(ids.place, { cursor: "not-a-cursor" }),
    ).rejects.toBeInstanceOf(CampusMapReadInputError);
    await expect(
      listCampusMapChangesets({
        scope: { kind: "actor", actorId: "private@example.com" },
      }),
    ).rejects.toBeInstanceOf(CampusMapReadInputError);
    await expect(
      listCampusMapChangesets({
        scope: {
          kind: "bbox",
          bounds: { west: Number.NaN, south: 22, east: 114, north: 23 },
        },
      }),
    ).rejects.toBeInstanceOf(CampusMapReadInputError);
    await expect(
      listCampusMapChangesets({
        scope: {
          kind: "bbox",
          bounds: {
            west: 113,
            south: 22,
            east: Number.POSITIVE_INFINITY,
            north: 23,
          },
        },
      }),
    ).rejects.toBeInstanceOf(CampusMapReadInputError);
    await expect(
      listCampusMapChangesets({
        scope: {
          kind: "bbox",
          bounds: { west: -181, south: 22, east: 114, north: 23 },
        },
      }),
    ).rejects.toBeInstanceOf(CampusMapReadInputError);
  });
});
