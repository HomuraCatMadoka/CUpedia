import { createHash } from "node:crypto";
import {
  and,
  desc,
  eq,
  inArray,
  isNotNull,
  lt,
  ne,
  or,
  sql,
} from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import { db } from "@/db";
import {
  accounts,
  campusMapChangesets,
  campusMapNoteEvents,
  campusMapNoteEventVisibility,
  campusMapNoteOutbox,
  campusMapNoteRequests,
  campusMapNotes,
  campusMapNoteVisibility,
  campusMapNoteSubscriptions,
  campusMapPlaces,
  notifications,
  users,
} from "@/db/schema";
import { isAllowedEmail } from "@/lib/email";
import { isCanonicalCampusMapUuid } from "@/lib/campus-map/canonical-uuid";
import { consumeMapNoteRate } from "@/lib/campus-map/map-note-rate-policy";
import {
  findActiveCampusMapContributorBlock,
  initializeCampusMapNoteEventModerationProjection,
  initializeCampusMapNoteModerationProjection,
} from "@/lib/campus-map/moderation-governance";
import {
  CAMPUS_MAP_NOTE_RESOLUTION_REASONS,
  normalizeCampusMapNoteCommand,
  type CampusMapNoteCommand,
  type CampusMapNoteCommandContext,
  type CampusMapNoteCommandResult,
  type CampusMapNoteEventView,
  type CampusMapNotePage,
  type CampusMapNoteQuery,
  type CampusMapNoteStatus,
  type CampusMapNoteView,
} from "@/lib/campus-map/map-notes-contract";

type DatabaseTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

const MAX_COMMENT_CHARACTERS = 2_000;
const MAX_COMMENT_BYTES = 8_192;
const MAX_COMMAND_BYTES = 16_384;
const MAX_SEARCH_CHARACTERS = 100;
const MAX_SEARCH_DOCUMENT_CHARACTERS = 65_536;
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 50;
const OUTBOX_DELIVERY_LEASE_MS = 5 * 60_000;
const openingNoteEvents = alias(
  campusMapNoteEvents,
  "campus_map_public_opening_note_events",
);
const openingNoteEventVisibility = alias(
  campusMapNoteEventVisibility,
  "campus_map_public_opening_note_event_visibility",
);
const HIDDEN_NOTE_ACTOR = {
  id: "00000000-0000-4000-8000-000000000000",
  nickname: "内容已隐藏",
} as const;

interface EligibleNoteActor {
  id: string;
  nickname: string;
}

interface LockedNote {
  id: string;
  placeId: string | null;
  longitude: number | null;
  latitude: number | null;
  status: CampusMapNoteStatus;
  revision: number;
  searchDocument: string;
  visibility: "public" | "hidden";
}

export async function commandCampusMapNote(
  rawCommand: CampusMapNoteCommand,
  context: CampusMapNoteCommandContext,
): Promise<CampusMapNoteCommandResult> {
  if (context.actorId === null) {
    return {
      status: "authentication-required",
      code: "authentication-required",
    };
  }
  const actorId = context.actorId.toLowerCase();
  if (!isCanonicalCampusMapUuid(actorId)) {
    return { status: "forbidden", code: "actor-not-eligible" };
  }
  let command: CampusMapNoteCommand | null;
  try {
    command = normalizeCampusMapNoteCommand(rawCommand);
  } catch {
    command = null;
  }
  const serialized = command === null ? null : safeSerialize(command);
  const errors =
    command === null
      ? [{ code: "invalid-command", field: "command" }]
      : validateCommand(command, serialized);
  const requestFingerprint =
    serialized === null
      ? null
      : createHash("sha256").update(serialized, "utf8").digest("hex");
  const now = context.now ?? new Date();

  try {
    return await db.transaction(async (transaction) => {
      const actorResult = await readEligibleActor(transaction, actorId);
      if ("status" in actorResult) return actorResult;

      if (
        await findActiveCampusMapContributorBlock(
          transaction,
          actorResult.id,
          "map-notes",
          now,
        )
      ) {
        return { status: "forbidden", code: "contributor-blocked" };
      }

      const rateLimit = await consumeMapNoteRate(
        transaction,
        actorId,
        context.clientIp,
        now,
      );
      if (rateLimit) return rateLimit;
      if (
        command === null ||
        errors.length > 0 ||
        requestFingerprint === null
      ) {
        return { status: "validation-failed", errors };
      }

      await transaction.execute(sql`
        select pg_advisory_xact_lock(
          hashtextextended(
            ${`campus-map-note-request:${actorId}:${command.idempotencyKey}`},
            0
          )
        )
      `);
      const [storedRequest] = await transaction
        .select({
          requestFingerprint: campusMapNoteRequests.requestFingerprint,
          result: campusMapNoteRequests.result,
        })
        .from(campusMapNoteRequests)
        .where(
          and(
            eq(campusMapNoteRequests.actorIdSnapshot, actorId),
            eq(campusMapNoteRequests.idempotencyKey, command.idempotencyKey),
          ),
        )
        .limit(1);
      if (storedRequest) {
        return storedRequest.requestFingerprint === requestFingerprint
          ? storedRequest.result
          : validationFailure("idempotency-key-reused", "idempotencyKey");
      }

      const result = await executeCommand(
        transaction,
        command,
        actorResult,
        now,
      );
      if (!isSuccessfulResult(result)) return result;
      await transaction.insert(campusMapNoteRequests).values({
        actorUserId: actorResult.id,
        actorIdSnapshot: actorResult.id,
        idempotencyKey: command.idempotencyKey,
        commandKind: command.kind,
        requestFingerprint,
        result,
        createdAt: now,
      });
      return result;
    });
  } catch {
    return { status: "temporarily-unavailable", code: "map-note-unavailable" };
  }
}

