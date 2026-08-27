import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import {
  governCampusMapFacts,
  type CampusMapFactGovernanceCommand,
  type CampusMapMergeFieldResolution,
} from "@/lib/campus-map/fact-governance";
import {
  getCampusMapChangeset,
  getCampusMapCurrentPlace,
  getCampusMapPlaceHistory,
  getCampusMapPlaceRevision,
} from "@/lib/campus-map/fact-store";
import {
  publishCampusMapChangeset,
  type CampusMapPublishCommand,
  type CampusMapPublishFactInput,
  type CampusMapPublishSourceInput,
} from "@/lib/campus-map/publish";

const hasDb = Boolean(process.env.DATABASE_URL);
const buildingId = "72000000-0000-4000-8000-000000000001";

function source(): CampusMapPublishSourceInput {
  return {
    kind: "field-observation",
    ref: `test:campus-map-governance:${randomUUID()}`,
    url: null,
    owner: "CUpedia governance test",
    version: null,
    snapshotHash: null,
    accessedOn: "2026-08-27",
    observedAt: "2026-08-27T00:00:00.000Z",
    rightsStatus: "original-observation",
    limitations: null,
    note: null,
    sourceCoordinate: null,
  };
}

function fact(name: string): CampusMapPublishFactInput {
  return {
    name,
    buildingId,
    floorId: null,
    pinType: "water",
    capabilities: [],
    gender: "unknown",
    wheelchairAccess: "unknown",
    audience: "cuhk-member",
    credentialRequirement: "none",
    accessSchedule: { kind: "unknown" },
    reservationRequirement: "none",
    temporaryStatus: "normal",
    location: { kind: "building" },
    observedAt: "2026-08-27T00:00:00.000Z",
  };
}

function createCommand(name: string): CampusMapPublishCommand {
  return {
    kind: "single",
    idempotencyKey: randomUUID(),
    comment: `Create ${name}`,
    sourceSummary: "现场核对",
    reviewRequested: false,
    client: { name: "governance-test", version: "1" },
    warningAcknowledgements: [],
    changes: [{ operation: "create", fact: fact(name), sources: [source()] }],
  };
}

const fieldResolutions: CampusMapMergeFieldResolution[] = [
  "name",
  "buildingId",
  "floorId",
  "pinType",
  "capabilities",
  "gender",
  "wheelchairAccess",
  "audience",
  "credentialRequirement",
  "accessSchedule",
  "reservationRequirement",
  "temporaryStatus",
  "location",
  "observedAt",
].map((field) => ({
  field: field as CampusMapMergeFieldResolution["field"],
  valueFrom: field === "name" ? "custom" : "survivor",
}));

