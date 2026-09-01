import { randomUUID } from "node:crypto";

import { Pool } from "pg";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import {
  commandCampusMapPlaceFeedback,
  getCampusMapPlaceFeedbackPage,
  getCampusMapPlaceFeedbackSummaries,
  getCampusMapViewerPlaceFeedback,
} from "@/lib/campus-map/place-feedback";
import {
  publishCampusMapChangeset,
  type CampusMapPublishCommand,
} from "@/lib/campus-map/publish";
import {
  commandCampusMapModeration,
  getCampusMapModerationTarget,
} from "@/lib/campus-map/moderation-governance";
import {
  governCampusMapFacts,
  type CampusMapFactGovernanceCommand,
  type CampusMapMergeFieldResolution,
} from "@/lib/campus-map/fact-governance";
import { resetSensitiveMatcherForTests } from "@/lib/sensitive-content";

const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)("Campus Map place feedback (#817)", () => {
  let pool: Pool;
  const actorIds: string[] = [];
  const placeIds: string[] = [];

  beforeAll(() => {
    pool = new Pool({ connectionString: process.env.DATABASE_URL });
  });

  async function createActor(
    input: {
      banned?: boolean;
      email?: string;
      emailVerified?: boolean;
      nickname?: string;
      role?: string;
      withCredential?: boolean;
    } = {},
  ) {
    const actorId = randomUUID();
    actorIds.push(actorId);
    await pool.query(
      `insert into users (id, email, email_verified, nickname, role, banned)
       values ($1, $2, $3, $4, $5, $6)`,
      [
        actorId,
        input.email ?? `issue-817-${actorId}@cuhk.edu.hk`,
        input.emailVerified ?? true,
        input.nickname ?? "地图用户",
        input.role ?? "user",
        input.banned ?? false,
      ],
    );
    if (input.withCredential !== false) {
      await pool.query(
        `insert into accounts (id, account_id, provider_id, user_id, password)
         values ($1, $2, 'credential', $3, 'test-credential')`,
        [randomUUID(), actorId, actorId],
      );
    }
    return actorId;
  }

  async function createPlace(actorId: string, name = "评价测试地点") {
    const command: CampusMapPublishCommand = {
      kind: "single",
      idempotencyKey: randomUUID(),
      comment: "创建评价测试地点",
      sourceSummary: "自动化测试",
      reviewRequested: false,
      client: { name: "campus-map-feedback-test", version: "1" },
      warningAcknowledgements: [],
      changes: [
        {
          operation: "create",
          fact: {
            name,
            buildingId: null,
            floorId: null,
            pinType: "common-space",
            capabilities: [],
            gender: "unknown",
            wheelchairAccess: "unknown",
            audience: "public",
            credentialRequirement: "none",
            accessSchedule: { kind: "unknown" },
            reservationRequirement: "none",
            temporaryStatus: "normal",
            location: {
              kind: "outdoor-point",
              longitude: 114.207,
              latitude: 22.42,
              crs: "wgs84",
              precision: "approximate",
            },
            observedAt: "2026-08-31T00:00:00.000Z",
          },
          sources: [
            {
              kind: "field-observation",
              ref: `test:campus-map-feedback:${randomUUID()}`,
              url: null,
              owner: "CUpedia test",
              version: null,
              snapshotHash: null,
              accessedOn: "2026-08-31",
              observedAt: "2026-08-31T00:00:00.000Z",
              rightsStatus: "original-observation",
              limitations: null,
              note: null,
              sourceCoordinate: null,
            },
          ],
        },
      ],
    };
    const result = await publishCampusMapChangeset(command, {
      actorId,
      clientIp: "203.0.113.81",
    });
    if (result.status !== "published") {
      throw new Error(`place create failed: ${JSON.stringify(result)}`);
    }
    const placeId = result.changes[0]!.placeId;
    placeIds.push(placeId);
    return placeId;
  }

  async function currentRevisionId(placeId: string) {
    const result = await pool.query<{ revision_id: string }>(
      "select revision_id from campus_map_current_revisions where place_id = $1",
      [placeId],
    );
    const revisionId = result.rows[0]?.revision_id;
    if (!revisionId) throw new Error("current revision missing");
    return revisionId;
  }

  function governanceSource() {
    return {
      kind: "field-observation" as const,
      ref: `test:campus-map-feedback:${randomUUID()}`,
      url: null,
      owner: "CUpedia test",
      version: null,
      snapshotHash: null,
      accessedOn: "2026-08-31",
      observedAt: "2026-08-31T00:00:00.000Z",
      rightsStatus: "original-observation" as const,
      limitations: null,
      note: null,
      sourceCoordinate: null,
    };
  }

  function governanceFact(name: string) {
    return {
      name,
      buildingId: null,
      floorId: null,
      pinType: "common-space" as const,
      capabilities: [],
      gender: "unknown" as const,
      wheelchairAccess: "unknown" as const,
      audience: "public" as const,
      credentialRequirement: "none" as const,
      accessSchedule: { kind: "unknown" as const },
      reservationRequirement: "none" as const,
      temporaryStatus: "normal" as const,
      location: {
        kind: "outdoor-point" as const,
        longitude: 114.207,
        latitude: 22.42,
        crs: "wgs84" as const,
        precision: "approximate" as const,
      },
      observedAt: "2026-08-31T00:00:00.000Z",
    };
  }

  const mergeFieldResolutions: CampusMapMergeFieldResolution[] = [
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

  afterEach(async () => {
    const client = await pool.connect();
    await client.query("begin");
    try {
      await client.query("set local session_replication_role = replica");
      const feedbackIds =
        placeIds.length === 0
          ? []
          : (
              await client.query<{ id: string }>(
                "select id from campus_map_place_feedback where place_id = any($1::uuid[])",
                [placeIds],
              )
            ).rows.map((row) => row.id);
      if (actorIds.length > 0) {
        await client.query(
          "delete from campus_map_moderation_requests where actor_id_snapshot = any($1::uuid[])",
          [actorIds],
        );
      }
      if (feedbackIds.length > 0) {
        await client.query(
          "delete from campus_map_moderation_decisions where target_kind = 'place-feedback' and target_id = any($1::uuid[])",
          [feedbackIds],
        );
        await client.query(
          "delete from campus_map_reports where case_id in (select id from campus_map_moderation_cases where target_kind = 'place-feedback' and target_id = any($1::uuid[]))",
          [feedbackIds],
        );
        await client.query(
          "delete from campus_map_moderation_cases where target_kind = 'place-feedback' and target_id = any($1::uuid[])",
          [feedbackIds],
        );
      }
      await client.query("delete from campus_map_moderation_rate_limits");
      if (placeIds.length > 0) {
        await client.query(
          "delete from campus_map_place_feedback_visibility where feedback_id in (select id from campus_map_place_feedback where place_id = any($1::uuid[]))",
          [placeIds],
        );
        await client.query(
          "delete from campus_map_place_feedback where place_id = any($1::uuid[])",
          [placeIds],
        );
        await client.query(
          "delete from campus_map_current_facts where place_id = any($1::uuid[])",
          [placeIds],
        );
        await client.query(
          "delete from campus_map_current_revisions where place_id = any($1::uuid[])",
          [placeIds],
        );
        await client.query(
          "delete from campus_map_revision_visibility where revision_id in (select id from campus_map_fact_revisions where place_id = any($1::uuid[]))",
          [placeIds],
        );
        await client.query(
          "delete from campus_map_revision_provenance where revision_id in (select id from campus_map_fact_revisions where place_id = any($1::uuid[]))",
          [placeIds],
        );
        await client.query(
          "delete from campus_map_fact_revisions where place_id = any($1::uuid[])",
          [placeIds],
        );
        await client.query(
          "delete from campus_map_place_changes where place_id = any($1::uuid[])",
          [placeIds],
        );
        await client.query(
          "delete from campus_map_places where id = any($1::uuid[])",
          [placeIds],
        );
      }
      if (actorIds.length > 0) {
        await client.query(
          "delete from campus_map_publish_requests where actor_id_snapshot = any($1::uuid[])",
          [actorIds],
        );
        await client.query(
          "delete from campus_map_changesets where actor_id_snapshot = any($1::uuid[])",
          [actorIds],
        );
        await client.query(
          "delete from accounts where user_id = any($1::uuid[])",
          [actorIds],
        );
        await client.query("delete from users where id = any($1::uuid[])", [
          actorIds,
        ]);
      }
      await client.query(
        "delete from campus_map_provenance_sources where source_ref like 'test:campus-map-feedback:%'",
      );
      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      resetSensitiveMatcherForTests(null);
      client.release();
      actorIds.length = 0;
      placeIds.length = 0;
    }
  });

  afterAll(async () => {
    await pool.end();
  });

  it("creates one current feedback row, updates it with CAS, and exposes only public aggregates", async () => {
    const [publisher, reviewerA, reviewerB] = await Promise.all([
      createActor(),
      createActor({ nickname: "甲同学" }),
      createActor({ nickname: "乙同学" }),
    ]);
    const placeId = await createPlace(publisher);

    const createdA = await commandCampusMapPlaceFeedback(
      { kind: "create", placeId, rating: 4, content: "安静，也有足够座位。" },
      { actorId: reviewerA },
    );
    expect(createdA).toMatchObject({
      status: "created",
      feedback: { version: 1 },
    });
    if (createdA.status !== "created")
      throw new Error("feedback create failed");

    await expect(
      commandCampusMapPlaceFeedback(
        { kind: "create", placeId, rating: 2, content: null },
        { actorId: reviewerA },
      ),
    ).resolves.toEqual({ status: "conflict", code: "feedback-already-exists" });

    const [updated, stale] = await Promise.all([
      commandCampusMapPlaceFeedback(
        {
          kind: "update",
          feedbackId: createdA.feedback.id,
          expectedVersion: 1,
          rating: 5,
          content: "更新：空间安静，座位也充足。",
        },
        { actorId: reviewerA },
      ),
      commandCampusMapPlaceFeedback(
        {
          kind: "update",
          feedbackId: createdA.feedback.id,
          expectedVersion: 1,
          rating: 3,
          content: "并发旧写入",
        },
        { actorId: reviewerA },
      ),
    ]);
    expect([updated.status, stale.status].sort()).toEqual([
      "conflict",
      "updated",
    ]);

    await expect(
      commandCampusMapPlaceFeedback(
        { kind: "create", placeId, rating: 3, content: null },
        { actorId: reviewerB },
      ),
    ).resolves.toMatchObject({ status: "created" });

    await expect(
      getCampusMapPlaceFeedbackSummaries([placeId]),
    ).resolves.toEqual({
      [placeId]: {
        placeId,
        averageRating: 4,
        ratingCount: 2,
        reviewCount: 1,
      },
    });
    await expect(
      getCampusMapPlaceFeedbackPage(placeId, { limit: 10 }),
    ).resolves.toMatchObject({
      placeStatus: "active",
      summary: { averageRating: 4, ratingCount: 2, reviewCount: 1 },
      page: {
        items: [
          {
            id: createdA.feedback.id,
            author: { nickname: "甲同学" },
            rating: 5,
            content: "更新：空间安静，座位也充足。",
          },
        ],
        nextCursor: null,
      },
    });
  });

  it("enforces account eligibility, ownership, validation, and hard delete", async () => {
    const [publisher, owner, stranger, banned, incomplete, unverified] =
      await Promise.all([
        createActor(),
        createActor({ nickname: "评价作者" }),
        createActor(),
        createActor({ banned: true }),
        createActor({ withCredential: false }),
        createActor({ emailVerified: false }),
      ]);
    const placeId = await createPlace(publisher, "权限测试地点");
    const draft = {
      kind: "create" as const,
      placeId,
      rating: 4,
      content: "地点很好找。",
    };

    await expect(
      commandCampusMapPlaceFeedback(draft, { actorId: null }),
    ).resolves.toEqual({
      status: "authentication-required",
      code: "authentication-required",
    });
    await expect(
      commandCampusMapPlaceFeedback(draft, { actorId: banned }),
    ).resolves.toEqual({ status: "forbidden", code: "actor-banned" });
    await expect(
      commandCampusMapPlaceFeedback(draft, { actorId: incomplete }),
    ).resolves.toEqual({ status: "forbidden", code: "profile-incomplete" });
    await expect(
      commandCampusMapPlaceFeedback(draft, { actorId: unverified }),
    ).resolves.toEqual({ status: "forbidden", code: "actor-not-eligible" });
    await expect(
      commandCampusMapPlaceFeedback(
        { ...draft, rating: 0 },
        { actorId: owner },
      ),
    ).resolves.toEqual({
      status: "validation-failed",
      errors: [{ field: "rating", code: "invalid-rating" }],
    });

    const created = await commandCampusMapPlaceFeedback(draft, {
      actorId: owner,
    });
    if (created.status !== "created") throw new Error("feedback create failed");
    await expect(
      commandCampusMapPlaceFeedback(
        {
          kind: "update",
          feedbackId: created.feedback.id,
          expectedVersion: 1,
          rating: 1,
          content: "越权修改",
        },
        { actorId: stranger },
      ),
    ).resolves.toEqual({ status: "forbidden", code: "feedback-not-owned" });
    await expect(
      getCampusMapViewerPlaceFeedback(placeId, owner),
    ).resolves.toMatchObject({
      id: created.feedback.id,
      rating: 4,
      visibility: "public",
    });
    await expect(
      commandCampusMapPlaceFeedback(
        {
          kind: "delete",
          feedbackId: created.feedback.id,
          expectedVersion: 1,
        },
        { actorId: owner },
      ),
    ).resolves.toEqual({
      status: "deleted",
      feedbackId: created.feedback.id,
      placeId,
    });
    await expect(
      getCampusMapPlaceFeedbackSummaries([placeId]),
    ).resolves.toEqual({});
  });

  it("rejects forged command shapes and sensitive content before persistence", async () => {
    const actorId = randomUUID();
    const placeId = randomUUID();

    await expect(
      commandCampusMapPlaceFeedback(
        null as unknown as Parameters<typeof commandCampusMapPlaceFeedback>[0],
        { actorId },
      ),
    ).resolves.toEqual({
      status: "validation-failed",
      errors: [{ field: "command", code: "invalid-command" }],
    });
    await expect(
      commandCampusMapPlaceFeedback(
        {
          kind: "create",
          placeId,
          rating: 5,
          content: 42,
        } as unknown as Parameters<typeof commandCampusMapPlaceFeedback>[0],
        { actorId },
      ),
    ).resolves.toEqual({
      status: "validation-failed",
      errors: [{ field: "content", code: "invalid-content" }],
    });

    resetSensitiveMatcherForTests(["违禁样例词"]);
    await expect(
      commandCampusMapPlaceFeedback(
        {
          kind: "create",
          placeId,
          rating: 5,
          content: "包含违禁样例词",
        },
        { actorId },
      ),
    ).resolves.toEqual({
      status: "validation-failed",
      errors: [{ field: "content", code: "sensitive-content" }],
    });
  });

  it("fails public reads closed when a feedback visibility row is missing", async () => {
    const [publisher, author] = await Promise.all([
      createActor(),
      createActor({ nickname: "不可见评价作者" }),
    ]);
    const placeId = await createPlace(publisher, "缺少可见性测试地点");
    await pool.query(
      `insert into campus_map_place_feedback
         (id, place_id, user_id, rating, content, version, created_at, updated_at)
       values ($1, $2, $3, 5, '不应公开的评价', 1, now(), now())`,
      [randomUUID(), placeId, author],
    );

    await expect(
      getCampusMapPlaceFeedbackSummaries([placeId]),
    ).resolves.toEqual({});
    await expect(getCampusMapPlaceFeedbackPage(placeId)).resolves.toMatchObject(
      {
        placeStatus: "active",
        summary: { averageRating: null, ratingCount: 0, reviewCount: 0 },
        page: { items: [] },
      },
    );
    await expect(
      getCampusMapViewerPlaceFeedback(placeId, author),
    ).resolves.toBeNull();
  });

  it("keeps RLS enabled, public roles ungranted, and the keyset index aligned", async () => {
    const relations = await pool.query<{
      relname: string;
      relrowsecurity: boolean;
    }>(
      `select relname, relrowsecurity
       from pg_class
       where relname = any($1::text[])
       order by relname`,
      [["campus_map_place_feedback", "campus_map_place_feedback_visibility"]],
    );
    expect(relations.rows).toEqual([
      { relname: "campus_map_place_feedback", relrowsecurity: true },
      {
        relname: "campus_map_place_feedback_visibility",
        relrowsecurity: true,
      },
    ]);

    const grants = await pool.query<{ grantee: string }>(
      `select distinct grantee
       from information_schema.role_table_grants
       where table_name = any($1::text[])
         and grantee in ('anon', 'authenticated')`,
      [["campus_map_place_feedback", "campus_map_place_feedback_visibility"]],
    );
    expect(grants.rows).toEqual([]);

    const index = await pool.query<{ indexdef: string }>(
      `select indexdef
       from pg_indexes
       where indexname = 'campus_map_place_feedback_place_created_idx'`,
    );
    expect(index.rows[0]?.indexdef).toContain(
      "(place_id, created_at DESC NULLS LAST, id DESC NULLS LAST)",
    );
  });

  it("paginates written reviews with an opaque stable cursor", async () => {
    const publisher = await createActor();
    const placeId = await createPlace(publisher, "分页测试地点");
    const reviewers = await Promise.all([
      createActor({ nickname: "第一位" }),
      createActor({ nickname: "第二位" }),
      createActor({ nickname: "第三位" }),
    ]);
    for (const [index, actorId] of reviewers.entries()) {
      const result = await commandCampusMapPlaceFeedback(
        {
          kind: "create",
          placeId,
          rating: index + 3,
          content: `第 ${index + 1} 条评价`,
        },
        {
          actorId,
          now: new Date(`2026-08-31T00:0${index}:00.000Z`),
        },
      );
      expect(result.status).toBe("created");
    }

    const first = await getCampusMapPlaceFeedbackPage(placeId, { limit: 2 });
    expect(first.page).toMatchObject({
      items: [
        { author: { nickname: "第三位" } },
        { author: { nickname: "第二位" } },
      ],
      nextCursor: expect.any(String),
    });
    expect(first.page.nextCursor).not.toContain(first.page.items[1]!.id);
    const second = await getCampusMapPlaceFeedbackPage(placeId, {
      limit: 2,
      cursor: first.page.nextCursor,
    });
    expect(second.page).toEqual({
      items: [expect.objectContaining({ author: { nickname: "第一位" } })],
      nextCursor: null,
    });
  });

  it("reports and hides the whole feedback without leaking it into public reads", async () => {
    const [publisher, author, reporter, admin] = await Promise.all([
      createActor(),
      createActor({ nickname: "被举报作者" }),
      createActor({ nickname: "举报人" }),
      createActor({ role: "admin", nickname: "管理员" }),
    ]);
    const placeId = await createPlace(publisher, "审核测试地点");
    const created = await commandCampusMapPlaceFeedback(
      { kind: "create", placeId, rating: 5, content: "需要审核的整条评价" },
      { actorId: author },
    );
    if (created.status !== "created") throw new Error("feedback create failed");

    const reported = await commandCampusMapModeration(
      {
        kind: "report",
        idempotencyKey: randomUUID(),
        target: { kind: "place-feedback", id: created.feedback.id },
        signal: "harassment",
        details: "这条评价含有人身攻击，请管理员复核。",
        evidence: "仅管理员可见的证据",
      },
      { actorId: reporter, clientIp: "203.0.113.82" },
    );
    expect(reported).toMatchObject({ status: "reported" });
    if (reported.status !== "reported") throw new Error("report failed");

    await expect(
      commandCampusMapModeration(
        {
          kind: "hide-place-feedback",
          idempotencyKey: randomUUID(),
          feedbackId: created.feedback.id,
          expectedVisibility: "public",
          reason: "复核后隐藏整条评价",
          caseId: reported.caseId,
        },
        { actorId: reporter, clientIp: "203.0.113.82" },
      ),
    ).resolves.toEqual({ status: "forbidden", code: "admin-required" });

    const hidden = await commandCampusMapModeration(
      {
        kind: "hide-place-feedback",
        idempotencyKey: randomUUID(),
        feedbackId: created.feedback.id,
        expectedVisibility: "public",
        reason: "复核后隐藏整条评价",
        caseId: reported.caseId,
      },
      { actorId: admin, clientIp: "203.0.113.83" },
    );
    expect(hidden).toMatchObject({ status: "decided" });
    await expect(
      getCampusMapPlaceFeedbackSummaries([placeId]),
    ).resolves.toEqual({});
    await expect(getCampusMapPlaceFeedbackPage(placeId)).resolves.toMatchObject(
      {
        summary: { averageRating: null, ratingCount: 0, reviewCount: 0 },
        page: { items: [] },
      },
    );
    await expect(
      getCampusMapViewerPlaceFeedback(placeId, author),
    ).resolves.toMatchObject({
      id: created.feedback.id,
      visibility: "hidden",
      content: "需要审核的整条评价",
    });
    await expect(
      getCampusMapModerationTarget(
        { kind: "place-feedback", id: created.feedback.id },
        { actorId: admin },
      ),
    ).resolves.toMatchObject({
      status: "ok",
      payload: { content: "需要审核的整条评价", visibility: "hidden" },
    });

    const edited = await commandCampusMapPlaceFeedback(
      {
        kind: "update",
        feedbackId: created.feedback.id,
        expectedVersion: 1,
        rating: 2,
        content: "作者修改后仍需管理员复核",
      },
      { actorId: author },
    );
    expect(edited).toMatchObject({
      status: "updated",
      feedback: { visibility: "hidden", version: 2 },
    });
    await expect(
      getCampusMapPlaceFeedbackSummaries([placeId]),
    ).resolves.toEqual({});

    await expect(
      commandCampusMapModeration(
        {
          kind: "unhide-place-feedback",
          idempotencyKey: randomUUID(),
          feedbackId: created.feedback.id,
          expectedVisibility: "hidden",
          reason: "修改后已符合公开规范",
          caseId: reported.caseId,
        },
        { actorId: admin, clientIp: "203.0.113.83" },
      ),
    ).resolves.toMatchObject({ status: "decided" });
    await expect(
      getCampusMapPlaceFeedbackSummaries([placeId]),
    ).resolves.toEqual({
      [placeId]: {
        placeId,
        averageRating: 2,
        ratingCount: 1,
        reviewCount: 1,
      },
    });
  });

  it("keeps retired-place feedback readable while ordinary writes become read-only", async () => {
    const [admin, author, newReviewer] = await Promise.all([
      createActor({ role: "admin" }),
      createActor(),
      createActor(),
    ]);
    const placeId = await createPlace(admin, "已停用评价地点");
    const created = await commandCampusMapPlaceFeedback(
      { kind: "create", placeId, rating: 4, content: "停用前的公开评价" },
      { actorId: author },
    );
    if (created.status !== "created") throw new Error("feedback create failed");
    const baseRevisionId = await currentRevisionId(placeId);
    const retired = await governCampusMapFacts(
      {
        kind: "retire",
        idempotencyKey: randomUUID(),
        reason: "自动化测试确认地点停用",
        client: { name: "campus-map-feedback-test", version: "1" },
        placeId,
        baseRevisionId,
      },
      { actorId: admin, clientIp: "203.0.113.84" },
    );
    expect(retired).toMatchObject({ status: "published" });

    await expect(getCampusMapPlaceFeedbackPage(placeId)).resolves.toMatchObject(
      {
        placeStatus: "retired",
        summary: { averageRating: 4, ratingCount: 1, reviewCount: 1 },
        page: { items: [{ content: "停用前的公开评价" }] },
      },
    );
    await expect(
      commandCampusMapPlaceFeedback(
        {
          kind: "update",
          feedbackId: created.feedback.id,
          expectedVersion: 1,
          rating: 5,
          content: "停用后不得修改",
        },
        { actorId: author },
      ),
    ).resolves.toEqual({ status: "forbidden", code: "place-read-only" });
    await expect(
      commandCampusMapPlaceFeedback(
        { kind: "delete", feedbackId: created.feedback.id, expectedVersion: 1 },
        { actorId: author },
      ),
    ).resolves.toEqual({ status: "forbidden", code: "place-read-only" });
    await expect(
      commandCampusMapPlaceFeedback(
        { kind: "create", placeId, rating: 3, content: null },
        { actorId: newReviewer },
      ),
    ).resolves.toEqual({ status: "forbidden", code: "place-read-only" });
  });

  it("moves loser-only feedback on merge and keeps conflicts on the redirect tombstone", async () => {
    const [admin, loserOnlyUser, bothUser] = await Promise.all([
      createActor({ role: "admin" }),
      createActor({ nickname: "仅旧地点用户" }),
      createActor({ nickname: "两边都评价用户" }),
    ]);
    const survivorId = await createPlace(admin, "保留地点");
    const loserId = await createPlace(admin, "合并地点");
    const loserOnly = await commandCampusMapPlaceFeedback(
      { kind: "create", placeId: loserId, rating: 4, content: "旧地点评价" },
      { actorId: loserOnlyUser },
    );
    const survivorBoth = await commandCampusMapPlaceFeedback(
      {
        kind: "create",
        placeId: survivorId,
        rating: 5,
        content: "保留地点优先评价",
      },
      { actorId: bothUser },
    );
    const loserBoth = await commandCampusMapPlaceFeedback(
      { kind: "create", placeId: loserId, rating: 1, content: "冲突旧评价" },
      { actorId: bothUser },
    );
    if (
      loserOnly.status !== "created" ||
      survivorBoth.status !== "created" ||
      loserBoth.status !== "created"
    ) {
      throw new Error("merge feedback setup failed");
    }

    const merge: Extract<CampusMapFactGovernanceCommand, { kind: "merge" }> = {
      kind: "merge",
      idempotencyKey: randomUUID(),
      reason: "自动化测试确认重复地点",
      client: { name: "campus-map-feedback-test", version: "1" },
      survivor: {
        placeId: survivorId,
        baseRevisionId: await currentRevisionId(survivorId),
        fact: governanceFact("保留地点"),
        sources: [governanceSource()],
      },
      loser: {
        placeId: loserId,
        baseRevisionId: await currentRevisionId(loserId),
        sources: [governanceSource()],
      },
      fieldResolutions: mergeFieldResolutions,
    };
    await expect(
      governCampusMapFacts(merge, {
        actorId: admin,
        clientIp: "203.0.113.85",
      }),
    ).resolves.toMatchObject({ status: "published" });

    await expect(
      getCampusMapPlaceFeedbackSummaries([survivorId, loserId]),
    ).resolves.toEqual({
      [survivorId]: {
        placeId: survivorId,
        averageRating: 4.5,
        ratingCount: 2,
        reviewCount: 2,
      },
      [loserId]: {
        placeId: loserId,
        averageRating: 1,
        ratingCount: 1,
        reviewCount: 1,
      },
    });
    await expect(
      getCampusMapViewerPlaceFeedback(survivorId, loserOnlyUser),
    ).resolves.toMatchObject({
      id: loserOnly.feedback.id,
      placeId: survivorId,
    });
    await expect(
      getCampusMapViewerPlaceFeedback(loserId, bothUser),
    ).resolves.toMatchObject({ id: loserBoth.feedback.id, placeId: loserId });
    await expect(getCampusMapPlaceFeedbackPage(loserId)).resolves.toMatchObject(
      { placeStatus: "merged" },
    );
  });
});
