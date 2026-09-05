import { randomUUID } from "node:crypto";

import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type {
  CampusMapAppendChangesetCommand,
  CampusMapAppendFact,
} from "@/lib/campus-map/fact-store-transaction";
import {
  commandCampusMapProviderMapping,
  getCampusMapProviderMappingGovernance,
  listCampusMapProviderMappings,
  resolveCampusMapProviderSelection,
} from "@/lib/campus-map/provider-mapping-registry";
import { appendCampusMapChangesetForStorageTest } from "../helpers/campus-map-fact-store";

const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)("Campus Map provider mapping registry", () => {
  let pool: Pool;
  const actorId = randomUUID();
  const ordinaryUserId = randomUUID();
  const bannedAdminId = randomUUID();
  const buildingId = randomUUID();
  const secondBuildingId = randomUUID();
  const inactivePlaceId = randomUUID();
  const activePlaceId = randomUUID();
  const activeChangesetId = randomUUID();
  const activeChangeId = randomUUID();
  const activeRevisionId = randomUUID();
  const retiredChangesetId = randomUUID();
  const retiredChangeId = randomUUID();
  const retiredRevisionId = randomUUID();
  const provenanceId = randomUUID();
  const activeFact: CampusMapAppendFact = {
    name: "Issue 779 active Place",
    buildingId,
    floorId: null,
    pinType: "water",
    regularHours: null,
    officialActions: [],
    visitNote: null,
    capabilities: [],
    gender: null,
    wheelchairAccess: null,
    audience: "unknown",
    credentialRequirement: "unknown",
    accessSchedule: { kind: "unknown" },
    reservationRequirement: "unknown",
    temporaryStatus: null,
    locationKind: "building",
    pointPrecision: null,
    longitude: null,
    latitude: null,
    coordinateCrs: null,
    observedAt: new Date("2000-01-01T00:00:00.000Z"),
    verifiedAt: null,
    verifiedByActorIdSnapshot: null,
  };

  beforeAll(async () => {
    pool = new Pool({ connectionString: process.env.DATABASE_URL });
    await pool.query(
      `insert into users
         (id, email, email_verified, nickname, role, banned)
       values
         ($1, $2, true, 'Provider mapping 管理员', 'admin', false),
         ($3, $4, true, 'Provider mapping 用户', 'user', false),
         ($5, $6, true, 'Provider mapping 停权管理员', 'admin', true)`,
      [
        actorId,
        `issue-779-${actorId}@cuhk.edu.hk`,
        ordinaryUserId,
        `issue-779-${ordinaryUserId}@cuhk.edu.hk`,
        bannedAdminId,
        `issue-779-${bannedAdminId}@cuhk.edu.hk`,
      ],
    );
    await pool.query(
      `insert into accounts (id, account_id, provider_id, user_id, password)
       values
         ($1, $2, 'credential', $3, 'test-credential'),
         ($4, $5, 'credential', $6, 'test-credential'),
         ($7, $8, 'credential', $9, 'test-credential')`,
      [
        randomUUID(),
        actorId,
        actorId,
        randomUUID(),
        ordinaryUserId,
        ordinaryUserId,
        randomUUID(),
        bannedAdminId,
        bannedAdminId,
      ],
    );
    await pool.query(
      `insert into campus_map_buildings (id, name, code)
       values
         ($1, 'Issue 779 Building', 'I779'),
         ($2, 'Issue 779 Second Building', 'I779B')`,
      [buildingId, secondBuildingId],
    );
    await pool.query("insert into campus_map_places (id) values ($1)", [
      inactivePlaceId,
    ]);
    await pool.query(
      `insert into campus_map_provenance_sources
         (id, source_kind, source_ref, accessed_on, rights_status)
       values ($1, 'provider-candidate', $2, '2026-08-27', 'restricted')`,
      [provenanceId, `test:provider-mapping:${provenanceId}`],
    );
    const command: CampusMapAppendChangesetCommand = {
      id: activeChangesetId,
      actor: {
        userId: actorId,
        id: actorId,
        nickname: "Provider mapping 管理员",
      },
      comment: "Create provider mapping test Place",
      sourceSummary: "Provider candidate fixture",
      reviewRequested: false,
      client: { name: "provider-mapping-test", version: "1" },
      warningSummary: [],
      revertsChangesetId: null,
      publishedAt: new Date("2000-01-01T00:00:00.000Z"),
      changes: [
        {
          id: activeChangeId,
          placeId: activePlaceId,
          revisionId: activeRevisionId,
          baseRevisionId: null,
          operation: "create",
          factSchemaVersion: 2,
          fieldMetadata: { name: { label: "名称" } },
          fieldDiff: {
            name: {
              before: null,
              after: "Issue 779 active Place",
              label: "名称",
            },
          },
          status: "active",
          mergedIntoPlaceId: null,
          fact: activeFact,
          provenanceIds: [provenanceId],
          visibility: { visibility: "public" },
        },
      ],
    };
    await appendCampusMapChangesetForStorageTest(command);
  });

  afterAll(async () => {
    const client = await pool.connect();
    await client.query("begin");
    await client.query("set local session_replication_role = replica");
    await client.query(
      "delete from campus_map_provider_mapping_requests where actor_id_snapshot = $1",
      [actorId],
    );
    await client.query(
      "delete from campus_map_provider_mapping_events where actor_id_snapshot = $1",
      [actorId],
    );
    await client.query(
      "delete from campus_map_provider_mappings where provider = 'test-provider-779'",
    );
    await client.query(
      "delete from campus_map_current_facts where place_id = $1",
      [activePlaceId],
    );
    await client.query(
      "delete from campus_map_current_revisions where place_id = $1",
      [activePlaceId],
    );
    await client.query(
      "delete from campus_map_revision_visibility where revision_id = any($1::uuid[])",
      [[activeRevisionId, retiredRevisionId]],
    );
    await client.query(
      "delete from campus_map_revision_provenance where revision_id = any($1::uuid[])",
      [[activeRevisionId, retiredRevisionId]],
    );
    await client.query(
      "delete from campus_map_fact_revisions where id = any($1::uuid[])",
      [[activeRevisionId, retiredRevisionId]],
    );
    await client.query(
      "delete from campus_map_place_changes where id = any($1::uuid[])",
      [[activeChangeId, retiredChangeId]],
    );
    await client.query(
      "delete from campus_map_changesets where id = any($1::uuid[])",
      [[activeChangesetId, retiredChangesetId]],
    );
    await client.query(
      "delete from campus_map_places where id = any($1::uuid[])",
      [[inactivePlaceId, activePlaceId]],
    );
    await client.query("delete from accounts where user_id = any($1::uuid[])", [
      [actorId, ordinaryUserId, bannedAdminId],
    ]);
    await client.query("delete from users where id = any($1::uuid[])", [
      [actorId, ordinaryUserId, bannedAdminId],
    ]);
    await client.query(
      "delete from campus_map_buildings where id = any($1::uuid[])",
      [[buildingId, secondBuildingId]],
    );
    await client.query(
      "delete from campus_map_provenance_sources where id = $1",
      [provenanceId],
    );
    await client.query("commit");
    client.release();
    await pool.end();
  });

  it("explicitly binds a provider object to a canonical Building", async () => {
    const result = await commandCampusMapProviderMapping(
      {
        kind: "bind",
        idempotencyKey: randomUUID(),
        identity: {
          provider: "test-provider-779",
          providerObjectId: "building-poi",
        },
        target: { kind: "building", buildingId },
        reason: "人工核对 provider 建筑标签",
        provenanceId,
      },
      { actorId },
    );

    expect(result).toMatchObject({
      status: "mapped",
      outcome: "bound",
      target: { kind: "building", buildingId },
    });
    await expect(
      resolveCampusMapProviderSelection("test-provider-779", "building-poi"),
    ).resolves.toEqual({ kind: "building", buildingId });
    await expect(
      listCampusMapProviderMappings("test-provider-779"),
    ).resolves.toEqual(
      expect.arrayContaining([
        {
          providerObjectId: "building-poi",
          target: { kind: "building", buildingId },
        },
      ]),
    );
    await expect(
      getCampusMapProviderMappingGovernance(
        { provider: "test-provider-779", providerObjectId: "building-poi" },
        { actorId },
      ),
    ).resolves.toMatchObject({
      status: "ok",
      identity: {
        provider: "test-provider-779",
        providerObjectId: "building-poi",
      },
      activeTarget: { kind: "building", buildingId },
      events: [
        {
          kind: "bind",
          previousTarget: null,
          newTarget: { kind: "building", buildingId },
          actor: { id: actorId, nickname: "Provider mapping 管理员" },
          reason: "人工核对 provider 建筑标签",
          provenanceId,
          occurredAt: expect.any(String),
        },
      ],
    });
  });

  it("fails closed when a Place has no public active Current fact", async () => {
    await expect(
      commandCampusMapProviderMapping(
        {
          kind: "bind",
          idempotencyKey: randomUUID(),
          identity: {
            provider: "test-provider-779",
            providerObjectId: "inactive-place-poi",
          },
          target: { kind: "place", placeId: inactivePlaceId },
          reason: "不得把 retired、redacted 或未发布 Place 绑定到公共卡片",
          provenanceId,
        },
        { actorId },
      ),
    ).resolves.toEqual({
      status: "not-found",
      code: "mapping-target-not-found",
    });
    await expect(
      resolveCampusMapProviderSelection(
        "test-provider-779",
        "inactive-place-poi",
      ),
    ).resolves.toBeNull();
  });

  it("returns a typed failure when the canonical target kind is wrong", async () => {
    await expect(
      commandCampusMapProviderMapping(
        {
          kind: "bind",
          idempotencyKey: randomUUID(),
          identity: {
            provider: "test-provider-779",
            providerObjectId: "wrong-kind-poi",
          },
          target: { kind: "building", buildingId: inactivePlaceId },
          reason: "故意用 Place ID 声称 Building",
          provenanceId,
        },
        { actorId },
      ),
    ).resolves.toEqual({
      status: "not-found",
      code: "mapping-target-kind-mismatch",
    });
  });

  it("unlinks only the explicitly expected canonical target", async () => {
    const identity = {
      provider: "test-provider-779",
      providerObjectId: "unlink-building-poi",
    };
    const target = { kind: "building" as const, buildingId };
    await commandCampusMapProviderMapping(
      {
        kind: "bind",
        idempotencyKey: randomUUID(),
        identity,
        target,
        reason: "先建立待解除的显式关系",
        provenanceId,
      },
      { actorId },
    );

    const result = await commandCampusMapProviderMapping(
      {
        kind: "unlink",
        idempotencyKey: randomUUID(),
        identity,
        previousTarget: target,
        reason: "人工核对后解除错误关系",
        provenanceId,
      },
      { actorId },
    );

    expect(result).toMatchObject({
      status: "mapped",
      outcome: "unlinked",
      previousTarget: target,
      target: null,
    });
    await expect(
      resolveCampusMapProviderSelection(
        identity.provider,
        identity.providerObjectId,
      ),
    ).resolves.toBeNull();
    await expect(
      getCampusMapProviderMappingGovernance(identity, { actorId }),
    ).resolves.toMatchObject({
      status: "ok",
      activeTarget: null,
      events: [
        { kind: "bind", previousTarget: null, newTarget: target },
        { kind: "unlink", previousTarget: target, newTarget: null },
      ],
    });
  });

  it("binds an active Place and rebinds from the expected previous target", async () => {
    const identity = {
      provider: "test-provider-779",
      providerObjectId: "rebind-place-poi",
    };
    const buildingTarget = { kind: "building" as const, buildingId };
    const placeTarget = { kind: "place" as const, placeId: activePlaceId };
    await commandCampusMapProviderMapping(
      {
        kind: "bind",
        idempotencyKey: randomUUID(),
        identity,
        target: buildingTarget,
        reason: "初次判断为 Building",
        provenanceId,
      },
      { actorId },
    );

    await expect(
      commandCampusMapProviderMapping(
        {
          kind: "rebind",
          idempotencyKey: randomUUID(),
          identity,
          previousTarget: buildingTarget,
          newTarget: placeTarget,
          reason: "人工复核后确认 provider object 对应具体 Place",
          provenanceId,
        },
        { actorId },
      ),
    ).resolves.toMatchObject({
      status: "mapped",
      outcome: "rebound",
      previousTarget: buildingTarget,
      target: placeTarget,
    });
    await expect(
      resolveCampusMapProviderSelection(
        identity.provider,
        identity.providerObjectId,
      ),
    ).resolves.toEqual({
      kind: "place",
      placeId: activePlaceId,
      buildingId,
      floorId: null,
    });
    await expect(
      getCampusMapProviderMappingGovernance(identity, { actorId }),
    ).resolves.toMatchObject({
      status: "ok",
      activeTarget: placeTarget,
      events: [
        {
          kind: "bind",
          previousTarget: null,
          newTarget: buildingTarget,
        },
        {
          kind: "rebind",
          previousTarget: buildingTarget,
          newTarget: placeTarget,
        },
      ],
    });
  });

  it("replays the same command idempotently without a second decision", async () => {
    const idempotencyKey = randomUUID();
    const identity = {
      provider: "test-provider-779",
      providerObjectId: "idempotent-poi",
    };
    const command = {
      kind: "bind" as const,
      idempotencyKey,
      identity,
      target: { kind: "building" as const, buildingId },
      reason: "同一审核输入只形成一个决定",
      provenanceId,
    };

    const results = await Promise.all([
      commandCampusMapProviderMapping(command, { actorId }),
      commandCampusMapProviderMapping(command, { actorId }),
    ]);
    expect(results[0]).toEqual(results[1]);
    await expect(
      getCampusMapProviderMappingGovernance(identity, { actorId }),
    ).resolves.toMatchObject({ status: "ok", events: [{ kind: "bind" }] });

    await expect(
      commandCampusMapProviderMapping(
        { ...command, reason: "复用 key 但修改 payload" },
        { actorId },
      ),
    ).resolves.toEqual({
      status: "validation-failed",
      errors: [{ code: "idempotency-key-reused", field: "idempotencyKey" }],
    });
  });

  it("replays a conflict even after the active mapping changes", async () => {
    const identity = {
      provider: "test-provider-779",
      providerObjectId: "idempotent-conflict-poi",
    };
    const originalTarget = { kind: "building" as const, buildingId };
    const conflictingTarget = {
      kind: "building" as const,
      buildingId: secondBuildingId,
    };
    await commandCampusMapProviderMapping(
      {
        kind: "bind",
        idempotencyKey: randomUUID(),
        identity,
        target: originalTarget,
        reason: "建立冲突前的 active mapping",
        provenanceId,
      },
      { actorId },
    );
    const conflictingCommand = {
      kind: "bind" as const,
      idempotencyKey: randomUUID(),
      identity,
      target: conflictingTarget,
      reason: "这个确定性冲突必须可重放",
      provenanceId,
    };
    const first = await commandCampusMapProviderMapping(conflictingCommand, {
      actorId,
    });
    expect(first).toEqual({
      status: "conflict",
      code: "provider-mapping-conflict",
      currentTarget: originalTarget,
    });

    await commandCampusMapProviderMapping(
      {
        kind: "unlink",
        idempotencyKey: randomUUID(),
        identity,
        previousTarget: originalTarget,
        reason: "改变外部状态后再次发送同一冲突命令",
        provenanceId,
      },
      { actorId },
    );

    await expect(
      commandCampusMapProviderMapping(conflictingCommand, { actorId }),
    ).resolves.toEqual(first);
    await expect(
      resolveCampusMapProviderSelection(
        identity.provider,
        identity.providerObjectId,
      ),
    ).resolves.toBeNull();
  });

  it("rejects a rebind whose claimed previous target is stale", async () => {
    const identity = {
      provider: "test-provider-779",
      providerObjectId: "stale-rebind-poi",
    };
    const activeTarget = {
      kind: "building" as const,
      buildingId: secondBuildingId,
    };
    await commandCampusMapProviderMapping(
      {
        kind: "bind",
        idempotencyKey: randomUUID(),
        identity,
        target: activeTarget,
        reason: "建立真实 active target",
        provenanceId,
      },
      { actorId },
    );

    await expect(
      commandCampusMapProviderMapping(
        {
          kind: "rebind",
          idempotencyKey: randomUUID(),
          identity,
          previousTarget: { kind: "building", buildingId },
          newTarget: activeTarget,
          reason: "错误声称旧 target，不得当作成功",
          provenanceId,
        },
        { actorId },
      ),
    ).resolves.toEqual({
      status: "conflict",
      code: "provider-mapping-conflict",
      currentTarget: activeTarget,
    });
  });

  it("serializes conflicting concurrent binds to one active target", async () => {
    const identity = {
      provider: "test-provider-779",
      providerObjectId: "concurrent-poi",
    };
    const results = await Promise.all([
      commandCampusMapProviderMapping(
        {
          kind: "bind",
          idempotencyKey: randomUUID(),
          identity,
          target: { kind: "building", buildingId },
          reason: "并发候选 A",
          provenanceId,
        },
        { actorId },
      ),
      commandCampusMapProviderMapping(
        {
          kind: "bind",
          idempotencyKey: randomUUID(),
          identity,
          target: { kind: "building", buildingId: secondBuildingId },
          reason: "并发候选 B",
          provenanceId,
        },
        { actorId },
      ),
    ]);

    expect(results.map((result) => result.status).sort()).toEqual([
      "conflict",
      "mapped",
    ]);
    const governance = await getCampusMapProviderMappingGovernance(identity, {
      actorId,
    });
    expect(governance).toMatchObject({ status: "ok", events: [{}] });
    if (governance.status !== "ok") throw new Error("governance read failed");
    expect(governance.activeTarget).toEqual(governance.events[0]?.newTarget);
  });

  it("requires fresh server-side admin authority for every write", async () => {
    const command = {
      kind: "bind" as const,
      idempotencyKey: randomUUID(),
      identity: {
        provider: "test-provider-779",
        providerObjectId: "unauthorized-poi",
      },
      target: { kind: "building" as const, buildingId },
      reason: "权限测试",
      provenanceId,
    };

    await expect(
      commandCampusMapProviderMapping(command, { actorId: null }),
    ).resolves.toEqual({
      status: "authentication-required",
      code: "authentication-required",
    });
    await expect(
      commandCampusMapProviderMapping(command, { actorId: ordinaryUserId }),
    ).resolves.toEqual({ status: "forbidden", code: "admin-required" });
    await expect(
      commandCampusMapProviderMapping(command, { actorId: bannedAdminId }),
    ).resolves.toEqual({ status: "forbidden", code: "actor-banned" });
    await expect(
      resolveCampusMapProviderSelection(
        command.identity.provider,
        command.identity.providerObjectId,
      ),
    ).resolves.toBeNull();
  });

  it("fails malformed runtime input closed after checking admin authority", async () => {
    const malformed = {
      kind: "bind",
      idempotencyKey: randomUUID(),
      identity: { provider: "amap", providerObjectId: "malformed-poi" },
      reason: "缺少 target 与 provenance",
    } as never;

    await expect(
      commandCampusMapProviderMapping(malformed, { actorId }),
    ).resolves.toEqual({
      status: "validation-failed",
      errors: [{ code: "invalid-command", field: "command" }],
    });
    await expect(
      commandCampusMapProviderMapping(malformed, { actorId: ordinaryUserId }),
    ).resolves.toEqual({ status: "forbidden", code: "admin-required" });
  });

  it("rejects ambiguous runtime command shapes instead of discarding fields", async () => {
    const ambiguous = {
      kind: "bind",
      idempotencyKey: randomUUID(),
      identity: {
        provider: "test-provider-779",
        providerObjectId: "ambiguous-target-poi",
      },
      target: {
        kind: "building",
        buildingId,
        placeId: activePlaceId,
      },
      reason: "歧义 target 必须 fail closed",
      provenanceId,
    } as never;

    await expect(
      commandCampusMapProviderMapping(ambiguous, { actorId }),
    ).resolves.toEqual({
      status: "validation-failed",
      errors: [{ code: "invalid-command", field: "command" }],
    });
    await expect(
      resolveCampusMapProviderSelection(
        "test-provider-779",
        "ambiguous-target-poi",
      ),
    ).resolves.toBeNull();

    const extraneousCommandField = {
      kind: "bind",
      idempotencyKey: randomUUID(),
      identity: {
        provider: "test-provider-779",
        providerObjectId: "ambiguous-command-poi",
      },
      target: { kind: "building", buildingId },
      previousTarget: { kind: "building", buildingId: secondBuildingId },
      reason: "bind 不得静默丢弃 previousTarget",
      provenanceId,
    } as never;
    await expect(
      commandCampusMapProviderMapping(extraneousCommandField, { actorId }),
    ).resolves.toEqual({
      status: "validation-failed",
      errors: [{ code: "invalid-command", field: "command" }],
    });
  });

  it("validates every previous target before evaluating mapping state", async () => {
    await expect(
      commandCampusMapProviderMapping(
        {
          kind: "unlink",
          idempotencyKey: randomUUID(),
          identity: {
            provider: "test-provider-779",
            providerObjectId: "missing-previous-target-poi",
          },
          previousTarget: { kind: "building", buildingId: randomUUID() },
          reason: "不存在的 previous target 必须 fail closed",
          provenanceId,
        },
        { actorId },
      ),
    ).resolves.toEqual({
      status: "not-found",
      code: "mapping-target-not-found",
    });

    await expect(
      commandCampusMapProviderMapping(
        {
          kind: "rebind",
          idempotencyKey: randomUUID(),
          identity: {
            provider: "test-provider-779",
            providerObjectId: "wrong-kind-previous-target-poi",
          },
          previousTarget: {
            kind: "building",
            buildingId: inactivePlaceId,
          },
          newTarget: { kind: "building", buildingId },
          reason: "previous target kind 错误必须 fail closed",
          provenanceId,
        },
        { actorId },
      ),
    ).resolves.toEqual({
      status: "not-found",
      code: "mapping-target-kind-mismatch",
    });
  });

  it("can unlink and rebind a mapping after its Place is retired", async () => {
    const unlinkIdentity = {
      provider: "test-provider-779",
      providerObjectId: "retired-place-unlink-poi",
    };
    const rebindIdentity = {
      provider: "test-provider-779",
      providerObjectId: "retired-place-rebind-poi",
    };
    const placeTarget = { kind: "place" as const, placeId: activePlaceId };
    for (const identity of [unlinkIdentity, rebindIdentity]) {
      await commandCampusMapProviderMapping(
        {
          kind: "bind",
          idempotencyKey: randomUUID(),
          identity,
          target: placeTarget,
          reason: "Place 退役前建立正式 mapping",
          provenanceId,
        },
        { actorId },
      );
    }

    await appendCampusMapChangesetForStorageTest({
      id: retiredChangesetId,
      actor: {
        userId: actorId,
        id: actorId,
        nickname: "Provider mapping 管理员",
      },
      comment: "Retire the mapped Place",
      sourceSummary: "Provider mapping lifecycle regression fixture",
      reviewRequested: false,
      client: { name: "provider-mapping-test", version: "1" },
      warningSummary: [],
      revertsChangesetId: null,
      publishedAt: new Date("2000-01-02T00:00:00.000Z"),
      changes: [
        {
          id: retiredChangeId,
          placeId: activePlaceId,
          revisionId: retiredRevisionId,
          baseRevisionId: activeRevisionId,
          operation: "retire",
          factSchemaVersion: 2,
          fieldMetadata: { name: { label: "名称" } },
          fieldDiff: {},
          status: "retired",
          mergedIntoPlaceId: null,
          fact: activeFact,
          provenanceIds: [provenanceId],
          visibility: { visibility: "public" },
        },
      ],
    });
    await expect(
      resolveCampusMapProviderSelection(
        unlinkIdentity.provider,
        unlinkIdentity.providerObjectId,
      ),
    ).resolves.toBeNull();

    await expect(
      commandCampusMapProviderMapping(
        {
          kind: "unlink",
          idempotencyKey: randomUUID(),
          identity: unlinkIdentity,
          previousTarget: placeTarget,
          reason: "退役后清理 stale mapping",
          provenanceId,
        },
        { actorId },
      ),
    ).resolves.toMatchObject({
      status: "mapped",
      outcome: "unlinked",
      previousTarget: placeTarget,
      target: null,
    });
    await expect(
      commandCampusMapProviderMapping(
        {
          kind: "rebind",
          idempotencyKey: randomUUID(),
          identity: rebindIdentity,
          previousTarget: placeTarget,
          newTarget: { kind: "building", buildingId: secondBuildingId },
          reason: "退役后重新绑定到有效 Building",
          provenanceId,
        },
        { actorId },
      ),
    ).resolves.toMatchObject({
      status: "mapped",
      outcome: "rebound",
      previousTarget: placeTarget,
      target: { kind: "building", buildingId: secondBuildingId },
    });
  });

  it("keeps audit and idempotency records append-only", async () => {
    const result = await commandCampusMapProviderMapping(
      {
        kind: "bind",
        idempotencyKey: randomUUID(),
        identity: {
          provider: "test-provider-779",
          providerObjectId: "append-only-poi",
        },
        target: { kind: "building", buildingId },
        reason: "创建不可改写的审核记录",
        provenanceId,
      },
      { actorId },
    );
    if (result.status !== "mapped" || !result.eventId) {
      throw new Error("mapping command failed");
    }

    await expect(
      pool.query(
        "update campus_map_provider_mapping_events set reason = 'rewrite' where id = $1",
        [result.eventId],
      ),
    ).rejects.toMatchObject({ code: "23514" });
    const security = await pool.query<{
      relname: string;
      relrowsecurity: boolean;
    }>(
      `select relname, relrowsecurity
         from pg_class
        where relname = any($1::text[])
        order by relname`,
      [
        [
          "campus_map_provider_mapping_events",
          "campus_map_provider_mapping_requests",
          "campus_map_provider_mappings",
        ],
      ],
    );
    expect(security.rows).toEqual([
      {
        relname: "campus_map_provider_mapping_events",
        relrowsecurity: true,
      },
      {
        relname: "campus_map_provider_mapping_requests",
        relrowsecurity: true,
      },
      { relname: "campus_map_provider_mappings", relrowsecurity: true },
    ]);
  });
});