describe.skipIf(!hasDb)("Campus Map fact governance", () => {
  let pool: Pool;
  const actorIds: string[] = [];

  beforeAll(async () => {
    pool = new Pool({ connectionString: process.env.DATABASE_URL });
    await pool.query(
      `insert into campus_map_buildings (id, name, code)
       values ($1, 'Issue 720 test building', 'I720')
       on conflict (id) do nothing`,
      [buildingId],
    );
  });

  async function createActor(role: "user" | "admin" = "admin") {
    const actorId = randomUUID();
    actorIds.push(actorId);
    await pool.query(
      `insert into users (id, email, email_verified, nickname, role, banned)
       values ($1, $2, true, '治理测试员', $3, false)`,
      [actorId, `issue-720-${actorId}@cuhk.edu.hk`, role],
    );
    await pool.query(
      `insert into accounts (id, account_id, provider_id, user_id, password)
       values ($1, $2, 'credential', $3, 'test-credential')`,
      [randomUUID(), actorId, actorId],
    );
    return actorId;
  }

  async function createPlace(actorId: string, name: string) {
    const result = await publishCampusMapChangeset(createCommand(name), {
      actorId,
      clientIp: "203.0.113.120",
    });
    if (result.status !== "published") {
      throw new Error(`create failed: ${JSON.stringify(result)}`);
    }
    return result.changes[0];
  }

  function revertCommand(input: {
    placeId: string;
    baseRevisionId: string;
    targetRevisionId: string;
  }): Extract<CampusMapFactGovernanceCommand, { kind: "revert" }> {
    return {
      kind: "revert",
      idempotencyKey: randomUUID(),
      reason: "恢复到已核对的旧版本",
      client: { name: "governance-test", version: "1" },
      ...input,
      sources: [source()],
    };
  }

  function mergeCommand(input: {
    survivor: { placeId: string; revisionId: string; name: string };
    loser: { placeId: string; revisionId: string };
  }): Extract<CampusMapFactGovernanceCommand, { kind: "merge" }> {
    return {
      kind: "merge",
      idempotencyKey: randomUUID(),
      reason: "人工核对后确认两个稳定 ID 是同一地点",
      client: { name: "governance-test", version: "1" },
      survivor: {
        placeId: input.survivor.placeId,
        baseRevisionId: input.survivor.revisionId,
        fact: fact(input.survivor.name),
        sources: [source()],
      },
      loser: {
        placeId: input.loser.placeId,
        baseRevisionId: input.loser.revisionId,
        sources: [source()],
      },
      fieldResolutions,
    };
  }

  async function cleanup() {
    if (actorIds.length === 0) return;
    const client = await pool.connect();
    await client.query("begin");
    try {
      await client.query("set local session_replication_role = replica");
      const places = await client.query<{ place_id: string }>(
        `select distinct pc.place_id
           from campus_map_place_changes pc
           join campus_map_changesets cs on cs.id = pc.changeset_id
          where cs.actor_id_snapshot = any($1::uuid[])`,
        [actorIds],
      );
      const placeIds = places.rows.map((row) => row.place_id);
      if (placeIds.length > 0) {
        await client.query(
          "delete from campus_map_current_facts where place_id = any($1::uuid[])",
          [placeIds],
        );
        await client.query(
          "delete from campus_map_current_revisions where place_id = any($1::uuid[])",
          [placeIds],
        );
      }
      await client.query(
        `delete from campus_map_revision_visibility where revision_id in
          (select id from campus_map_fact_revisions where actor_id_snapshot = any($1::uuid[]))`,
        [actorIds],
      );
      await client.query(
        `delete from campus_map_revision_provenance where revision_id in
          (select id from campus_map_fact_revisions where actor_id_snapshot = any($1::uuid[]))`,
        [actorIds],
      );
      await client.query(
        "delete from campus_map_fact_revisions where actor_id_snapshot = any($1::uuid[])",
        [actorIds],
      );
      await client.query(
        `delete from campus_map_place_changes where changeset_id in
          (select id from campus_map_changesets where actor_id_snapshot = any($1::uuid[]))`,
        [actorIds],
      );
      await client.query(
        "delete from campus_map_publish_requests where actor_id_snapshot = any($1::uuid[])",
        [actorIds],
      );
      await client.query("delete from campus_map_publish_rate_limits");
      await client.query(
        "delete from campus_map_changesets where actor_id_snapshot = any($1::uuid[])",
        [actorIds],
      );
      if (placeIds.length > 0) {
        await client.query(
          "delete from campus_map_places where id = any($1::uuid[])",
          [placeIds],
        );
      }
      await client.query(
        "delete from campus_map_provenance_sources where source_ref like 'test:campus-map-governance:%'",
      );
      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
      actorIds.length = 0;
    }
  }

  afterEach(cleanup);

  afterAll(async () => {
    await cleanup();
    await pool.query("delete from campus_map_buildings where id = $1", [
      buildingId,
    ]);
    await pool.end();
  });

  it("requires fresh admin authority for revert, merge, and bulk edit", async () => {
    const adminId = await createActor();
    const userId = await createActor("user");
    const survivor = await createPlace(
      adminId,
      `权限 survivor ${randomUUID()}`,
    );
    const loser = await createPlace(adminId, `权限 loser ${randomUUID()}`);

    const commands: CampusMapFactGovernanceCommand[] = [
      revertCommand({
        placeId: survivor.placeId,
        baseRevisionId: survivor.revisionId,
        targetRevisionId: survivor.revisionId,
      }),
      mergeCommand({
        survivor: { ...survivor, name: "权限 survivor" },
        loser,
      }),
      {
        kind: "bulk-edit",
        idempotencyKey: randomUUID(),
        reason: "越权批量编辑",
        sourceSummary: "现场核对",
        client: { name: "governance-test", version: "1" },
        warningAcknowledgements: [],
        changes: [
          {
            operation: "update",
            placeId: survivor.placeId,
            baseRevisionId: survivor.revisionId,
            fact: fact("越权 A"),
            sources: [source()],
          },
          {
            operation: "update",
            placeId: loser.placeId,
            baseRevisionId: loser.revisionId,
            fact: fact("越权 B"),
            sources: [source()],
          },
        ],
      },
    ];

    for (const command of commands) {
      await expect(
        governCampusMapFacts(command, {
          actorId: userId,
          clientIp: "203.0.113.121",
        }),
      ).resolves.toEqual({ status: "forbidden", code: "admin-required" });
    }

    await pool.query("update users set banned = true where id = $1", [adminId]);
    const freshRevert = revertCommand({
      placeId: survivor.placeId,
      baseRevisionId: survivor.revisionId,
      targetRevisionId: survivor.revisionId,
    });
    await expect(
      governCampusMapFacts(freshRevert, {
        actorId: adminId,
        clientIp: "203.0.113.121",
      }),
    ).resolves.toEqual({ status: "forbidden", code: "actor-banned" });
  });

  it("revalidates an immutable old value and appends an audited revert revision", async () => {
    const adminId = await createActor();
    const created = await createPlace(adminId, "revert old value");
    const updatedCommand = createCommand("unused");
    updatedCommand.changes = [
      {
        operation: "update",
        placeId: created.placeId,
        baseRevisionId: created.revisionId,
        fact: fact("revert current value"),
        sources: [source()],
      },
    ];
    const updated = await publishCampusMapChangeset(updatedCommand, {
      actorId: adminId,
      clientIp: "203.0.113.122",
    });
    if (updated.status !== "published") throw new Error("update failed");
    const command = revertCommand({
      placeId: created.placeId,
      baseRevisionId: updated.changes[0].revisionId,
      targetRevisionId: created.revisionId,
    });

    const reverted = await governCampusMapFacts(command, {
      actorId: adminId,
      clientIp: "203.0.113.122",
    });
    expect(reverted).toMatchObject({ status: "published" });
    if (reverted.status !== "published") throw new Error("revert failed");
    await expect(
      getCampusMapCurrentPlace(created.placeId),
    ).resolves.toMatchObject({
      name: "revert old value",
      revisionId: reverted.changes[0].revisionId,
    });
    await expect(
      getCampusMapChangeset(reverted.changesetId),
    ).resolves.toMatchObject({
      actor: { id: adminId, nickname: "治理测试员" },
      comment: command.reason,
      revertsChangesetId:
        updatedCommand.changes[0].operation === "update"
          ? (await getCampusMapPlaceRevision(
              created.placeId,
              created.revisionId,
            ))!.changesetId
          : null,
      counts: { affected: 1, updated: 1 },
    });
    await expect(
      getCampusMapPlaceHistory(created.placeId),
    ).resolves.toMatchObject({
      items: [
        {
          id: reverted.changes[0].revisionId,
          previousRevisionId: updated.changes[0].revisionId,
        },
        {
          id: updated.changes[0].revisionId,
          previousRevisionId: created.revisionId,
        },
        { id: created.revisionId, previousRevisionId: null },
      ],
    });

    const uppercaseReplay = {
      ...command,
      placeId: command.placeId.toUpperCase(),
      baseRevisionId: command.baseRevisionId.toUpperCase(),
      targetRevisionId: command.targetRevisionId.toUpperCase(),
    };
    await expect(
      governCampusMapFacts(uppercaseReplay, {
        actorId: adminId,
        clientIp: "203.0.113.122",
      }),
    ).resolves.toEqual(reverted);

    await pool.query(
      "update campus_map_revision_visibility set visibility = 'redacted', redaction_ref = 'test:#720-replay' where revision_id = $1",
      [created.revisionId],
    );
    await expect(
      governCampusMapFacts(command, {
        actorId: adminId,
        clientIp: "203.0.113.122",
      }),
    ).resolves.toEqual(reverted);

    await expect(
      governCampusMapFacts(
        { ...command, reason: "同一 key 不得代表另一条治理命令" },
        { actorId: adminId, clientIp: "203.0.113.122" },
      ),
    ).resolves.toMatchObject({
      status: "validation-failed",
      errors: [{ code: "idempotency-key-reused" }],
    });
  });

  it("fails closed when the old revision no longer satisfies the current validator", async () => {
    const adminId = await createActor();
    const created = await createPlace(adminId, "validator target");
    const advancedCommand = createCommand("unused");
    advancedCommand.changes = [
      {
        operation: "update",
        placeId: created.placeId,
        baseRevisionId: created.revisionId,
        fact: fact("validator current"),
        sources: [source()],
      },
    ];
    const advanced = await publishCampusMapChangeset(advancedCommand, {
      actorId: adminId,
      clientIp: "203.0.113.123",
    });
    if (advanced.status !== "published") throw new Error("update failed");
    const client = await pool.connect();
    await client.query("begin");
    await client.query("set local session_replication_role = replica");
    await client.query(
      "update campus_map_fact_revisions set name = '' where id = $1",
      [created.revisionId],
    );
    await client.query("commit");
    client.release();

    const result = await governCampusMapFacts(
      revertCommand({
        placeId: created.placeId,
        baseRevisionId: advanced.changes[0].revisionId,
        targetRevisionId: created.revisionId,
      }),
      { actorId: adminId, clientIp: "203.0.113.123" },
    );

    expect(result).toMatchObject({
      status: "validation-failed",
      errors: [{ code: "fact-name-required" }],
    });
    await expect(
      getCampusMapCurrentPlace(created.placeId),
    ).resolves.toMatchObject({
      revisionId: advanced.changes[0].revisionId,
      name: "validator current",
    });
  });

  it("serializes concurrent redaction before copying a historical revert value", async () => {
    const adminId = await createActor();
    const created = await createPlace(adminId, "redaction race target");
    const update = createCommand("unused");
    update.changes = [
      {
        operation: "update",
        placeId: created.placeId,
        baseRevisionId: created.revisionId,
        fact: fact("redaction race current"),
        sources: [source()],
      },
    ];
    const current = await publishCampusMapChangeset(update, {
      actorId: adminId,
      clientIp: "203.0.113.123",
    });
    if (current.status !== "published") throw new Error("update failed");
    const command = revertCommand({
      placeId: created.placeId,
      baseRevisionId: current.changes[0].revisionId,
      targetRevisionId: created.revisionId,
    });
    const redactor = await pool.connect();
    await redactor.query("begin");
    let governancePromise: ReturnType<typeof governCampusMapFacts> | undefined;
    try {
      await redactor.query(
        "update campus_map_revision_visibility set visibility = 'redacted', redaction_ref = 'test:#720-race' where revision_id = $1",
        [created.revisionId],
      );
      governancePromise = governCampusMapFacts(command, {
        actorId: adminId,
        clientIp: "203.0.113.123",
      });
      await waitForBlockedQuery(pool, "campus_map_revision_visibility", 1);
      await redactor.query("commit");

      await expect(governancePromise).resolves.toMatchObject({
        status: "validation-failed",
        errors: [{ code: "redacted-revision-not-revertible" }],
      });
      await expect(
        getCampusMapPlaceHistory(created.placeId),
      ).resolves.toMatchObject({
        items: [
          { id: current.changes[0].revisionId },
          { id: created.revisionId },
        ],
      });
    } finally {
      await redactor.query("rollback").catch(() => undefined);
      redactor.release();
      if (governancePromise) await governancePromise.catch(() => undefined);
    }
  }, 15_000);

  it("reverts to a historical retirement without reviving or moving old pointers", async () => {
    const adminId = await createActor();
    const created = await createPlace(adminId, "retirement snapshot");
    const retire = createCommand("unused");
    retire.changes = [
      {
        operation: "retire",
        placeId: created.placeId,
        baseRevisionId: created.revisionId,
        sources: [source()],
      },
    ];
    const retired = await publishCampusMapChangeset(retire, {
      actorId: adminId,
      clientIp: "203.0.113.123",
    });
    if (retired.status !== "published") throw new Error("retire failed");
    const restore = createCommand("unused");
    restore.changes = [
      {
        operation: "restore",
        placeId: created.placeId,
        baseRevisionId: retired.changes[0].revisionId,
        fact: fact("restored with later values"),
        sources: [source()],
      },
    ];
    const restored = await publishCampusMapChangeset(restore, {
      actorId: adminId,
      clientIp: "203.0.113.123",
    });
    if (restored.status !== "published") throw new Error("restore failed");

    const command = revertCommand({
      placeId: created.placeId,
      baseRevisionId: restored.changes[0].revisionId,
      targetRevisionId: retired.changes[0].revisionId,
    });
    const reverted = await governCampusMapFacts(command, {
      actorId: adminId,
      clientIp: "203.0.113.123",
    });

    expect(reverted).toMatchObject({ status: "published" });
    if (reverted.status !== "published") throw new Error("revert failed");
    await expect(getCampusMapCurrentPlace(created.placeId)).resolves.toBeNull();
    await expect(
      getCampusMapPlaceRevision(
        created.placeId,
        reverted.changes[0].revisionId,
      ),
    ).resolves.toMatchObject({
      status: "retired",
      previousRevisionId: restored.changes[0].revisionId,
      content: { visibility: "public", fact: { name: "retirement snapshot" } },
    });
    await expect(
      governCampusMapFacts(command, {
        actorId: adminId,
        clientIp: "203.0.113.123",
      }),
    ).resolves.toEqual(reverted);
  });

  it("atomically merges stable IDs and preserves both histories and deep links", async () => {
    const adminId = await createActor();
    const survivor = await createPlace(adminId, "merge survivor old");
    const loser = await createPlace(adminId, "merge loser old");
    const command = mergeCommand({
      survivor: { ...survivor, name: "merge resolved fact" },
      loser,
    });
    const sameCanonicalPlace = structuredClone(command);
    sameCanonicalPlace.idempotencyKey = randomUUID();
    sameCanonicalPlace.loser.placeId = survivor.placeId.toUpperCase();
    sameCanonicalPlace.loser.baseRevisionId = survivor.revisionId.toUpperCase();
    await expect(
      governCampusMapFacts(sameCanonicalPlace, {
        actorId: adminId,
        clientIp: "203.0.113.124",
      }),
    ).resolves.toMatchObject({
      status: "validation-failed",
      errors: [{ code: "merge-place-must-differ" }],
    });

    const merged = await governCampusMapFacts(command, {
      actorId: adminId,
      clientIp: "203.0.113.124",
    });
    expect(merged).toMatchObject({ status: "published" });
    if (merged.status !== "published") throw new Error("merge failed");
    await expect(
      getCampusMapCurrentPlace(survivor.placeId),
    ).resolves.toMatchObject({
      name: "merge resolved fact",
    });
    await expect(getCampusMapCurrentPlace(loser.placeId)).resolves.toBeNull();
    const loserHistory = await getCampusMapPlaceHistory(loser.placeId);
    expect(loserHistory).toMatchObject({
      placeExists: true,
      head: { status: "merged", mergedIntoPlaceId: survivor.placeId },
      items: [
        { operation: "merge", mergedIntoPlaceId: survivor.placeId },
        { id: loser.revisionId, operation: "create" },
      ],
    });
    await expect(
      getCampusMapPlaceRevision(loser.placeId, loserHistory.head!.revisionId),
    ).resolves.toMatchObject({
      status: "merged",
      mergedIntoPlaceId: survivor.placeId,
      content: { visibility: "public" },
    });
    await expect(
      getCampusMapChangeset(merged.changesetId),
    ).resolves.toMatchObject({
      actor: { id: adminId },
      comment: command.reason,
      counts: { affected: 2, updated: 1, merged: 1 },
    });
    await expect(
      governCampusMapFacts(command, {
        actorId: adminId,
        clientIp: "203.0.113.124",
      }),
    ).resolves.toEqual(merged);
    const reusedKey = structuredClone(command);
    reusedKey.reason = "同一个 key 的不同治理理由";
    await expect(
      governCampusMapFacts(reusedKey, {
        actorId: adminId,
        clientIp: "203.0.113.124",
      }),
    ).resolves.toMatchObject({
      status: "validation-failed",
      errors: [{ code: "idempotency-key-reused" }],
    });

    const revive = revertCommand({
      placeId: loser.placeId,
      baseRevisionId: loserHistory.head!.revisionId,
      targetRevisionId: loser.revisionId,
    });
    await expect(
      governCampusMapFacts(revive, {
        actorId: adminId,
        clientIp: "203.0.113.124",
      }),
    ).resolves.toMatchObject({
      status: "validation-failed",
      errors: [{ code: "merged-place-not-revertible" }],
    });
  });

  it("rolls back the whole admin bulk edit when one base is stale", async () => {
    const adminId = await createActor();
    const a = await createPlace(adminId, "bulk original A");
    const b = await createPlace(adminId, "bulk original B");
    const advance = createCommand("unused");
    advance.changes = [
      {
        operation: "update",
        placeId: b.placeId,
        baseRevisionId: b.revisionId,
        fact: fact("bulk advanced B"),
        sources: [source()],
      },
    ];
    const advanced = await publishCampusMapChangeset(advance, {
      actorId: adminId,
      clientIp: "203.0.113.125",
    });
    if (advanced.status !== "published") throw new Error("advance failed");

    const result = await governCampusMapFacts(
      {
        kind: "bulk-edit",
        idempotencyKey: randomUUID(),
        reason: "批量修正两个地点",
        sourceSummary: "现场核对",
        client: { name: "governance-test", version: "1" },
        warningAcknowledgements: [],
        changes: [
          {
            operation: "update",
            placeId: a.placeId,
            baseRevisionId: a.revisionId,
            fact: fact("bulk changed A"),
            sources: [source()],
          },
          {
            operation: "update",
            placeId: b.placeId,
            baseRevisionId: b.revisionId,
            fact: fact("bulk changed B"),
            sources: [source()],
          },
        ],
      },
      { actorId: adminId, clientIp: "203.0.113.125" },
    );

    expect(result).toMatchObject({
      status: "conflict",
      conflicts: [{ placeId: b.placeId }],
    });
    await expect(getCampusMapCurrentPlace(a.placeId)).resolves.toMatchObject({
      revisionId: a.revisionId,
      name: "bulk original A",
    });
    await expect(getCampusMapPlaceHistory(a.placeId)).resolves.toMatchObject({
      items: [{ id: a.revisionId }],
    });
  });

  it("does not partially revise the survivor when a merge loser base is stale", async () => {
    const adminId = await createActor();
    const survivor = await createPlace(adminId, "stale merge survivor");
    const loser = await createPlace(adminId, "stale merge loser");
    const command = mergeCommand({
      survivor: { ...survivor, name: "stale merge resolved" },
      loser,
    });
    const advance = createCommand("unused");
    advance.changes = [
      {
        operation: "update",
        placeId: loser.placeId,
        baseRevisionId: loser.revisionId,
        fact: fact("stale merge loser advanced"),
        sources: [source()],
      },
    ];
    const advanced = await publishCampusMapChangeset(advance, {
      actorId: adminId,
      clientIp: "203.0.113.128",
    });
    if (advanced.status !== "published") throw new Error("advance failed");

    await expect(
      governCampusMapFacts(command, {
        actorId: adminId,
        clientIp: "203.0.113.128",
      }),
    ).resolves.toMatchObject({
      status: "conflict",
      conflicts: [{ placeId: loser.placeId }],
    });
    await expect(
      getCampusMapCurrentPlace(survivor.placeId),
    ).resolves.toMatchObject({
      revisionId: survivor.revisionId,
      name: "stale merge survivor",
    });
    await expect(
      getCampusMapPlaceHistory(survivor.placeId),
    ).resolves.toMatchObject({
      items: [{ id: survivor.revisionId }],
    });
  });

  it("lets only one concurrent revert or update advance the same base", async () => {
    const [adminId, editorId] = await Promise.all([
      createActor(),
      createActor(),
    ]);
    const created = await createPlace(adminId, "concurrent revert old");
    const firstUpdate = createCommand("unused");
    firstUpdate.changes = [
      {
        operation: "update",
        placeId: created.placeId,
        baseRevisionId: created.revisionId,
        fact: fact("concurrent revert current"),
        sources: [source()],
      },
    ];
    const current = await publishCampusMapChangeset(firstUpdate, {
      actorId: adminId,
      clientIp: "203.0.113.129",
    });
    if (current.status !== "published") throw new Error("update failed");
    const revert = revertCommand({
      placeId: created.placeId,
      baseRevisionId: current.changes[0].revisionId,
      targetRevisionId: created.revisionId,
    });
    const competingUpdate = createCommand("unused");
    competingUpdate.changes = [
      {
        operation: "update",
        placeId: created.placeId,
        baseRevisionId: current.changes[0].revisionId,
        fact: fact("concurrent editor wins"),
        sources: [source()],
      },
    ];
    const blocker = await pool.connect();
    await blocker.query("begin");
    await blocker.query(
      "select id from campus_map_places where id = $1 for update",
      [created.placeId],
    );
    let revertPromise: ReturnType<typeof governCampusMapFacts> | undefined;
    let updatePromise: ReturnType<typeof publishCampusMapChangeset> | undefined;
    try {
      revertPromise = governCampusMapFacts(revert, {
        actorId: adminId,
        clientIp: "203.0.113.129",
      });
      updatePromise = publishCampusMapChangeset(competingUpdate, {
        actorId: editorId,
        clientIp: "203.0.113.130",
      });
      await waitForBlockedPlaceQueries(pool, 2);
      await blocker.query("commit");
      const results = await Promise.all([revertPromise, updatePromise]);
      expect(
        results.filter((result) => result.status === "published"),
      ).toHaveLength(1);
      expect(
        results.filter((result) => result.status === "conflict"),
      ).toHaveLength(1);
    } finally {
      await blocker.query("rollback").catch(() => undefined);
      blocker.release();
      if (revertPromise && updatePromise) {
        await Promise.allSettled([revertPromise, updatePromise]);
      }
    }
  });

  it("uses fixed Place lock order so inverse concurrent merges cannot deadlock", async () => {
    const [adminA, adminB] = await Promise.all([createActor(), createActor()]);
    const a = await createPlace(adminA, "inverse merge A");
    const b = await createPlace(adminA, "inverse merge B");
    const mergeA = mergeCommand({
      survivor: { ...a, name: "inverse merge A" },
      loser: b,
    });
    const mergeB = mergeCommand({
      survivor: { ...b, name: "inverse merge B" },
      loser: a,
    });
    const lowerPlaceId = [a.placeId, b.placeId].sort()[0];
    const blocker = await pool.connect();
    await blocker.query("begin");
    await blocker.query(
      "select id from campus_map_places where id = $1 for update",
      [lowerPlaceId],
    );
    let promiseA: ReturnType<typeof governCampusMapFacts> | undefined;
    let promiseB: ReturnType<typeof governCampusMapFacts> | undefined;
    try {
      promiseA = governCampusMapFacts(mergeA, {
        actorId: adminA,
        clientIp: "203.0.113.126",
      });
      promiseB = governCampusMapFacts(mergeB, {
        actorId: adminB,
        clientIp: "203.0.113.127",
      });
      await waitForBlockedPlaceQueries(pool, 2);
      await blocker.query("commit");
      const results = await Promise.all([promiseA, promiseB]);
      expect(
        results.filter((result) => result.status === "published"),
      ).toHaveLength(1);
      expect(
        results.filter(
          (result) =>
            result.status === "conflict" ||
            result.status === "validation-failed",
        ),
      ).toHaveLength(1);
    } finally {
      await blocker.query("rollback").catch(() => undefined);
      blocker.release();
      if (promiseA && promiseB) await Promise.allSettled([promiseA, promiseB]);
    }
  });
});

async function waitForBlockedPlaceQueries(pool: Pool, minimum: number) {
  return waitForBlockedQuery(pool, "campus_map_places", minimum);
}

async function waitForBlockedQuery(
  pool: Pool,
  relation: string | null,
  minimum: number,
) {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    const result = await pool.query<{ count: string }>(
      `select count(*)::text as count
         from pg_stat_activity
        where datname = current_database()
          and pid <> pg_backend_pid()
          and wait_event_type = 'Lock'
          and ($1::text is null or query like ('%' || $1 || '%'))`,
      [relation],
    );
    if (Number(result.rows[0]?.count ?? 0) >= minimum) return;
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
  throw new Error(
    `Timed out waiting for ${minimum} blocked queries${relation ? ` on ${relation}` : ""}`,
  );
}
