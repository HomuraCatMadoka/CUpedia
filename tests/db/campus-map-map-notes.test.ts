import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import {
  commandCampusMapNote,
  deliverCampusMapNoteNotifications,
  dispatchCampusMapNoteOutbox,
  getCampusMapNote,
  listCampusMapNotes,
  setCampusMapNoteSubscription,
} from "@/lib/campus-map/map-notes";
import type { CampusMapNoteCommand } from "@/lib/campus-map/map-notes-contract";

const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)("Campus Map Notes service (#722)", () => {
  let pool: Pool;
  const actorIds: string[] = [];
  const placeIds: string[] = [];
  const changesetIds: string[] = [];

  beforeAll(() => {
    pool = new Pool({ connectionString: process.env.DATABASE_URL });
  });

  async function createActor(input?: {
    banned?: boolean;
    nickname?: string;
    credential?: boolean;
  }) {
    const actorId = randomUUID();
    actorIds.push(actorId);
    await pool.query(
      `insert into users (id, email, email_verified, nickname, role, banned)
       values ($1, $2, true, $3, 'user', $4)`,
      [
        actorId,
        `issue-722-${actorId}@cuhk.edu.hk`,
        input?.nickname ?? "地图备注员",
        input?.banned ?? false,
      ],
    );
    if (input?.credential !== false) {
      await pool.query(
        `insert into accounts (id, account_id, provider_id, user_id, password)
         values ($1, $2, 'credential', $3, 'test-credential')`,
        [randomUUID(), actorId, actorId],
      );
    }
    return actorId;
  }

  async function createPlace() {
    const placeId = randomUUID();
    placeIds.push(placeId);
    await pool.query("insert into campus_map_places (id) values ($1)", [
      placeId,
    ]);
    return placeId;
  }

  async function createChangeset(actorId: string) {
    const changesetId = randomUUID();
    changesetIds.push(changesetId);
    await pool.query(
      `insert into campus_map_changesets (
         id, actor_user_id, actor_id_snapshot, actor_nickname_snapshot,
         comment, source_summary, review_requested, client_name, client_version,
         affected_count, created_count, updated_count, retired_count,
         restored_count, merged_count
       ) values ($1, $2, $2, '地图备注员', '修正地图备注', '测试来源', false,
         'map-note-test', '1', 1, 1, 0, 0, 0, 0)`,
      [changesetId, actorId],
    );
    return changesetId;
  }

  function createCommand(input?: {
    placeId?: string | null;
    longitude?: number;
    latitude?: number;
    comment?: string;
  }): Extract<CampusMapNoteCommand, { kind: "create" }> {
    return {
      kind: "create",
      idempotencyKey: randomUUID(),
      placeId: input?.placeId ?? null,
      position:
        input?.longitude === undefined || input.latitude === undefined
          ? null
          : {
              longitude: input.longitude,
              latitude: input.latitude,
              crs: "wgs84",
            },
      openingComment: input?.comment ?? "water fountain marker needs checking",
    };
  }

  function context(actorId: string, ipSuffix = 1) {
    return { actorId, clientIp: `203.0.113.${ipSuffix}` };
  }

  async function createNote(
    actorId: string,
    command = createCommand({ longitude: 114.2, latitude: 22.4 }),
  ) {
    const result = await commandCampusMapNote(command, context(actorId));
    if (result.status !== "created") {
      throw new Error(`note create failed: ${JSON.stringify(result)}`);
    }
    return { result, command };
  }

  async function cleanup() {
    const client = await pool.connect();
    await client.query("begin");
    try {
      await client.query("set local session_replication_role = replica");
      await client.query("delete from campus_map_note_outbox");
      await client.query("delete from campus_map_note_subscriptions");
      await client.query("delete from campus_map_note_requests");
      await client.query("delete from campus_map_note_events");
      await client.query("delete from campus_map_notes");
      await client.query("delete from campus_map_note_rate_limits");
      if (changesetIds.length > 0) {
        await client.query(
          "delete from campus_map_changesets where id = any($1::uuid[])",
          [changesetIds],
        );
      }
      if (placeIds.length > 0) {
        await client.query(
          "delete from campus_map_places where id = any($1::uuid[])",
          [placeIds],
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
      }
      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
      actorIds.length = 0;
      placeIds.length = 0;
      changesetIds.length = 0;
      delete process.env.CAMPUS_MAP_NOTE_ACTOR_BURST_LIMIT;
      delete process.env.CAMPUS_MAP_NOTE_IP_BURST_LIMIT;
    }
  }

  afterEach(cleanup);
  afterAll(async () => {
    await cleanup();
    await pool.end();
  });

  it("atomically creates a Place/WGS84 note with its opening event and subscription", async () => {
    const actorId = await createActor();
    const placeId = await createPlace();
    const command = createCommand({
      placeId,
      longitude: 114.207,
      latitude: 22.419,
      comment: "  marker should be beside the entrance  ",
    });

    const created = await commandCampusMapNote(command, context(actorId));

    expect(created).toMatchObject({ status: "created", revision: 1 });
    if (created.status !== "created") throw new Error("create failed");
    await expect(
      getCampusMapNote(created.noteId, actorId),
    ).resolves.toMatchObject({
      id: created.noteId,
      placeId,
      position: { longitude: 114.207, latitude: 22.419, crs: "wgs84" },
      status: "open",
      revision: 1,
      subscribed: true,
      events: [
        {
          id: created.eventId,
          revision: 1,
          kind: "opening-comment",
          comment: "marker should be beside the entrance",
        },
      ],
    });
    const counts = await pool.query<{ notes: string; events: string }>(
      `select
         (select count(*) from campus_map_notes)::text as notes,
         (select count(*) from campus_map_note_events)::text as events`,
    );
    expect(counts.rows[0]).toEqual({ notes: "1", events: "1" });
  });

  it("fails invalid context and fresh authorization without partial rows", async () => {
    const [bannedId, incompleteId] = await Promise.all([
      createActor({ banned: true }),
      createActor({ credential: false }),
    ]);
    await expect(
      commandCampusMapNote(createCommand(), {
        actorId: null,
        clientIp: "203.0.113.2",
      }),
    ).resolves.toEqual({
      status: "authentication-required",
      code: "authentication-required",
    });
    await expect(
      commandCampusMapNote(createCommand(), context(bannedId, 2)),
    ).resolves.toEqual({ status: "forbidden", code: "actor-banned" });
    await expect(
      commandCampusMapNote(createCommand(), context(incompleteId, 3)),
    ).resolves.toEqual({ status: "forbidden", code: "profile-incomplete" });
    await expect(
      commandCampusMapNote(createCommand(), context(await createActor(), 4)),
    ).resolves.toMatchObject({
      status: "validation-failed",
      errors: [{ code: "note-context-required" }],
    });
    const count = await pool.query<{ count: string }>(
      "select count(*)::text as count from campus_map_notes",
    );
    expect(count.rows[0]?.count).toBe("0");
  });

  it("returns a typed validation result for malformed server-action input", async () => {
    const actorId = await createActor();

    await expect(
      commandCampusMapNote(
        null as unknown as CampusMapNoteCommand,
        context(actorId, 17),
      ),
    ).resolves.toEqual({
      status: "validation-failed",
      errors: [{ code: "invalid-command", field: "command" }],
    });
    const count = await pool.query<{ count: string }>(
      "select count(*)::text as count from campus_map_notes",
    );
    expect(count.rows[0]?.count).toBe("0");
  });

  it("appends comments, auto-subscribes commenters, and honors unsubscribe", async () => {
    const [authorId, commenterId] = await Promise.all([
      createActor(),
      createActor(),
    ]);
    const { result: created } = await createNote(authorId);

    const commented = await commandCampusMapNote(
      {
        kind: "comment",
        idempotencyKey: randomUUID(),
        noteId: created.noteId,
        comment: "I checked this today.",
      },
      context(commenterId, 5),
    );

    expect(commented).toMatchObject({ status: "commented", revision: 2 });
    await expect(
      getCampusMapNote(created.noteId, commenterId),
    ).resolves.toMatchObject({
      subscribed: true,
      events: [{ revision: 1 }, { revision: 2, kind: "comment" }],
    });
    const recipients = await pool.query<{ recipient_user_id: string }>(
      "select recipient_user_id from campus_map_note_outbox",
    );
    expect(recipients.rows).toEqual([{ recipient_user_id: authorId }]);
    await expect(
      setCampusMapNoteSubscription(created.noteId, false, commenterId),
    ).resolves.toEqual({ status: "unsubscribed" });
    await expect(
      getCampusMapNote(created.noteId, commenterId),
    ).resolves.toMatchObject({
      subscribed: false,
    });
  });

  it("uses revision CAS so concurrent resolve commands fail closed", async () => {
    const [authorId, resolverA, resolverB] = await Promise.all([
      createActor(),
      createActor(),
      createActor(),
    ]);
    const { result: created } = await createNote(authorId);
    const resolve = (actorId: string, ip: number) =>
      commandCampusMapNote(
        {
          kind: "resolve",
          idempotencyKey: randomUUID(),
          noteId: created.noteId,
          expectedRevision: 1,
          resolution: { reason: "not-an-issue", resolvedByChangesetId: null },
          comment: "Checked against the current map.",
        },
        context(actorId, ip),
      );

    const results = await Promise.all([
      resolve(resolverA, 6),
      resolve(resolverB, 7),
    ]);

    expect(
      results.filter((result) => result.status === "resolved"),
    ).toHaveLength(1);
    expect(
      results.filter((result) => result.status === "conflict"),
    ).toHaveLength(1);
    await expect(getCampusMapNote(created.noteId)).resolves.toMatchObject({
      status: "closed",
      revision: 2,
      events: [{ revision: 1 }, { revision: 2, kind: "resolve" }],
    });
  });

  it("records structured resolution links and requires explicit reopen", async () => {
    const actorId = await createActor();
    const changesetId = await createChangeset(actorId);
    const { result: created } = await createNote(actorId);
    const resolved = await commandCampusMapNote(
      {
        kind: "resolve",
        idempotencyKey: randomUUID(),
        noteId: created.noteId,
        expectedRevision: 1,
        resolution: { reason: "fixed", resolvedByChangesetId: changesetId },
        comment: null,
      },
      context(actorId, 8),
    );
    expect(resolved).toMatchObject({ status: "resolved", revision: 2 });
    const reopened = await commandCampusMapNote(
      {
        kind: "reopen",
        idempotencyKey: randomUUID(),
        noteId: created.noteId,
        expectedRevision: 2,
        comment: "The correction did not cover the second marker.",
      },
      context(actorId, 8),
    );
    expect(reopened).toMatchObject({ status: "reopened", revision: 3 });
    await expect(getCampusMapNote(created.noteId)).resolves.toMatchObject({
      status: "open",
      events: [
        { revision: 1 },
        {
          revision: 2,
          resolution: { reason: "fixed", resolvedByChangesetId: changesetId },
        },
        { revision: 3, kind: "reopen" },
      ],
    });
  });

  it("replays exact idempotent results and rejects key reuse with another payload", async () => {
    const actorId = await createActor();
    const command = createCommand({ longitude: 114.2, latitude: 22.4 });
    const first = await commandCampusMapNote(command, context(actorId, 9));
    const replay = await commandCampusMapNote(
      { ...command, idempotencyKey: command.idempotencyKey.toUpperCase() },
      context(actorId, 9),
    );
    expect(replay).toEqual(first);
    await expect(
      commandCampusMapNote(
        { ...command, openingComment: "different payload" },
        context(actorId, 9),
      ),
    ).resolves.toMatchObject({
      status: "validation-failed",
      errors: [{ code: "idempotency-key-reused" }],
    });
    const count = await pool.query<{ count: string }>(
      "select count(*)::text as count from campus_map_notes",
    );
    expect(count.rows[0]?.count).toBe("1");
  });

  it("serializes concurrent retries of one idempotency key", async () => {
    const actorId = await createActor();
    const command = createCommand({ longitude: 114.2, latitude: 22.4 });

    const [first, second] = await Promise.all([
      commandCampusMapNote(command, context(actorId, 14)),
      commandCampusMapNote(command, context(actorId, 14)),
    ]);

    expect(first).toEqual(second);
    expect(first.status).toBe("created");
    const counts = await pool.query<{ notes: string; events: string }>(
      `select
         (select count(*) from campus_map_notes)::text as notes,
         (select count(*) from campus_map_note_events)::text as events`,
    );
    expect(counts.rows[0]).toEqual({ notes: "1", events: "1" });
  });

  it("does not let idempotency bypass actor/IP abuse limits", async () => {
    process.env.CAMPUS_MAP_NOTE_ACTOR_BURST_LIMIT = "1";
    const actorId = await createActor();
    const command = createCommand({ longitude: 114.2, latitude: 22.4 });
    await expect(
      commandCampusMapNote(command, context(actorId, 10)),
    ).resolves.toMatchObject({
      status: "created",
    });
    await expect(
      commandCampusMapNote(command, context(actorId, 10)),
    ).resolves.toMatchObject({
      status: "rate-limited",
      scope: "actor",
      policy: "burst",
      retryAfter: expect.any(Number),
    });
  });

  it("uses a fixed actor-to-IP lock order under a shared-IP race", async () => {
    process.env.CAMPUS_MAP_NOTE_IP_BURST_LIMIT = "1";
    const [actorA, actorB] = await Promise.all([createActor(), createActor()]);
    const results = await Promise.all([
      commandCampusMapNote(
        createCommand({ longitude: 114.2, latitude: 22.4 }),
        context(actorA, 15),
      ),
      commandCampusMapNote(
        createCommand({ longitude: 114.21, latitude: 22.41 }),
        context(actorB, 15),
      ),
    ]);

    expect(
      results.filter((result) => result.status === "created"),
    ).toHaveLength(1);
    expect(
      results.filter((result) => result.status === "rate-limited"),
    ).toEqual([expect.objectContaining({ scope: "ip", policy: "burst" })]);
  });

  it("supports safe Place, bbox, author, status, search, and cursor queries", async () => {
    const actorId = await createActor();
    const placeId = await createPlace();
    const first = await createNote(
      actorId,
      createCommand({
        placeId,
        longitude: 114.2,
        latitude: 22.4,
        comment: "printer toner is empty",
      }),
    );
    await createNote(
      actorId,
      createCommand({
        longitude: 114.25,
        latitude: 22.45,
        comment: "water fountain context",
      }),
    );
    await commandCampusMapNote(
      {
        kind: "resolve",
        idempotencyKey: randomUUID(),
        noteId: first.result.noteId,
        expectedRevision: 1,
        resolution: { reason: "fixed", resolvedByChangesetId: null },
        comment: null,
      },
      context(actorId, 11),
    );

    await expect(
      listCampusMapNotes({ scope: { kind: "place", placeId } }),
    ).resolves.toMatchObject({ items: [{ id: first.result.noteId }] });
    await expect(
      listCampusMapNotes({
        scope: {
          kind: "bbox",
          west: 114.19,
          south: 22.39,
          east: 114.21,
          north: 22.41,
        },
        status: "closed",
      }),
    ).resolves.toMatchObject({
      items: [{ id: first.result.noteId, status: "closed" }],
    });
    await expect(
      listCampusMapNotes({ scope: { kind: "author", actorId }, limit: 1 }),
    ).resolves.toMatchObject({
      items: [{ author: { id: actorId } }],
      nextCursor: expect.any(String),
    });
    await expect(
      listCampusMapNotes({ scope: { kind: "search", text: "toner" } }),
    ).resolves.toMatchObject({ items: [{ id: first.result.noteId }] });
    const firstPage = await listCampusMapNotes({
      scope: { kind: "recent" },
      limit: 1,
    });
    const secondPage = await listCampusMapNotes({
      scope: { kind: "recent" },
      limit: 1,
      cursor: firstPage.nextCursor!,
    });
    expect(firstPage.items[0]?.id).not.toBe(secondPage.items[0]?.id);
  });

  it("delivers outbox after commit and records failure without rolling back events", async () => {
    const [authorId, commenterId] = await Promise.all([
      createActor(),
      createActor(),
    ]);
    const { result: created } = await createNote(authorId);
    const commented = await commandCampusMapNote(
      {
        kind: "comment",
        idempotencyKey: randomUUID(),
        noteId: created.noteId,
        comment: "notify the author",
      },
      context(commenterId, 12),
    );
    expect(commented.status).toBe("commented");

    await expect(
      dispatchCampusMapNoteOutbox(async () => {
        throw new Error("notification provider unavailable");
      }),
    ).resolves.toEqual({ delivered: 0, failed: 1 });
    await expect(getCampusMapNote(created.noteId)).resolves.toMatchObject({
      revision: 2,
      events: [{ revision: 1 }, { revision: 2 }],
    });
    const outbox = await pool.query<{ status: string; attempt_count: number }>(
      "select status, attempt_count from campus_map_note_outbox",
    );
    expect(outbox.rows).toEqual([{ status: "failed", attempt_count: 1 }]);
  });

  it("delivers an outbox event into the shared notification inbox exactly once", async () => {
    const [authorId, commenterId] = await Promise.all([
      createActor(),
      createActor({ nickname: "现场核对员" }),
    ]);
    const { result: created } = await createNote(authorId);
    const commented = await commandCampusMapNote(
      {
        kind: "comment",
        idempotencyKey: randomUUID(),
        noteId: created.noteId,
        comment: "The entrance position is confirmed.",
      },
      context(commenterId, 13),
    );
    if (commented.status !== "commented") throw new Error("comment failed");

    const beforeDelivery = await pool.query<{ count: string }>(
      "select count(*)::text as count from notifications where recipient_id = $1",
      [authorId],
    );
    expect(beforeDelivery.rows).toEqual([{ count: "0" }]);

    await expect(deliverCampusMapNoteNotifications()).resolves.toEqual({
      delivered: 1,
      failed: 0,
    });
    await expect(deliverCampusMapNoteNotifications()).resolves.toEqual({
      delivered: 0,
      failed: 0,
    });

    const inbox = await pool.query<{
      id: string;
      recipient_id: string;
      actor_id: string;
      kind: string;
      metadata: { noteId: string; eventId: string };
    }>(
      `select id, recipient_id, actor_id, kind, metadata
       from notifications
       where recipient_id = $1`,
      [authorId],
    );
    expect(inbox.rows).toEqual([
      {
        id: expect.any(String),
        recipient_id: authorId,
        actor_id: commenterId,
        kind: "campus_map_note_event",
        metadata: { noteId: created.noteId, eventId: commented.eventId },
      },
    ]);
  });

  it("reclaims an expired outbox delivery lease after a worker stops", async () => {
    const [authorId, commenterId] = await Promise.all([
      createActor(),
      createActor(),
    ]);
    const { result: created } = await createNote(authorId);
    await commandCampusMapNote(
      {
        kind: "comment",
        idempotencyKey: randomUUID(),
        noteId: created.noteId,
        comment: "queue a notification",
      },
      context(commenterId, 16),
    );
    await pool.query(
      `update campus_map_note_outbox
       set status = 'processing', available_at = now() - interval '1 minute'`,
    );
    const delivered: string[] = [];

    await expect(
      dispatchCampusMapNoteOutbox(async (message) => {
        delivered.push(message.id);
      }),
    ).resolves.toEqual({ delivered: 1, failed: 0 });
    expect(delivered).toHaveLength(1);
  });

  it("enforces context constraints and immutable event history in PostgreSQL", async () => {
    const actorId = await createActor();
    await expect(
      pool.query(
        `insert into campus_map_notes (
           place_id, longitude, latitude, author_user_id, author_id_snapshot,
           author_nickname_snapshot, search_document
         ) values (null, 114.2, null, $1, $1, '测试', 'invalid')`,
        [actorId],
      ),
    ).rejects.toMatchObject({ code: "23514" });
    const { result: created } = await createNote(actorId);
    await expect(
      pool.query(
        "update campus_map_note_events set comment = 'rewritten' where id = $1",
        [created.eventId],
      ),
    ).rejects.toMatchObject({
      code: "23514",
      message: expect.stringContaining("append-only"),
    });
    await expect(
      pool.query("delete from campus_map_note_events where id = $1", [
        created.eventId,
      ]),
    ).rejects.toMatchObject({ code: "23514" });
  });

  it("keeps a moderator-hidden deep link while returning only safe placeholders", async () => {
    const actorId = await createActor({ nickname: "不应公开的作者" });
    const { result: created } = await createNote(
      actorId,
      createCommand({
        longitude: 114.2,
        latitude: 22.4,
        comment: "不应公开的现场资料",
      }),
    );
    await pool.query(
      "update campus_map_notes set status = 'moderator-hidden' where id = $1",
      [created.noteId],
    );

    await expect(getCampusMapNote(created.noteId)).resolves.toMatchObject({
      id: created.noteId,
      status: "moderator-hidden",
      author: { nickname: "内容已隐藏" },
      events: [
        {
          id: created.eventId,
          actor: { nickname: "内容已隐藏" },
          comment: null,
          resolution: null,
        },
      ],
    });
    await expect(
      listCampusMapNotes({ scope: { kind: "recent" } }),
    ).resolves.toEqual({ items: [], nextCursor: null });
  });

  it("rejects every public mutation after a moderator hides a note", async () => {
    const actorId = await createActor();
    const { result: created } = await createNote(actorId);
    await pool.query(
      "update campus_map_notes set status = 'moderator-hidden' where id = $1",
      [created.noteId],
    );

    const results = await Promise.all([
      commandCampusMapNote(
        {
          kind: "comment",
          idempotencyKey: randomUUID(),
          noteId: created.noteId,
          comment: "must stay hidden",
        },
        context(actorId, 21),
      ),
      commandCampusMapNote(
        {
          kind: "resolve",
          idempotencyKey: randomUUID(),
          noteId: created.noteId,
          expectedRevision: 1,
          resolution: { reason: "fixed", resolvedByChangesetId: null },
          comment: null,
        },
        context(actorId, 22),
      ),
      commandCampusMapNote(
        {
          kind: "reopen",
          idempotencyKey: randomUUID(),
          noteId: created.noteId,
          expectedRevision: 1,
          comment: "must stay hidden",
        },
        context(actorId, 23),
      ),
    ]);

    expect(results).toEqual([
      { status: "forbidden", code: "note-hidden" },
      { status: "forbidden", code: "note-hidden" },
      { status: "forbidden", code: "note-hidden" },
    ]);
    const unchanged = await pool.query<{ revision: number; events: string }>(
      `select n.revision, count(e.id)::text as events
       from campus_map_notes n
       join campus_map_note_events e on e.note_id = n.id
       where n.id = $1
       group by n.revision`,
      [created.noteId],
    );
    expect(unchanged.rows).toEqual([{ revision: 1, events: "1" }]);
  });

  it("preserves event snapshots when an actor account is deleted", async () => {
    const actorId = await createActor({ nickname: "离站贡献者" });
    const { result: created } = await createNote(actorId);

    await expect(
      pool.query("delete from users where id = $1", [actorId]),
    ).resolves.toMatchObject({ rowCount: 1 });
    const event = await pool.query<{
      actor_user_id: string | null;
      actor_id_snapshot: string;
      actor_nickname_snapshot: string;
    }>(
      `select actor_user_id, actor_id_snapshot, actor_nickname_snapshot
       from campus_map_note_events where id = $1`,
      [created.eventId],
    );
    expect(event.rows).toEqual([
      {
        actor_user_id: null,
        actor_id_snapshot: actorId,
        actor_nickname_snapshot: "离站贡献者",
      },
    ]);
  });

  it("rejects truncating the immutable event ledger", async () => {
    const actorId = await createActor();
    await createNote(actorId);
    const client = await pool.connect();
    try {
      await client.query("begin");
      await expect(
        client.query("truncate campus_map_note_outbox, campus_map_note_events"),
      ).rejects.toMatchObject({
        message: expect.stringContaining("append-only"),
      });
      await client.query("rollback");
    } finally {
      client.release();
    }
  });
});