export async function getCampusMapNote(
  noteId: string,
  viewerId: string | null = null,
): Promise<CampusMapNoteView | null> {
  const canonicalNoteId = noteId.toLowerCase();
  if (!isCanonicalCampusMapUuid(canonicalNoteId)) return null;
  const [note] = await db
    .select({
      id: campusMapNotes.id,
      placeId: campusMapNotes.placeId,
      longitude: campusMapNotes.longitude,
      latitude: campusMapNotes.latitude,
      status: campusMapNotes.status,
      revision: campusMapNotes.revision,
      authorId: campusMapNotes.authorIdSnapshot,
      authorNickname: campusMapNotes.authorNicknameSnapshot,
      visibility: campusMapNoteVisibility.visibility,
      createdAt: campusMapNotes.createdAt,
      updatedAt: campusMapNotes.updatedAt,
    })
    .from(campusMapNotes)
    .innerJoin(
      campusMapNoteVisibility,
      eq(campusMapNoteVisibility.noteId, campusMapNotes.id),
    )
    .where(eq(campusMapNotes.id, canonicalNoteId))
    .limit(1);
  if (!note) return null;
  const [events, subscription] = await Promise.all([
    db
      .select({
        id: campusMapNoteEvents.id,
        revision: campusMapNoteEvents.revision,
        kind: campusMapNoteEvents.kind,
        actorId: campusMapNoteEvents.actorIdSnapshot,
        actorNickname: campusMapNoteEvents.actorNicknameSnapshot,
        comment: campusMapNoteEvents.comment,
        resolutionReason: campusMapNoteEvents.resolutionReason,
        resolvedByChangesetId: campusMapNoteEvents.resolvedByChangesetId,
        visibility: campusMapNoteEventVisibility.visibility,
        createdAt: campusMapNoteEvents.createdAt,
      })
      .from(campusMapNoteEvents)
      .innerJoin(
        campusMapNoteEventVisibility,
        eq(campusMapNoteEventVisibility.eventId, campusMapNoteEvents.id),
      )
      .where(eq(campusMapNoteEvents.noteId, canonicalNoteId))
      .orderBy(campusMapNoteEvents.revision),
    viewerId && isCanonicalCampusMapUuid(viewerId.toLowerCase())
      ? db
          .select({ subscribed: campusMapNoteSubscriptions.subscribed })
          .from(campusMapNoteSubscriptions)
          .where(
            and(
              eq(campusMapNoteSubscriptions.noteId, canonicalNoteId),
              eq(campusMapNoteSubscriptions.userId, viewerId.toLowerCase()),
            ),
          )
          .limit(1)
      : Promise.resolve([]),
  ]);
  const hidden =
    note.status === "moderator-hidden" || note.visibility === "hidden";
  const authorHidden =
    hidden ||
    events.some(
      (event) =>
        event.kind === "opening-comment" && event.visibility === "hidden",
    );
  return {
    id: note.id,
    placeId: note.placeId,
    position:
      note.longitude === null || note.latitude === null
        ? null
        : { longitude: note.longitude, latitude: note.latitude, crs: "wgs84" },
    status: hidden ? "moderator-hidden" : note.status,
    revision: note.revision,
    author: authorHidden
      ? HIDDEN_NOTE_ACTOR
      : { id: note.authorId, nickname: note.authorNickname },
    createdAt: note.createdAt.toISOString(),
    updatedAt: note.updatedAt.toISOString(),
    subscribed: subscription[0]?.subscribed ?? false,
    events: events.map((event): CampusMapNoteEventView => {
      const eventHidden = hidden || event.visibility === "hidden";
      return {
        id: event.id,
        revision: event.revision,
        kind: event.kind,
        actor: eventHidden
          ? HIDDEN_NOTE_ACTOR
          : { id: event.actorId, nickname: event.actorNickname },
        comment: eventHidden ? null : event.comment,
        resolution:
          eventHidden || event.resolutionReason === null
            ? null
            : {
                reason: event.resolutionReason,
                resolvedByChangesetId: event.resolvedByChangesetId,
              },
        createdAt: event.createdAt.toISOString(),
      };
    }),
  };
}

