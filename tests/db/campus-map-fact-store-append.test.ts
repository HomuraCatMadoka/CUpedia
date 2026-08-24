import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { CAMPUS_MAP_FACT_SCHEMA_V1 } from "@/db/schema";
import {
  getCampusMapChangeset,
  getCampusMapCurrentPlace,
  getCampusMapFactSchema,
  getCampusMapPlaceHistory,
} from "@/lib/campus-map/fact-store";
import {
  CampusMapMergedPlaceError,
  CampusMapPublishConflictError,
  type CampusMapAppendChangesetCommand,
  type CampusMapAppendFact,
} from "@/lib/campus-map/fact-store-transaction";
import { appendCampusMapChangesetForStorageTest } from "../helpers/campus-map-fact-store";

const appendCampusMapChangeset = appendCampusMapChangesetForStorageTest;

const hasDb = Boolean(process.env.DATABASE_URL);

const ids = {
  actor: "00000000-0000-4000-8000-000000000761",
  building: "00000000-0000-4000-8000-000000000762",
  place: "00000000-0000-4000-8000-000000000763",
  changeset: "00000000-0000-4000-8000-000000000764",
  change: "00000000-0000-4000-8000-000000000765",
  revision: "00000000-0000-4000-8000-000000000766",
  provenance: "00000000-0000-4000-8000-000000000767",
  candidateAChangeset: "00000000-0000-4000-8000-000000000768",
  candidateAChange: "00000000-0000-4000-8000-000000000769",
  candidateARevision: "00000000-0000-4000-8000-000000000770",
  candidateBChangeset: "00000000-0000-4000-8000-000000000771",
  candidateBChange: "00000000-0000-4000-8000-000000000772",
  candidateBRevision: "00000000-0000-4000-8000-000000000773",
  targetPlace: "00000000-0000-4000-8000-000000000774",
  targetChangeset: "00000000-0000-4000-8000-000000000775",
  targetChange: "00000000-0000-4000-8000-000000000776",
  targetRevision: "00000000-0000-4000-8000-000000000777",
  mergeChangeset: "00000000-0000-4000-8000-000000000778",
  mergeChange: "00000000-0000-4000-8000-000000000779",
  mergeRevision: "00000000-0000-4000-8000-000000000780",
  reviveChangeset: "00000000-0000-4000-8000-000000000781",
  reviveChange: "00000000-0000-4000-8000-000000000782",
  reviveRevision: "00000000-0000-4000-8000-000000000783",
} as const;

const baseFact: CampusMapAppendFact = {
  name: "大学图书馆饮水点",
  buildingId: ids.building,
  floorId: null,
  pinType: "water",
  capabilities: [],
  gender: "unknown",
  wheelchairAccess: "unknown",
  audience: "cuhk-member",
  credentialRequirement: "library-card",
  accessSchedule: { kind: "unknown" },
  reservationRequirement: "none",
  temporaryStatus: "normal",
  locationKind: "building",
  pointPrecision: null,
  longitude: null,
  latitude: null,
  coordinateCrs: null,
  observedAt: new Date("2026-08-21T03:00:00Z"),
  verifiedAt: null,
  verifiedByActorIdSnapshot: null,
};

function onePlaceCommand(input: {
  changesetId: string;
  changeId: string;
  revisionId: string;
  placeId?: string;
  baseRevisionId: string | null;
  operation: "create" | "update" | "retire" | "restore" | "merge";
  status: "active" | "retired" | "merged";
  name?: string;
  mergedIntoPlaceId?: string | null;
  factSchemaVersion?: number;
}): CampusMapAppendChangesetCommand {
  const name = input.name ?? baseFact.name;
  return {
    id: input.changesetId,
    actor: { userId: null, id: ids.actor, nickname: "事实贡献者" },
    comment: `${input.operation}: ${name}`,
    sourceSummary: "现场观察",
    reviewRequested: false,
    client: { name: "test", version: "1" },
    warningSummary: [],
    revertsChangesetId: null,
    publishedAt: new Date("2026-08-22T02:00:00Z"),
    changes: [
      {
        id: input.changeId,
        placeId: input.placeId ?? ids.place,
        revisionId: input.revisionId,
        baseRevisionId: input.baseRevisionId,
        operation: input.operation,
        factSchemaVersion: input.factSchemaVersion ?? 719,
        fieldMetadata: { name: { label: "名称" } },
        fieldDiff: {
          name: { before: baseFact.name, after: name, label: "名称" },
        },
        status: input.status,
        mergedIntoPlaceId: input.mergedIntoPlaceId ?? null,
        fact: { ...baseFact, name },
        provenanceIds: [ids.provenance],
        visibility: { visibility: "public" },
      },
    ],
  };
}

