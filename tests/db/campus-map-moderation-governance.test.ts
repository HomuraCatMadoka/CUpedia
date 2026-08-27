import { randomUUID } from "node:crypto";

import { Pool } from "pg";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import {
  commandCampusMapModeration,
  getCampusMapModerationCase,
  getCampusMapModerationTarget,
  listCampusMapModerationQueue,
} from "@/lib/campus-map/moderation-governance";
import type { CampusMapModerationCommand } from "@/lib/campus-map/moderation-governance-contract";
import {
  commandCampusMapNote,
  deliverCampusMapNoteNotifications,
  getCampusMapNote,
  listCampusMapNotes,
} from "@/lib/campus-map/map-notes";

const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)("Campus Map moderation governance (#723)", () => {
  let pool: Pool;
  const actorIds: string[] = [];
  const noteIds: string[] = [];
  const eventIds: string[] = [];

  beforeAll(() => {
    pool = new Pool({ connectionString: process.env.DATABASE_URL });
  });

  async function createActor(role: "user" | "admin" = "user") {
    const actorId = randomUUID();
    actorIds.push(actorId);
    await pool.query(
      `insert into users (id, email, email_verified, nickname, role, banned)
       values ($1, $2, true, $3, $4, false)`,
      [
        actorId,
        `issue-723-${actorId}@cuhk.edu.hk`,
        role === "admin" ? "治理管理员" : "地图贡献者",
        role,
      ],
    );
    await pool.query(
      `insert into accounts (id, account_id, provider_id, user_id, password)
       values ($1, $2, 'credential', $3, 'test-credential')`,
      [randomUUID(), actorId, actorId],
    );
    return actorId;
  }

  function reportCommand(
    targetId: string,
    overrides: Partial<
      Extract<CampusMapModerationCommand, { kind: "report" }>
    > = {},
  ): Extract<CampusMapModerationCommand, { kind: "report" }> {
    return {
      kind: "report",
      idempotencyKey: randomUUID(),
      target: { kind: "actor", id: targetId },
      signal: "privacy",
      details: "该贡献记录可能公开了个人资料",
      evidence: "管理员私有证据",
      ...overrides,
    };
  }

  async function createNote(actorId: string, comment = "需要复核的公开备注") {
    const result = await commandCampusMapNote(
      {
        kind: "create",
        idempotencyKey: randomUUID(),
        placeId: null,
        position: { longitude: 114.2, latitude: 22.4, crs: "wgs84" },
        openingComment: comment,
      },
      { actorId, clientIp: "203.0.113.30" },
    );
    if (result.status !== "created") {
      throw new Error(`note create failed: ${JSON.stringify(result)}`);
    }
    noteIds.push(result.noteId);
    eventIds.push(result.eventId);
    return result;
  }

  async function waitForBlockedWrite(): Promise<void> {
    const deadline = Date.now() + 5_000;
    while (Date.now() < deadline) {
      const result = await pool.query<{ count: string }>(
        `select count(*)::text as count
           from pg_stat_activity
          where datname = current_database()
            and pid <> pg_backend_pid()
            and wait_event_type = 'Lock'
            and query like '%users%'`,
      );
      if (Number(result.rows[0]?.count ?? 0) > 0) return;
      await new Promise<void>((resolve) => setImmediate(resolve));
    }
    throw new Error("Timed out waiting for contributor authorization lock");
  }

  afterEach(async () => {
    const client = await pool.connect();
    await client.query("begin");
    await client.query("set local session_replication_role = replica");
    if (actorIds.length > 0) {
      await client.query(
        "delete from campus_map_moderation_requests where actor_id_snapshot = any($1::uuid[])",
        [actorIds],
      );
      await client.query(
        "delete from campus_map_moderation_decisions where actor_id_snapshot = any($1::uuid[])",
        [actorIds],
      );
      await client.query(
        "delete from campus_map_reports where reporter_id_snapshot = any($1::uuid[])",
        [actorIds],
      );
      await client.query(
        "delete from campus_map_moderation_cases where target_id = any($1::uuid[])",
        [[...actorIds, ...noteIds, ...eventIds]],
      );
      await client.query(
        "delete from campus_map_contributor_blocks where contributor_id_snapshot = any($1::uuid[]) or created_by_actor_id_snapshot = any($1::uuid[])",
        [actorIds],
      );
      await client.query(
        "delete from campus_map_note_requests where actor_id_snapshot = any($1::uuid[])",
        [actorIds],
      );
    }
    if (noteIds.length > 0) {
      await client.query(
        "delete from campus_map_note_outbox where note_id = any($1::uuid[])",
        [noteIds],
      );
      await client.query(
        "delete from campus_map_note_subscriptions where note_id = any($1::uuid[])",
        [noteIds],
      );
    }
    if (noteIds.length > 0) {
      await client.query(
        "delete from campus_map_note_event_visibility where event_id in (select id from campus_map_note_events where note_id = any($1::uuid[]))",
        [noteIds],
      );
      await client.query(
        "delete from campus_map_note_events where note_id = any($1::uuid[])",
        [noteIds],
      );
    }
    if (noteIds.length > 0) {
      await client.query(
        "delete from campus_map_note_visibility where note_id = any($1::uuid[])",
        [noteIds],
      );
      await client.query(
        "delete from campus_map_notes where id = any($1::uuid[])",
        [noteIds],
      );
    }
    if (actorIds.length > 0) {
      await client.query(
        "delete from accounts where user_id = any($1::uuid[])",
        [actorIds],
      );
      await client.query("delete from users where id = any($1::uuid[])", [
        actorIds,
      ]);
      actorIds.length = 0;
    }
    noteIds.length = 0;
    eventIds.length = 0;
    await client.query("commit");
    client.release();
    delete process.env.CAMPUS_MAP_REPORT_ACTOR_BURST_LIMIT;
  });

  afterAll(async () => {
    await pool.end();
  });

  it("keeps reports private, aggregates a target into one case, and replays idempotently", async () => {
    const [reporterA, reporterB, targetActor, admin] = await Promise.all([
      createActor(),
      createActor(),
      createActor(),
      createActor("admin"),
    ]);
    const command = reportCommand(targetActor);

    const first = await commandCampusMapModeration(command, {
      actorId: reporterA,
      clientIp: "203.0.113.1",
    });
    expect(first).toMatchObject({
      status: "reported",
      caseRevision: 1,
      caseStatus: "open",
    });
    if (first.status !== "reported") throw new Error("report failed");

    await expect(
      commandCampusMapModeration(command, {
        actorId: reporterA,
        clientIp: "203.0.113.1",
      }),
    ).resolves.toEqual(first);

    const second = await commandCampusMapModeration(
      reportCommand(targetActor, { signal: "vandalism", evidence: null }),
      { actorId: reporterB, clientIp: "203.0.113.2" },
    );
    expect(second).toMatchObject({
      status: "reported",
      caseId: first.caseId,
      caseRevision: 2,
    });

    await expect(
      getCampusMapModerationCase(first.caseId, { actorId: reporterA }),
    ).resolves.toEqual({ status: "forbidden", code: "admin-required" });

    const privateView = await getCampusMapModerationCase(first.caseId, {
      actorId: admin,
    });
    expect(privateView).toMatchObject({
      status: "ok",
      case: {
        target: { kind: "actor", id: targetActor },
        status: "open",
        revision: 2,
        reports: [
          {
            reporter: { id: reporterA },
            details: "该贡献记录可能公开了个人资料",
            evidence: "管理员私有证据",
          },
          { reporter: { id: reporterB }, signal: "vandalism" },
        ],
      },
    });

    await expect(
      listCampusMapModerationQueue(
        { signal: "privacy", status: "open" },
        { actorId: admin },
      ),
    ).resolves.toMatchObject({
      status: "ok",
      page: {
        items: [
          {
            kind: "case",
            id: first.caseId,
            target: { kind: "actor", id: targetActor },
            signal: "privacy",
          },
        ],
      },
    });

    await expect(
      commandCampusMapModeration(
        {
          kind: "block-contributor",
          idempotencyKey: randomUUID(),
          contributorId: reporterA,
          scope: "all",
          startsAt: new Date().toISOString(),
          endsAt: null,
          needsAcknowledgement: false,
          reason: "错误关联不得生效",
          caseId: first.caseId,
        },
        { actorId: admin, clientIp: "203.0.113.3" },
      ),
    ).resolves.toEqual({
      status: "validation-failed",
      errors: [{ code: "case-target-mismatch", field: "caseId" }],
    });
    const mismatchedBlocks = await pool.query(
      "select id from campus_map_contributor_blocks where contributor_id_snapshot = $1",
      [reporterA],
    );
    expect(mismatchedBlocks.rowCount).toBe(0);

    const secondTarget = await createActor();
    const anotherCase = await commandCampusMapModeration(
      reportCommand(secondTarget),
      { actorId: reporterA, clientIp: "203.0.113.9" },
    );
    expect(anotherCase).toMatchObject({ status: "reported" });
    const firstPage = await listCampusMapModerationQueue(
      { status: "open", limit: 1 },
      { actorId: admin },
    );
    expect(firstPage).toMatchObject({
      status: "ok",
      page: { items: [{ kind: "case" }], nextCursor: expect.any(String) },
    });
    if (firstPage.status !== "ok" || firstPage.page.nextCursor === null) {
      throw new Error("first moderation queue page missing cursor");
    }
    const secondPage = await listCampusMapModerationQueue(
      { status: "open", limit: 1, cursor: firstPage.page.nextCursor },
      { actorId: admin },
    );
    expect(secondPage).toMatchObject({ status: "ok", page: { items: [{}] } });
    if (secondPage.status !== "ok") throw new Error("queue read failed");
    expect(secondPage.page.items[0]?.id).not.toBe(firstPage.page.items[0]?.id);

    const resolved = await commandCampusMapModeration(
      {
        kind: "decide-case",
        idempotencyKey: randomUUID(),
        caseId: first.caseId,
        expectedRevision: 2,
        status: "resolved",
        reason: "证据已复核并处理",
        internalNote: "仅管理员可见的处理说明",
      },
      { actorId: admin, clientIp: "203.0.113.3" },
    );
    expect(resolved).toMatchObject({
      status: "decided",
      caseRevision: 3,
      caseStatus: "resolved",
    });
    await expect(
      commandCampusMapModeration(
        {
          kind: "decide-case",
          idempotencyKey: randomUUID(),
          caseId: first.caseId,
          expectedRevision: 2,
          status: "ignored",
          reason: "过时的并发决定",
          internalNote: null,
        },
        { actorId: admin, clientIp: "203.0.113.3" },
      ),
    ).resolves.toMatchObject({ status: "conflict", current: 3 });

    await expect(
      commandCampusMapModeration(reportCommand(targetActor), {
        actorId: reporterA,
        clientIp: "203.0.113.4",
      }),
    ).resolves.toMatchObject({
      status: "reported",
      caseRevision: 4,
      caseStatus: "reopened",
    });
  });

  it("hides one immutable Note event behind a stable public placeholder and can revoke it", async () => {
    const [author, admin] = await Promise.all([
      createActor(),
      createActor("admin"),
    ]);
    const created = await createNote(author, "private evidence marker");
    const notificationId = randomUUID();
    const pendingNotificationId = randomUUID();
    await pool.query(
      `insert into notifications (id, recipient_id, actor_id, kind, metadata)
       values ($1, $2, $3, 'campus_map_note_event', $4::jsonb)`,
      [
        notificationId,
        admin,
        author,
        JSON.stringify({ noteId: created.noteId, eventId: created.eventId }),
      ],
    );
    await pool.query(
      `insert into campus_map_note_outbox
         (id, note_id, event_id, recipient_user_id, status, available_at)
       values ($1, $2, $3, $4, 'pending', now())`,
      [pendingNotificationId, created.noteId, created.eventId, admin],
    );
    const hide = {
      kind: "hide-map-note-event",
      idempotencyKey: randomUUID(),
      eventId: created.eventId,
      expectedVisibility: "public",
      reason: "隐藏个人资料",
      caseId: null,
    } as const satisfies CampusMapModerationCommand;

    await expect(
      commandCampusMapModeration(
        { ...hide, idempotencyKey: randomUUID() },
        { actorId: author, clientIp: "203.0.113.4" },
      ),
    ).resolves.toEqual({ status: "forbidden", code: "admin-required" });

    const [winner, loser] = await Promise.all([
      commandCampusMapModeration(hide, {
        actorId: admin,
        clientIp: "203.0.113.5",
      }),
      commandCampusMapModeration(
        { ...hide, idempotencyKey: randomUUID() },
        { actorId: admin, clientIp: "203.0.113.6" },
      ),
    ]);
    expect([winner.status, loser.status].sort()).toEqual([
      "conflict",
      "decided",
    ]);
    const hiddenNotification = await pool.query<{ actor_id: string | null }>(
      "select actor_id from notifications where id = $1",
      [notificationId],
    );
    expect(hiddenNotification.rows).toEqual([{ actor_id: null }]);
    await expect(deliverCampusMapNoteNotifications()).resolves.toMatchObject({
      delivered: 1,
      failed: 0,
    });
    const projectedHiddenNotification = await pool.query<{
      actor_id: string | null;
    }>("select actor_id from notifications where id = $1", [
      pendingNotificationId,
    ]);
    expect(projectedHiddenNotification.rows).toEqual([{ actor_id: null }]);

    await expect(getCampusMapNote(created.noteId)).resolves.toMatchObject({
      id: created.noteId,
      author: { id: author },
      events: [
        {
          id: created.eventId,
          actor: { nickname: "内容已隐藏" },
          comment: null,
        },
      ],
    });
    await expect(
      listCampusMapNotes({ scope: { kind: "search", text: "private" } }),
    ).resolves.toEqual({ items: [], nextCursor: null });
    await expect(
      getCampusMapModerationTarget(
        { kind: "map-note-event", id: created.eventId },
        { actorId: author },
      ),
    ).resolves.toEqual({ status: "forbidden", code: "admin-required" });
    await expect(
      getCampusMapModerationTarget(
        { kind: "map-note-event", id: created.eventId },
        { actorId: admin },
      ),
    ).resolves.toMatchObject({
      status: "ok",
      payload: { comment: "private evidence marker" },
    });

    await expect(
      commandCampusMapModeration(
        {
          kind: "unhide-map-note-event",
          idempotencyKey: randomUUID(),
          eventId: created.eventId,
          expectedVisibility: "hidden",
          reason: "复核后确认可以恢复公开",
          caseId: null,
        },
        { actorId: admin, clientIp: "203.0.113.7" },
      ),
    ).resolves.toMatchObject({ status: "decided" });
    await expect(getCampusMapNote(created.noteId)).resolves.toMatchObject({
      events: [{ comment: "private evidence marker" }],
    });
    await expect(
      listCampusMapNotes({ scope: { kind: "search", text: "private" } }),
    ).resolves.toMatchObject({ items: [{ id: created.noteId }] });

    await expect(
      commandCampusMapModeration(
        {
          kind: "hide-map-note",
          idempotencyKey: randomUUID(),
          noteId: created.noteId,
          expectedVisibility: "public",
          reason: "整条备注需要暂时隐藏",
          caseId: null,
        },
        { actorId: admin, clientIp: "203.0.113.12" },
      ),
    ).resolves.toMatchObject({ status: "decided" });
    await expect(getCampusMapNote(created.noteId)).resolves.toMatchObject({
      status: "moderator-hidden",
      author: { nickname: "内容已隐藏" },
      events: [{ comment: null }],
    });
    await expect(
      listCampusMapNotes({ scope: { kind: "recent" } }),
    ).resolves.toEqual({ items: [], nextCursor: null });
    await expect(
      commandCampusMapModeration(
        {
          kind: "unhide-map-note",
          idempotencyKey: randomUUID(),
          noteId: created.noteId,
          expectedVisibility: "hidden",
          reason: "整条备注恢复公开",
          caseId: null,
        },
        { actorId: admin, clientIp: "203.0.113.13" },
      ),
    ).resolves.toMatchObject({ status: "decided" });
    await expect(getCampusMapNote(created.noteId)).resolves.toMatchObject({
      status: "open",
      author: { id: author },
      events: [{ comment: "private evidence marker" }],
    });

    const decisions = await pool.query(
      "select command_kind from campus_map_moderation_decisions order by created_at, id",
    );
    expect(decisions.rows.map((row) => row.command_kind)).toEqual([
      "hide-map-note-event",
      "unhide-map-note-event",
      "hide-map-note",
      "unhide-map-note",
    ]);
    const riskPage = await listCampusMapModerationQueue(
      { signal: "recent-high-risk-event", limit: 1 },
      { actorId: admin },
    );
    expect(riskPage).toMatchObject({
      status: "ok",
      page: { items: [{}], nextCursor: expect.any(String) },
    });
    if (riskPage.status !== "ok" || riskPage.page.nextCursor === null) {
      throw new Error("high-risk queue cursor missing");
    }
    const nextRiskPage = await listCampusMapModerationQueue(
      {
        signal: "recent-high-risk-event",
        limit: 1,
        cursor: riskPage.page.nextCursor,
      },
      { actorId: admin },
    );
    expect(nextRiskPage).toMatchObject({ status: "ok", page: { items: [{}] } });
    if (nextRiskPage.status !== "ok") throw new Error("queue read failed");
    expect(nextRiskPage.page.items[0]?.id).not.toBe(riskPage.page.items[0]?.id);
    await expect(
      pool.query(
        "update campus_map_moderation_decisions set reason = 'rewritten'",
      ),
    ).rejects.toMatchObject({ code: "23514" });
  });

  it("enforces scoped contributor blocks at the Map Notes transaction boundary", async () => {
    const [contributor, admin] = await Promise.all([
      createActor(),
      createActor("admin"),
    ]);
    const beforeBlock = await createNote(contributor);
    const startsAt = new Date("2026-08-27T00:00:00.000Z");
    await expect(
      commandCampusMapModeration(
        {
          kind: "block-contributor",
          idempotencyKey: randomUUID(),
          contributorId: contributor,
          scope: "map-notes",
          startsAt: new Date(startsAt.getTime() - 10_000).toISOString(),
          endsAt: new Date(startsAt.getTime() - 5_000).toISOString(),
          needsAcknowledgement: false,
          reason: "已经到期的限制",
          caseId: null,
        },
        { actorId: admin, clientIp: "203.0.113.7", now: startsAt },
      ),
    ).resolves.toMatchObject({ status: "decided" });
    await expect(
      commandCampusMapNote(
        {
          kind: "comment",
          idempotencyKey: randomUUID(),
          noteId: beforeBlock.noteId,
          comment: "到期限制不会阻止写入",
        },
        { actorId: contributor, clientIp: "203.0.113.8", now: startsAt },
      ),
    ).resolves.toMatchObject({ status: "commented" });
    const lock = await pool.connect();
    await lock.query("begin");
    await lock.query("select id from users where id = $1 for update", [
      contributor,
    ]);
    const blockPromise = commandCampusMapModeration(
      {
        kind: "block-contributor",
        idempotencyKey: randomUUID(),
        contributorId: contributor,
        scope: "map-notes",
        startsAt: startsAt.toISOString(),
        endsAt: null,
        needsAcknowledgement: true,
        reason: "暂停地图备注贡献",
        caseId: null,
      },
      { actorId: admin, clientIp: "203.0.113.8", now: startsAt },
    );
    await waitForBlockedWrite();
    const racedComment = commandCampusMapNote(
      {
        kind: "comment",
        idempotencyKey: randomUUID(),
        noteId: beforeBlock.noteId,
        comment: "并发封禁后不应写入",
      },
      {
        actorId: contributor,
        clientIp: "203.0.113.9",
        now: new Date(startsAt.getTime() + 1_000),
      },
    );
    await lock.query("commit");
    lock.release();
    const blocked = await blockPromise;
    expect(blocked).toMatchObject({
      status: "decided",
      blockId: expect.any(String),
    });
    if (blocked.status !== "decided" || !blocked.blockId) {
      throw new Error("block failed");
    }
    await expect(
      commandCampusMapModeration(
        {
          kind: "block-contributor",
          idempotencyKey: randomUUID(),
          contributorId: contributor,
          scope: "all",
          startsAt: startsAt.toISOString(),
          endsAt: null,
          needsAcknowledgement: false,
          reason: "重叠限制不得产生含糊审计",
          caseId: null,
        },
        { actorId: admin, clientIp: "203.0.113.8", now: startsAt },
      ),
    ).resolves.toMatchObject({
      status: "conflict",
      expected: "no-overlapping-block",
      current: blocked.blockId,
    });
    await expect(racedComment).resolves.toEqual({
      status: "forbidden",
      code: "contributor-blocked",
    });
    await expect(
      commandCampusMapNote(
        {
          kind: "comment",
          idempotencyKey: randomUUID(),
          noteId: beforeBlock.noteId,
          comment: "封禁后不应写入",
        },
        {
          actorId: contributor,
          clientIp: "203.0.113.9",
          now: new Date(startsAt.getTime() + 1_000),
        },
      ),
    ).resolves.toEqual({ status: "forbidden", code: "contributor-blocked" });
    const preserved = await getCampusMapNote(beforeBlock.noteId);
    expect(preserved).toMatchObject({ author: { id: contributor } });
    expect(preserved?.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: beforeBlock.eventId }),
      ]),
    );
    expect(preserved?.events.map((event) => event.comment)).not.toContain(
      "封禁后不应写入",
    );

    await expect(
      commandCampusMapModeration(
        {
          kind: "revoke-contributor-block",
          idempotencyKey: randomUUID(),
          blockId: blocked.blockId,
          reason: "限制期已结束",
          caseId: null,
        },
        {
          actorId: admin,
          clientIp: "203.0.113.10",
          now: new Date(startsAt.getTime() + 2_000),
        },
      ),
    ).resolves.toMatchObject({ status: "decided" });
    await expect(
      commandCampusMapNote(
        {
          kind: "comment",
          idempotencyKey: randomUUID(),
          noteId: beforeBlock.noteId,
          comment: "解除后可以继续",
        },
        {
          actorId: contributor,
          clientIp: "203.0.113.11",
          now: new Date(startsAt.getTime() + 3_000),
        },
      ),
    ).resolves.toMatchObject({ status: "commented" });
  });

  it("rate-limits private reports without using idempotency as an abuse bypass", async () => {
    const [reporter, targetActor] = await Promise.all([
      createActor(),
      createActor(),
    ]);
    process.env.CAMPUS_MAP_REPORT_ACTOR_BURST_LIMIT = "1";
    const command = reportCommand(targetActor);
    await expect(
      commandCampusMapModeration(command, {
        actorId: reporter,
        clientIp: "203.0.113.40",
      }),
    ).resolves.toMatchObject({ status: "reported" });
    await expect(
      commandCampusMapModeration(command, {
        actorId: reporter,
        clientIp: "203.0.113.40",
      }),
    ).resolves.toMatchObject({
      status: "rate-limited",
      code: "moderation-report-rate-limit",
      scope: "actor",
      policy: "burst",
    });
    delete process.env.CAMPUS_MAP_REPORT_ACTOR_BURST_LIMIT;
  });
});