export async function listCampusMapNotes(
  rawQuery: CampusMapNoteQuery,
): Promise<CampusMapNotePage> {
  const query = normalizeQuery(rawQuery);
  if (!query) return { items: [], nextCursor: null };
  const limit = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, query.limit ?? DEFAULT_PAGE_SIZE),
  );
  const cursor = query.cursor ? decodeCursor(query.cursor) : null;
  if (query.cursor && !cursor) return { items: [], nextCursor: null };

  const predicates = [
    ne(campusMapNotes.status, "moderator-hidden"),
    eq(campusMapNoteVisibility.visibility, "public"),
  ];
  if (query.status) predicates.push(eq(campusMapNotes.status, query.status));
  if (cursor) {
    predicates.push(
      or(
        lt(campusMapNotes.updatedAt, cursor.updatedAt),
        and(
          eq(campusMapNotes.updatedAt, cursor.updatedAt),
          lt(campusMapNotes.id, cursor.id),
        ),
      )!,
    );
  }
  if (query.scope.kind === "place") {
    predicates.push(eq(campusMapNotes.placeId, query.scope.placeId));
  } else if (query.scope.kind === "author") {
    predicates.push(
      eq(campusMapNotes.authorIdSnapshot, query.scope.actorId),
      eq(openingNoteEventVisibility.visibility, "public"),
    );
  } else if (query.scope.kind === "bbox") {
    predicates.push(
      isNotNull(campusMapNotes.longitude),
      isNotNull(campusMapNotes.latitude),
      sql`point(${campusMapNotes.longitude}, ${campusMapNotes.latitude}) <@ box(
        point(${query.scope.west}, ${query.scope.south}),
        point(${query.scope.east}, ${query.scope.north})
      )`,
    );
  } else if (query.scope.kind === "search") {
    predicates.push(
      sql`to_tsvector('simple', ${campusMapNotes.searchDocument}) @@ plainto_tsquery('simple', ${query.scope.text})`,
    );
  }

  const rows = await db
    .select({
      id: campusMapNotes.id,
      placeId: campusMapNotes.placeId,
      longitude: campusMapNotes.longitude,
      latitude: campusMapNotes.latitude,
      status: campusMapNotes.status,
      revision: campusMapNotes.revision,
      authorId: campusMapNotes.authorIdSnapshot,
      authorNickname: campusMapNotes.authorNicknameSnapshot,
      excerpt: campusMapNotes.searchDocument,
      openingVisibility: openingNoteEventVisibility.visibility,
      updatedAt: campusMapNotes.updatedAt,
    })
    .from(campusMapNotes)
    .innerJoin(
      campusMapNoteVisibility,
      eq(campusMapNoteVisibility.noteId, campusMapNotes.id),
    )
    .innerJoin(
      openingNoteEvents,
      and(
        eq(openingNoteEvents.noteId, campusMapNotes.id),
        eq(openingNoteEvents.kind, "opening-comment"),
      ),
    )
    .innerJoin(
      openingNoteEventVisibility,
      eq(openingNoteEventVisibility.eventId, openingNoteEvents.id),
    )
    .where(and(...predicates))
    .orderBy(desc(campusMapNotes.updatedAt), desc(campusMapNotes.id))
    .limit(limit + 1);
  const visible = rows.slice(0, limit);
  const last = visible.at(-1);
  return {
    items: visible.map((row) => ({
      id: row.id,
      placeId: row.placeId,
      position:
        row.longitude === null || row.latitude === null
          ? null
          : { longitude: row.longitude, latitude: row.latitude, crs: "wgs84" },
      status: row.status,
      revision: row.revision,
      author:
        row.openingVisibility === "hidden"
          ? HIDDEN_NOTE_ACTOR
          : { id: row.authorId, nickname: row.authorNickname },
      excerpt: safeExcerpt(row.excerpt),
      updatedAt: row.updatedAt.toISOString(),
    })),
    nextCursor:
      rows.length > limit && last
        ? encodeCursor({ updatedAt: last.updatedAt, id: last.id })
        : null,
  };
}