const initialCommand = () =>
  onePlaceCommand({
    changesetId: ids.changeset,
    changeId: ids.change,
    revisionId: ids.revision,
    baseRevisionId: null,
    operation: "create",
    status: "active",
  });

describe.skipIf(!hasDb)("Campus Map fact-store append seam (#717)", () => {
  let pool: Pool;

  async function cleanupFacts() {
    const client = await pool.connect();
    await client.query("begin");
    try {
      // Test fixtures exercise an append-only production ledger. Cleanup is a
      // superuser-only maintenance operation scoped to this transaction.
      await client.query("set local session_replication_role = replica");
      await client.query(
        `delete from campus_map_current_facts
       where place_id = any($1::uuid[])`,
        [[ids.place, ids.targetPlace]],
      );
      await client.query(
        `delete from campus_map_current_revisions
       where place_id = any($1::uuid[])`,
        [[ids.place, ids.targetPlace]],
      );
      await client.query(
        `delete from campus_map_revision_visibility where revision_id in
         (select id from campus_map_fact_revisions where actor_id_snapshot = $1)`,
        [ids.actor],
      );
      await client.query(
        `delete from campus_map_revision_provenance where revision_id in
         (select id from campus_map_fact_revisions where actor_id_snapshot = $1)`,
        [ids.actor],
      );
      await client.query(
        `delete from campus_map_fact_revisions where actor_id_snapshot = $1`,
        [ids.actor],
      );
      await client.query(
        `delete from campus_map_place_changes where changeset_id in
         (select id from campus_map_changesets where actor_id_snapshot = $1)`,
        [ids.actor],
      );
      await client.query(
        `delete from campus_map_changesets where actor_id_snapshot = $1`,
        [ids.actor],
      );
      await client.query(
        `delete from campus_map_places where id = any($1::uuid[])`,
        [[ids.place, ids.targetPlace]],
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
    await cleanupFacts();
    await pool.query(`delete from campus_map_fact_schemas where version = 719`);
    await pool.query(`delete from campus_map_buildings where id = $1`, [
      ids.building,
    ]);
    await pool.query(
      `delete from campus_map_provenance_sources where id = $1`,
      [ids.provenance],
    );
    await pool.query(
      `insert into campus_map_fact_schemas
         (version, status, definition, display_metadata)
       values (719, 'draft', $1::jsonb, '{"name":{"label":"名称"}}')`,
      [JSON.stringify(CAMPUS_MAP_FACT_SCHEMA_V1)],
    );
    await pool.query(
      `insert into campus_map_buildings
         (id, name, anchor_longitude, anchor_latitude, anchor_crs)
       values ($1, '大学图书馆', 114.2, 22.4, 'wgs84')`,
      [ids.building],
    );
    await pool.query(
      `insert into campus_map_provenance_sources
         (id, source_kind, source_ref, accessed_on, rights_status)
       values ($1, 'field-observation', 'test:append', '2026-08-22',
         'original-observation')`,
      [ids.provenance],
    );
  });

  beforeEach(cleanupFacts);

  afterAll(async () => {
    if (!pool) return;
    await cleanupFacts();
    await pool.query(`delete from campus_map_buildings where id = $1`, [
      ids.building,
    ]);
    await pool.query(
      `delete from campus_map_provenance_sources where id = $1`,
      [ids.provenance],
    );
    await pool.query(`delete from campus_map_fact_schemas where version = 719`);
    await pool.query(`delete from campus_map_fact_schemas where version = 1`);
    await pool.end();
  });

  it("atomically appends a create Changeset and exposes its active projection", async () => {
    await expect(appendCampusMapChangeset(initialCommand())).resolves.toEqual({
      changesetId: ids.changeset,
    });

    await expect(getCampusMapCurrentPlace(ids.place)).resolves.toMatchObject({
      id: ids.place,
      revisionId: ids.revision,
      name: baseFact.name,
    });
    await expect(getCampusMapPlaceHistory(ids.place)).resolves.toMatchObject({
      items: [{ id: ids.revision, changesetId: ids.changeset }],
    });
    await expect(getCampusMapChangeset(ids.changeset)).resolves.toMatchObject({
      counts: { affected: 1, created: 1 },
      bbox: { west: 114.2, south: 22.4, east: 114.2, north: 22.4 },
    });
  });

  it("persists the canonical schema on first publication", async () => {
    await appendCampusMapChangeset(
      onePlaceCommand({
        changesetId: ids.changeset,
        changeId: ids.change,
        revisionId: ids.revision,
        baseRevisionId: null,
        operation: "create",
        status: "active",
        factSchemaVersion: 1,
      }),
    );

    await expect(getCampusMapFactSchema()).resolves.toMatchObject({
      version: 1,
      definition: CAMPUS_MAP_FACT_SCHEMA_V1,
    });
    await expect(getCampusMapCurrentPlace(ids.place)).resolves.toMatchObject({
      factSchemaVersion: 1,
    });

    await pool.query(
      `update campus_map_fact_schemas set status = 'superseded' where version = 1`,
    );
    try {
      await expect(getCampusMapFactSchema()).resolves.toBeNull();
    } finally {
      await pool.query(
        `update campus_map_fact_schemas set status = 'active' where version = 1`,
      );
    }
  });

  it("allows only one concurrent append from the same base revision", async () => {
    await appendCampusMapChangeset(initialCommand());
    const candidates = [
      onePlaceCommand({
        changesetId: ids.candidateAChangeset,
        changeId: ids.candidateAChange,
        revisionId: ids.candidateARevision,
        baseRevisionId: ids.revision,
        operation: "update",
        status: "active",
        name: "候选 A",
      }),
      onePlaceCommand({
        changesetId: ids.candidateBChangeset,
        changeId: ids.candidateBChange,
        revisionId: ids.candidateBRevision,
        baseRevisionId: ids.revision,
        operation: "update",
        status: "active",
        name: "候选 B",
      }),
    ];

    const results = await Promise.allSettled(
      candidates.map(appendCampusMapChangeset),
    );
    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    expect(
      results.find((result) => result.status === "rejected"),
    ).toMatchObject({
      status: "rejected",
      reason: expect.any(CampusMapPublishConflictError),
    });

    const current = await getCampusMapCurrentPlace(ids.place);
    expect([
      [ids.candidateARevision, "候选 A"],
      [ids.candidateBRevision, "候选 B"],
    ]).toContainEqual([current?.revisionId, current?.name]);
    expect((await getCampusMapPlaceHistory(ids.place)).items).toHaveLength(2);
    const loser =
      current?.revisionId === ids.candidateARevision
        ? ids.candidateBChangeset
        : ids.candidateAChangeset;
    await expect(getCampusMapChangeset(loser)).resolves.toBeNull();
  });

  it("keeps a merged Place as a permanent redirect", async () => {
    await appendCampusMapChangeset(initialCommand());
    await appendCampusMapChangeset(
      onePlaceCommand({
        changesetId: ids.targetChangeset,
        changeId: ids.targetChange,
        revisionId: ids.targetRevision,
        placeId: ids.targetPlace,
        baseRevisionId: null,
        operation: "create",
        status: "active",
        name: "保留地点",
      }),
    );
    await appendCampusMapChangeset(
      onePlaceCommand({
        changesetId: ids.mergeChangeset,
        changeId: ids.mergeChange,
        revisionId: ids.mergeRevision,
        baseRevisionId: ids.revision,
        operation: "merge",
        status: "merged",
        mergedIntoPlaceId: ids.targetPlace,
      }),
    );

    await expect(
      appendCampusMapChangeset(
        onePlaceCommand({
          changesetId: ids.reviveChangeset,
          changeId: ids.reviveChange,
          revisionId: ids.reviveRevision,
          baseRevisionId: ids.mergeRevision,
          operation: "restore",
          status: "active",
        }),
      ),
    ).rejects.toBeInstanceOf(CampusMapMergedPlaceError);
    await expect(getCampusMapCurrentPlace(ids.place)).resolves.toBeNull();
    expect(
      (await getCampusMapPlaceHistory(ids.place)).items.map(
        (item) => item.status,
      ),
    ).toEqual(["merged", "active"]);
    await expect(
      getCampusMapChangeset(ids.reviveChangeset),
    ).resolves.toBeNull();
  });

  it("rejects merging into a survivor that is not active", async () => {
    await appendCampusMapChangeset(initialCommand());
    await appendCampusMapChangeset(
      onePlaceCommand({
        changesetId: ids.targetChangeset,
        changeId: ids.targetChange,
        revisionId: ids.targetRevision,
        placeId: ids.targetPlace,
        baseRevisionId: null,
        operation: "create",
        status: "active",
        name: "已停用地点",
      }),
    );
    await appendCampusMapChangeset(
      onePlaceCommand({
        changesetId: ids.candidateAChangeset,
        changeId: ids.candidateAChange,
        revisionId: ids.candidateARevision,
        placeId: ids.targetPlace,
        baseRevisionId: ids.targetRevision,
        operation: "retire",
        status: "retired",
        name: "已停用地点",
      }),
    );

    await expect(
      appendCampusMapChangeset(
        onePlaceCommand({
          changesetId: ids.mergeChangeset,
          changeId: ids.mergeChange,
          revisionId: ids.mergeRevision,
          baseRevisionId: ids.revision,
          operation: "merge",
          status: "merged",
          mergedIntoPlaceId: ids.targetPlace,
        }),
      ),
    ).rejects.toThrow("Campus Map merge survivor must remain active");
    await expect(getCampusMapCurrentPlace(ids.place)).resolves.toMatchObject({
      revisionId: ids.revision,
    });
    await expect(getCampusMapChangeset(ids.mergeChangeset)).resolves.toBeNull();
  });

  it("rejects retiring an already-retired Place without appending a Changeset", async () => {
    await appendCampusMapChangeset(initialCommand());
    await appendCampusMapChangeset(
      onePlaceCommand({
        changesetId: ids.candidateAChangeset,
        changeId: ids.candidateAChange,
        revisionId: ids.candidateARevision,
        baseRevisionId: ids.revision,
        operation: "retire",
        status: "retired",
      }),
    );

    await expect(
      appendCampusMapChangeset(
        onePlaceCommand({
          changesetId: ids.candidateBChangeset,
          changeId: ids.candidateBChange,
          revisionId: ids.candidateBRevision,
          baseRevisionId: ids.candidateARevision,
          operation: "retire",
          status: "retired",
        }),
      ),
    ).rejects.toThrow("Campus Map operation and revision status do not match");
    await expect(getCampusMapCurrentPlace(ids.place)).resolves.toBeNull();
    expect(
      (await getCampusMapPlaceHistory(ids.place)).items.map((item) => item.id),
    ).toEqual([ids.candidateARevision, ids.revision]);
    await expect(
      getCampusMapChangeset(ids.candidateBChangeset),
    ).resolves.toBeNull();
  });

  it("restores a retired Place with a new active revision", async () => {
    await appendCampusMapChangeset(initialCommand());
    await appendCampusMapChangeset(
      onePlaceCommand({
        changesetId: ids.candidateAChangeset,
        changeId: ids.candidateAChange,
        revisionId: ids.candidateARevision,
        baseRevisionId: ids.revision,
        operation: "retire",
        status: "retired",
      }),
    );
    await expect(getCampusMapCurrentPlace(ids.place)).resolves.toBeNull();

    await appendCampusMapChangeset(
      onePlaceCommand({
        changesetId: ids.candidateBChangeset,
        changeId: ids.candidateBChange,
        revisionId: ids.candidateBRevision,
        baseRevisionId: ids.candidateARevision,
        operation: "restore",
        status: "active",
        name: "恢复后的饮水点",
      }),
    );

    await expect(getCampusMapCurrentPlace(ids.place)).resolves.toMatchObject({
      revisionId: ids.candidateBRevision,
      name: "恢复后的饮水点",
    });
    expect(
      (await getCampusMapPlaceHistory(ids.place)).items.map((item) => [
        item.id,
        item.status,
      ]),
    ).toEqual([
      [ids.candidateBRevision, "active"],
      [ids.candidateARevision, "retired"],
      [ids.revision, "active"],
    ]);
  });
});