export async function setCampusMapNoteSubscription(
  noteId: string,
  subscribed: boolean,
  actorId: string | null,
): Promise<
  | { status: "subscribed" | "unsubscribed" }
  | Extract<
      CampusMapNoteCommandResult,
      { status: "authentication-required" | "forbidden" | "not-found" }
    >
> {
  if (actorId === null) {
    return {
      status: "authentication-required",
      code: "authentication-required",
    };
  }
  const canonicalActorId = actorId.toLowerCase();
  const canonicalNoteId = noteId.toLowerCase();
  if (!isCanonicalCampusMapUuid(canonicalActorId)) {
    return { status: "forbidden", code: "actor-not-eligible" };
  }
  if (!isCanonicalCampusMapUuid(canonicalNoteId)) {
    return { status: "not-found", code: "note-not-found" };
  }
  return db.transaction(async (transaction) => {
    const actor = await readEligibleActor(transaction, canonicalActorId);
    if ("status" in actor) return actor;
    const [note] = await transaction
      .select({
        id: campusMapNotes.id,
        status: campusMapNotes.status,
        visibility: campusMapNoteVisibility.visibility,
      })
      .from(campusMapNotes)
      .innerJoin(
        campusMapNoteVisibility,
        eq(campusMapNoteVisibility.noteId, campusMapNotes.id),
      )
      .where(eq(campusMapNotes.id, canonicalNoteId))
      .limit(1);
    if (!note) return { status: "not-found", code: "note-not-found" } as const;
    if (note.status === "moderator-hidden" || note.visibility === "hidden") {
      return { status: "forbidden", code: "note-hidden" } as const;
    }
    await upsertSubscription(
      transaction,
      canonicalNoteId,
      actor.id,
      subscribed,
      new Date(),
    );
    return { status: subscribed ? "subscribed" : "unsubscribed" } as const;
  });
}

export interface CampusMapNoteOutboxMessage {
  id: string;
  noteId: string;
  eventId: string;
  recipientUserId: string;
}

export async function dispatchCampusMapNoteOutbox(
  deliver: (message: CampusMapNoteOutboxMessage) => Promise<void>,
  limit = 25,
): Promise<{ delivered: number; failed: number }> {
  const batchSize = Math.min(100, Math.max(1, Math.floor(limit)));
  const leaseExpiresAt = new Date(Date.now() + OUTBOX_DELIVERY_LEASE_MS);
  const claimed = await db.transaction(async (transaction) => {
    const rows = await transaction
      .select({
        id: campusMapNoteOutbox.id,
        noteId: campusMapNoteOutbox.noteId,
        eventId: campusMapNoteOutbox.eventId,
        recipientUserId: campusMapNoteOutbox.recipientUserId,
      })
      .from(campusMapNoteOutbox)
      .where(
        and(
          inArray(campusMapNoteOutbox.status, [
            "pending",
            "processing",
            "failed",
          ]),
          sql`${campusMapNoteOutbox.availableAt} <= now()`,
        ),
      )
      .orderBy(campusMapNoteOutbox.availableAt, campusMapNoteOutbox.id)
      .limit(batchSize)
      .for("update", { skipLocked: true });
    if (rows.length > 0) {
      await transaction
        .update(campusMapNoteOutbox)
        .set({
          status: "processing",
          availableAt: leaseExpiresAt,
          lastError: null,
        })
        .where(
          inArray(
            campusMapNoteOutbox.id,
            rows.map((row) => row.id),
          ),
        );
    }
    return rows;
  });

  let delivered = 0;
  let failed = 0;
  for (const message of claimed) {
    try {
      await deliver(message);
      await db
        .update(campusMapNoteOutbox)
        .set({
          status: "delivered",
          attemptCount: sql`${campusMapNoteOutbox.attemptCount} + 1`,
          deliveredAt: new Date(),
          lastError: null,
        })
        .where(eq(campusMapNoteOutbox.id, message.id));
      delivered += 1;
    } catch {
      await db
        .update(campusMapNoteOutbox)
        .set({
          status: "failed",
          attemptCount: sql`${campusMapNoteOutbox.attemptCount} + 1`,
          availableAt: new Date(Date.now() + 60_000),
          lastError: "delivery-failed",
        })
        .where(eq(campusMapNoteOutbox.id, message.id));
      failed += 1;
    }
  }
  return { delivered, failed };
}

export async function deliverCampusMapNoteNotifications(limit = 25) {
  return dispatchCampusMapNoteOutbox(async (message) => {
    await db.transaction(async (transaction) => {
      const [noteVisibility] = await transaction
        .select({ visibility: campusMapNoteVisibility.visibility })
        .from(campusMapNoteVisibility)
        .where(eq(campusMapNoteVisibility.noteId, message.noteId))
        .for("share")
        .limit(1);
      const [event] = await transaction
        .select({
          actorUserId: campusMapNoteEvents.actorUserId,
          visibility: campusMapNoteEventVisibility.visibility,
        })
        .from(campusMapNoteEvents)
        .innerJoin(
          campusMapNoteEventVisibility,
          eq(campusMapNoteEventVisibility.eventId, campusMapNoteEvents.id),
        )
        .where(eq(campusMapNoteEvents.id, message.eventId))
        .for("share")
        .limit(1);
      if (!noteVisibility || !event) {
        throw new Error("Campus Map Note notification target is missing");
      }
      const actorId =
        noteVisibility.visibility === "public" && event.visibility === "public"
          ? event.actorUserId
          : null;
      await transaction
        .insert(notifications)
        .values({
          id: message.id,
          recipientId: message.recipientUserId,
          actorId,
          kind: "campus_map_note_event",
          metadata: { noteId: message.noteId, eventId: message.eventId },
        })
        .onConflictDoNothing({ target: notifications.id });
    });
  }, limit);
}

async function executeCommand(
  transaction: DatabaseTransaction,
  command: CampusMapNoteCommand,
  actor: EligibleNoteActor,
  now: Date,
): Promise<CampusMapNoteCommandResult> {
  if (command.kind === "create") {
    if (command.placeId !== null) {
      const [place] = await transaction
        .select({ id: campusMapPlaces.id })
        .from(campusMapPlaces)
        .where(eq(campusMapPlaces.id, command.placeId))
        .limit(1);
      if (!place) return validationFailure("place-not-found", "placeId");
    }
    const [note] = await transaction
      .insert(campusMapNotes)
      .values({
        placeId: command.placeId,
        longitude: command.position?.longitude ?? null,
        latitude: command.position?.latitude ?? null,
        status: "open",
        revision: 1,
        authorUserId: actor.id,
        authorIdSnapshot: actor.id,
        authorNicknameSnapshot: actor.nickname,
        searchDocument: command.openingComment,
        createdAt: now,
        updatedAt: now,
      })
      .returning({ id: campusMapNotes.id });
    const [event] = await transaction
      .insert(campusMapNoteEvents)
      .values({
        noteId: note.id,
        revision: 1,
        kind: "opening-comment",
        actorUserId: actor.id,
        actorIdSnapshot: actor.id,
        actorNicknameSnapshot: actor.nickname,
        comment: command.openingComment,
        createdAt: now,
      })
      .returning({ id: campusMapNoteEvents.id });
    await initializeCampusMapNoteModerationProjection(
      transaction,
      { noteId: note.id, eventId: event.id },
      now,
    );
    await upsertSubscription(transaction, note.id, actor.id, true, now);
    return {
      status: "created",
      noteId: note.id,
      eventId: event.id,
      revision: 1,
    };
  }

  const note = await lockNote(transaction, command.noteId);
  if (!note) return { status: "not-found", code: "note-not-found" };
  if (note.status === "moderator-hidden" || note.visibility === "hidden") {
    return { status: "forbidden", code: "note-hidden" };
  }
  if (
    (command.kind === "resolve" || command.kind === "reopen") &&
    command.expectedRevision !== note.revision
  ) {
    return {
      status: "conflict",
      code: "note-revision-conflict",
      noteId: note.id,
      expectedRevision: command.expectedRevision,
      currentRevision: note.revision,
      currentStatus: note.status,
    };
  }
  if (command.kind === "resolve" && note.status !== "open") {
    return validationFailure("note-not-open", "expectedRevision");
  }
  if (command.kind === "reopen" && note.status !== "closed") {
    return validationFailure("note-not-closed", "expectedRevision");
  }
  if (
    command.kind === "resolve" &&
    command.resolution.resolvedByChangesetId !== null
  ) {
    const [changeset] = await transaction
      .select({ id: campusMapChangesets.id })
      .from(campusMapChangesets)
      .where(
        eq(campusMapChangesets.id, command.resolution.resolvedByChangesetId),
      )
      .limit(1);
    if (!changeset) {
      return validationFailure("changeset-not-found", "resolvedByChangesetId");
    }
  }

  const revision = note.revision + 1;
  const comment = command.comment;
  const nextStatus =
    command.kind === "resolve"
      ? "closed"
      : command.kind === "reopen"
        ? "open"
        : note.status;
  const nextSearchDocument = comment
    ? `${note.searchDocument} ${comment}`.slice(
        0,
        MAX_SEARCH_DOCUMENT_CHARACTERS,
      )
    : note.searchDocument;
  const [advanced] = await transaction
    .update(campusMapNotes)
    .set({
      status: nextStatus,
      revision,
      searchDocument: nextSearchDocument,
      updatedAt: now,
    })
    .where(
      and(
        eq(campusMapNotes.id, note.id),
        eq(campusMapNotes.revision, note.revision),
      ),
    )
    .returning({ id: campusMapNotes.id });
  if (!advanced) {
    const current = await lockNote(transaction, note.id);
    return current
      ? {
          status: "conflict",
          code: "note-revision-conflict",
          noteId: note.id,
          expectedRevision:
            command.kind === "comment"
              ? note.revision
              : command.expectedRevision,
          currentRevision: current.revision,
          currentStatus: current.status,
        }
      : { status: "not-found", code: "note-not-found" };
  }
  const eventKind = command.kind;
  const [event] = await transaction
    .insert(campusMapNoteEvents)
    .values({
      noteId: note.id,
      revision,
      kind: eventKind,
      actorUserId: actor.id,
      actorIdSnapshot: actor.id,
      actorNicknameSnapshot: actor.nickname,
      comment,
      resolutionReason:
        command.kind === "resolve" ? command.resolution.reason : null,
      resolvedByChangesetId:
        command.kind === "resolve"
          ? command.resolution.resolvedByChangesetId
          : null,
      createdAt: now,
    })
    .returning({ id: campusMapNoteEvents.id });
  await initializeCampusMapNoteEventModerationProjection(
    transaction,
    event.id,
    now,
  );
  if (command.kind === "comment") {
    await upsertSubscription(transaction, note.id, actor.id, true, now);
  }
  await enqueueSubscriberNotifications(
    transaction,
    note.id,
    event.id,
    actor.id,
    now,
  );
  return {
    status:
      command.kind === "comment"
        ? "commented"
        : command.kind === "resolve"
          ? "resolved"
          : "reopened",
    noteId: note.id,
    eventId: event.id,
    revision,
  };
}

async function readEligibleActor(
  transaction: DatabaseTransaction,
  actorId: string,
): Promise<
  | EligibleNoteActor
  | Extract<CampusMapNoteCommandResult, { status: "forbidden" }>
> {
  const [actor] = await transaction
    .select({
      id: users.id,
      email: users.email,
      emailVerified: users.emailVerified,
      nickname: users.nickname,
      banned: users.banned,
    })
    .from(users)
    .where(eq(users.id, actorId))
    .for("update")
    .limit(1);
  if (!actor || !actor.emailVerified || !isAllowedEmail(actor.email)) {
    return { status: "forbidden", code: "actor-not-eligible" };
  }
  if (actor.banned) return { status: "forbidden", code: "actor-banned" };
  const [credential] = await transaction
    .select({ id: accounts.id })
    .from(accounts)
    .where(
      and(
        eq(accounts.userId, actor.id),
        eq(accounts.providerId, "credential"),
        isNotNull(accounts.password),
      ),
    )
    .limit(1);
  if (actor.nickname.trim() === "" || !credential) {
    return { status: "forbidden", code: "profile-incomplete" };
  }
  return { id: actor.id, nickname: actor.nickname };
}

async function lockNote(
  transaction: DatabaseTransaction,
  noteId: string,
): Promise<LockedNote | null> {
  const [note] = await transaction
    .select({
      id: campusMapNotes.id,
      placeId: campusMapNotes.placeId,
      longitude: campusMapNotes.longitude,
      latitude: campusMapNotes.latitude,
      status: campusMapNotes.status,
      revision: campusMapNotes.revision,
      searchDocument: campusMapNotes.searchDocument,
      visibility: campusMapNoteVisibility.visibility,
    })
    .from(campusMapNotes)
    .innerJoin(
      campusMapNoteVisibility,
      eq(campusMapNoteVisibility.noteId, campusMapNotes.id),
    )
    .where(eq(campusMapNotes.id, noteId))
    .for("update", { of: campusMapNotes })
    .limit(1);
  return note ?? null;
}

async function upsertSubscription(
  transaction: DatabaseTransaction,
  noteId: string,
  userId: string,
  subscribed: boolean,
  now: Date,
) {
  await transaction
    .insert(campusMapNoteSubscriptions)
    .values({ noteId, userId, subscribed, updatedAt: now })
    .onConflictDoUpdate({
      target: [
        campusMapNoteSubscriptions.noteId,
        campusMapNoteSubscriptions.userId,
      ],
      set: { subscribed, updatedAt: now },
    });
}

async function enqueueSubscriberNotifications(
  transaction: DatabaseTransaction,
  noteId: string,
  eventId: string,
  actorId: string,
  now: Date,
) {
  const recipients = await transaction
    .select({ userId: campusMapNoteSubscriptions.userId })
    .from(campusMapNoteSubscriptions)
    .where(
      and(
        eq(campusMapNoteSubscriptions.noteId, noteId),
        eq(campusMapNoteSubscriptions.subscribed, true),
        ne(campusMapNoteSubscriptions.userId, actorId),
      ),
    );
  if (recipients.length === 0) return;
  await transaction.insert(campusMapNoteOutbox).values(
    recipients.map((recipient) => ({
      noteId,
      eventId,
      recipientUserId: recipient.userId,
      status: "pending",
      attemptCount: 0,
      availableAt: now,
      createdAt: now,
    })),
  );
}

function validateCommand(
  command: CampusMapNoteCommand,
  serialized: string | null,
) {
  const errors: Array<{ code: string; field: string }> = [];
  if (
    serialized === null ||
    Buffer.byteLength(serialized, "utf8") > MAX_COMMAND_BYTES
  ) {
    errors.push({ code: "command-too-large", field: "command" });
    return errors;
  }
  if (!isCanonicalCampusMapUuid(command.idempotencyKey)) {
    errors.push({ code: "invalid-idempotency-key", field: "idempotencyKey" });
  }
  if (command.kind === "create") {
    if (command.placeId === null && command.position === null) {
      errors.push({ code: "note-context-required", field: "context" });
    }
    if (
      command.placeId !== null &&
      !isCanonicalCampusMapUuid(command.placeId)
    ) {
      errors.push({ code: "invalid-place-id", field: "placeId" });
    }
    if (command.position !== null && !isValidPosition(command.position)) {
      errors.push({ code: "invalid-wgs84-position", field: "position" });
    }
    validateComment(command.openingComment, "openingComment", errors);
    return errors;
  }
  if (!isCanonicalCampusMapUuid(command.noteId)) {
    errors.push({ code: "invalid-note-id", field: "noteId" });
  }
  if (command.kind === "comment" || command.kind === "reopen") {
    validateComment(command.comment, "comment", errors);
  }
  if (command.kind === "resolve") {
    if (
      !Number.isSafeInteger(command.expectedRevision) ||
      command.expectedRevision <= 0
    ) {
      errors.push({
        code: "invalid-expected-revision",
        field: "expectedRevision",
      });
    }
    if (
      !CAMPUS_MAP_NOTE_RESOLUTION_REASONS.includes(command.resolution.reason)
    ) {
      errors.push({
        code: "invalid-resolution-reason",
        field: "resolution.reason",
      });
    }
    if (
      command.resolution.resolvedByChangesetId !== null &&
      !isCanonicalCampusMapUuid(command.resolution.resolvedByChangesetId)
    ) {
      errors.push({
        code: "invalid-changeset-id",
        field: "resolution.resolvedByChangesetId",
      });
    }
    if (command.comment !== null)
      validateComment(command.comment, "comment", errors);
  }
  if (
    command.kind === "reopen" &&
    (!Number.isSafeInteger(command.expectedRevision) ||
      command.expectedRevision <= 0)
  ) {
    errors.push({
      code: "invalid-expected-revision",
      field: "expectedRevision",
    });
  }
  return errors;
}

function validateComment(
  value: string,
  field: string,
  errors: Array<{ code: string; field: string }>,
) {
  const characters = [...value].length;
  if (characters === 0) errors.push({ code: "comment-required", field });
  if (characters > MAX_COMMENT_CHARACTERS) {
    errors.push({ code: "comment-too-long", field });
  }
  if (Buffer.byteLength(value, "utf8") > MAX_COMMENT_BYTES) {
    errors.push({ code: "comment-payload-too-large", field });
  }
}

function isValidPosition(position: {
  longitude: number;
  latitude: number;
  crs: string;
}) {
  return (
    position.crs === "wgs84" &&
    Number.isFinite(position.longitude) &&
    Number.isFinite(position.latitude) &&
    position.longitude >= -180 &&
    position.longitude <= 180 &&
    position.latitude >= -90 &&
    position.latitude <= 90
  );
}

function validationFailure(
  code: string,
  field: string,
): CampusMapNoteCommandResult {
  return { status: "validation-failed", errors: [{ code, field }] };
}

function isSuccessfulResult(
  result: CampusMapNoteCommandResult,
): result is Extract<
  CampusMapNoteCommandResult,
  { status: "created" | "commented" | "resolved" | "reopened" }
> {
  return ["created", "commented", "resolved", "reopened"].includes(
    result.status,
  );
}

function safeSerialize(command: CampusMapNoteCommand): string | null {
  try {
    const serialized = JSON.stringify(canonicalize(command));
    return typeof serialized === "string" ? serialized : null;
  } catch {
    return null;
  }
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, canonicalize(entry)]),
    );
  }
  return value;
}

function normalizeQuery(query: CampusMapNoteQuery): CampusMapNoteQuery | null {
  const normalized = structuredClone(query);
  if (normalized.scope.kind === "place") {
    normalized.scope.placeId = normalized.scope.placeId.toLowerCase();
    if (!isCanonicalCampusMapUuid(normalized.scope.placeId)) return null;
  } else if (normalized.scope.kind === "author") {
    normalized.scope.actorId = normalized.scope.actorId.toLowerCase();
    if (!isCanonicalCampusMapUuid(normalized.scope.actorId)) return null;
  } else if (normalized.scope.kind === "bbox") {
    const { west, south, east, north } = normalized.scope;
    if (
      ![west, south, east, north].every(Number.isFinite) ||
      west < -180 ||
      east > 180 ||
      south < -90 ||
      north > 90 ||
      west > east ||
      south > north
    ) {
      return null;
    }
  } else if (normalized.scope.kind === "search") {
    normalized.scope.text = normalized.scope.text.trim();
    if (
      normalized.scope.text === "" ||
      [...normalized.scope.text].length > MAX_SEARCH_CHARACTERS
    ) {
      return null;
    }
  }
  return normalized;
}

function safeExcerpt(value: string): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  return [...normalized].slice(0, 180).join("");
}

function encodeCursor(cursor: { updatedAt: Date; id: string }): string {
  return Buffer.from(
    JSON.stringify({
      updatedAt: cursor.updatedAt.toISOString(),
      id: cursor.id,
    }),
    "utf8",
  ).toString("base64url");
}

function decodeCursor(value: string): { updatedAt: Date; id: string } | null {
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    const updatedAt = new Date(parsed.updatedAt);
    return typeof parsed.id === "string" &&
      isCanonicalCampusMapUuid(parsed.id) &&
      Number.isFinite(updatedAt.getTime())
      ? { updatedAt, id: parsed.id }
      : null;
  } catch {
    return null;
  }
}
