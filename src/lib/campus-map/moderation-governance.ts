import { createHash, randomUUID } from "node:crypto";

import {
  and,
  desc,
  eq,
  gt,
  gte,
  isNotNull,
  isNull,
  lt,
  lte,
  or,
  sql,
} from "drizzle-orm";

import { db } from "@/db";
import {
  accounts,
  campusMapChangesets,
  campusMapFactRevisions,
  campusMapContributorBlocks,
  campusMapModerationCases,
  campusMapModerationDecisions,
  campusMapModerationRequests,
  campusMapNoteEventVisibility,
  campusMapNoteEvents,
  campusMapNoteVisibility,
  campusMapNotes,
  campusMapReports,
  campusMapRevisionVisibility,
  notifications,
  users,
} from "@/db/schema";
import { isAllowedEmail } from "@/lib/email";
import { isCanonicalCampusMapUuid } from "./canonical-uuid";
import {
  CAMPUS_MAP_MODERATION_TARGET_KINDS,
  CAMPUS_MAP_REPORT_SIGNALS,
  CAMPUS_MAP_REVISION_REDACTION_TRIGGERS,
  normalizeCampusMapModerationCommand,
  type CampusMapModerationAdminContext,
  type CampusMapModerationCaseReadResult,
  type CampusMapModerationCaseStatus,
  type CampusMapModerationCaseView,
  type CampusMapModerationCommand,
  type CampusMapModerationCommandContext,
  type CampusMapModerationCommandResult,
  type CampusMapModerationQueueQuery,
  type CampusMapModerationQueueReadResult,
  type CampusMapModerationTarget,
  type CampusMapModerationTargetReadResult,
  type CampusMapReportSignal,
} from "./moderation-governance-contract";
import { consumeCampusMapReportRate } from "./moderation-rate-policy";

export type {
  CampusMapContributorBlockScope,
  CampusMapModerationAdminContext,
  CampusMapModerationCaseReadResult,
  CampusMapModerationCaseStatus,
  CampusMapModerationCaseView,
  CampusMapModerationCommand,
  CampusMapModerationCommandContext,
  CampusMapModerationCommandResult,
  CampusMapModerationQueuePage,
  CampusMapModerationQueueQuery,
  CampusMapModerationQueueReadResult,
  CampusMapModerationTarget,
  CampusMapModerationTargetReadResult,
  CampusMapReportSignal,
  CampusMapRevisionRedactionTrigger,
} from "./moderation-governance-contract";

type DatabaseTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
type EligibleActor = { id: string; nickname: string; role: string };
export type CampusMapContributorWriteSurface = "publish" | "map-notes";

const MAX_REPORT_DETAILS_BYTES = 8_192;
const MAX_REPORT_EVIDENCE_BYTES = 16_384;
const MAX_COMMAND_BYTES = 32_768;
type QueueCursor = { occurredAt: Date; id: string };

/** Internal projection initializer used by the sole Map Notes writer. */
export async function initializeCampusMapNoteModerationProjection(
  transaction: DatabaseTransaction,
  input: { noteId: string; eventId: string },
  now: Date,
): Promise<void> {
  await transaction.insert(campusMapNoteVisibility).values({
    noteId: input.noteId,
    visibility: "public",
    decisionRef: null,
    updatedAt: now,
  });
  await initializeCampusMapNoteEventModerationProjection(
    transaction,
    input.eventId,
    now,
  );
}

/** Internal projection initializer used when Map Notes appends an event. */
export async function initializeCampusMapNoteEventModerationProjection(
  transaction: DatabaseTransaction,
  eventId: string,
  now: Date,
): Promise<void> {
  await transaction.insert(campusMapNoteEventVisibility).values({
    eventId,
    visibility: "public",
    decisionRef: null,
    updatedAt: now,
  });
}

/** Must run after the writer locks the contributor row in its own transaction. */
export async function findActiveCampusMapContributorBlock(
  transaction: DatabaseTransaction,
  contributorId: string,
  surface: CampusMapContributorWriteSurface,
  now: Date,
): Promise<{ blockId: string; needsAcknowledgement: boolean } | null> {
  const [block] = await transaction
    .select({
      id: campusMapContributorBlocks.id,
      needsAcknowledgement: campusMapContributorBlocks.needsAcknowledgement,
    })
    .from(campusMapContributorBlocks)
    .where(
      and(
        eq(campusMapContributorBlocks.contributorIdSnapshot, contributorId),
        or(
          eq(campusMapContributorBlocks.scope, "all"),
          eq(campusMapContributorBlocks.scope, surface),
        ),
        lte(campusMapContributorBlocks.startsAt, now),
        or(
          isNull(campusMapContributorBlocks.endsAt),
          gt(campusMapContributorBlocks.endsAt, now),
        ),
        isNull(campusMapContributorBlocks.revokedAt),
      ),
    )
    .orderBy(campusMapContributorBlocks.startsAt, campusMapContributorBlocks.id)
    .limit(1);
  return block
    ? { blockId: block.id, needsAcknowledgement: block.needsAcknowledgement }
    : null;
}

export async function commandCampusMapModeration(
  rawCommand: CampusMapModerationCommand,
  context: CampusMapModerationCommandContext,
): Promise<CampusMapModerationCommandResult> {
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
  let command: CampusMapModerationCommand | null = null;
  let serialized: string | null = null;
  try {
    command = normalizeCampusMapModerationCommand(rawCommand);
    serialized = JSON.stringify(command);
  } catch {
    // A typed validation result is returned below.
  }
  const errors = validateCommand(command, serialized);
  const now = context.now ?? new Date();

  try {
    return await db.transaction(async (transaction) => {
      const actor = await readEligibleActor(transaction, actorId);
      if ("status" in actor) return actor;
      if (command === null || serialized === null || errors.length > 0) {
        return { status: "validation-failed", errors };
      }
      if (command.kind === "report") {
        const limited = await consumeCampusMapReportRate(
          transaction,
          actor.id,
          context.clientIp,
          now,
        );
        if (limited) return limited;
      } else if (actor.role !== "admin") {
        return { status: "forbidden", code: "admin-required" };
      }

      const fingerprint = createHash("sha256")
        .update(serialized, "utf8")
        .digest("hex");
      await transaction.execute(sql`
        select pg_advisory_xact_lock(
          hashtextextended(
            ${`campus-map-moderation-request:${actor.id}:${command.idempotencyKey}`},
            0
          )
        )
      `);
      const [stored] = await transaction
        .select({
          requestFingerprint: campusMapModerationRequests.requestFingerprint,
          result: campusMapModerationRequests.result,
        })
        .from(campusMapModerationRequests)
        .where(
          and(
            eq(campusMapModerationRequests.actorIdSnapshot, actor.id),
            eq(
              campusMapModerationRequests.idempotencyKey,
              command.idempotencyKey,
            ),
          ),
        )
        .limit(1);
      if (stored) {
        return stored.requestFingerprint === fingerprint
          ? stored.result
          : validationFailure("idempotency-key-reused", "idempotencyKey");
      }

      const result =
        command.kind === "report"
          ? await submitReport(transaction, command, actor, now)
          : await executeAdminCommand(transaction, command, actor, now);
      if (result.status !== "reported" && result.status !== "decided") {
        return result;
      }
      await transaction.insert(campusMapModerationRequests).values({
        actorUserId: actor.id,
        actorIdSnapshot: actor.id,
        idempotencyKey: command.idempotencyKey,
        commandKind: command.kind,
        requestFingerprint: fingerprint,
        result,
        createdAt: now,
      });
      return result;
    });
  } catch {
    return {
      status: "temporarily-unavailable",
      code: "moderation-unavailable",
    };
  }
}

async function submitReport(
  transaction: DatabaseTransaction,
  command: Extract<CampusMapModerationCommand, { kind: "report" }>,
  actor: EligibleActor,
  now: Date,
): Promise<CampusMapModerationCommandResult> {
  if (!(await targetExists(transaction, command.target))) {
    return { status: "not-found", code: "moderation-target-not-found" };
  }
  const inserted = await transaction
    .insert(campusMapModerationCases)
    .values({
      targetKind: command.target.kind,
      targetId: command.target.id,
      status: "open",
      revision: 1,
      signals: [command.signal],
      reportCount: 1,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing()
    .returning({ id: campusMapModerationCases.id });
  const [moderationCase] = await transaction
    .select({
      id: campusMapModerationCases.id,
      status: campusMapModerationCases.status,
      revision: campusMapModerationCases.revision,
      signals: campusMapModerationCases.signals,
      reportCount: campusMapModerationCases.reportCount,
    })
    .from(campusMapModerationCases)
    .where(
      and(
        eq(campusMapModerationCases.targetKind, command.target.kind),
        eq(campusMapModerationCases.targetId, command.target.id),
      ),
    )
    .for("update")
    .limit(1);
  if (!moderationCase)
    throw new Error("Campus Map moderation case disappeared");

  const fresh = inserted.length === 1;
  const revision = fresh ? 1 : moderationCase.revision + 1;
  const status =
    !fresh &&
    (moderationCase.status === "resolved" ||
      moderationCase.status === "ignored")
      ? "reopened"
      : moderationCase.status;
  if (!fresh) {
    await transaction
      .update(campusMapModerationCases)
      .set({
        status,
        revision,
        signals: moderationCase.signals.includes(command.signal)
          ? moderationCase.signals
          : [...moderationCase.signals, command.signal],
        reportCount: moderationCase.reportCount + 1,
        updatedAt: now,
      })
      .where(eq(campusMapModerationCases.id, moderationCase.id));
  }
  const [report] = await transaction
    .insert(campusMapReports)
    .values({
      caseId: moderationCase.id,
      reporterUserId: actor.id,
      reporterIdSnapshot: actor.id,
      reporterNicknameSnapshot: actor.nickname,
      signal: command.signal,
      details: command.details,
      evidence: command.evidence,
      createdAt: now,
    })
    .returning({ id: campusMapReports.id });
  return {
    status: "reported",
    reportId: report.id,
    caseId: moderationCase.id,
    caseRevision: revision,
    caseStatus: status,
  };
}

async function executeAdminCommand(
  transaction: DatabaseTransaction,
  command: Exclude<CampusMapModerationCommand, { kind: "report" }>,
  actor: EligibleActor,
  now: Date,
): Promise<CampusMapModerationCommandResult> {
  if (command.kind !== "decide-case" && command.caseId !== null) {
    const [linkedCase] = await transaction
      .select({
        id: campusMapModerationCases.id,
        targetKind: campusMapModerationCases.targetKind,
        targetId: campusMapModerationCases.targetId,
      })
      .from(campusMapModerationCases)
      .where(eq(campusMapModerationCases.id, command.caseId))
      .for("update")
      .limit(1);
    if (!linkedCase) {
      return { status: "not-found", code: "moderation-target-not-found" };
    }
    const commandTarget = await resolveAdminCommandTarget(transaction, command);
    if (commandTarget === null) {
      return { status: "not-found", code: "moderation-target-not-found" };
    }
    if (
      linkedCase.targetKind !== commandTarget.kind ||
      linkedCase.targetId !== commandTarget.id
    ) {
      return validationFailure("case-target-mismatch", "caseId");
    }
  }
  const decisionId = randomUUID();
  const decisionRef = `campus-map-moderation:${decisionId}`;
  let target: CampusMapModerationTarget;
  let before: Record<string, unknown>;
  let after: Record<string, unknown>;
  let blockId: string | undefined;
  let caseRevision: number | null = null;
  let caseStatus: CampusMapModerationCaseStatus | null = null;

  if (command.kind === "decide-case") {
    const [moderationCase] = await transaction
      .select()
      .from(campusMapModerationCases)
      .where(eq(campusMapModerationCases.id, command.caseId))
      .for("update")
      .limit(1);
    if (!moderationCase) {
      return { status: "not-found", code: "moderation-target-not-found" };
    }
    if (moderationCase.revision !== command.expectedRevision) {
      return conflict(command.expectedRevision, moderationCase.revision);
    }
    target = { kind: moderationCase.targetKind, id: moderationCase.targetId };
    before = {
      status: moderationCase.status,
      revision: moderationCase.revision,
    };
    caseRevision = moderationCase.revision + 1;
    caseStatus = command.status;
    after = { status: caseStatus, revision: caseRevision };
    await transaction
      .update(campusMapModerationCases)
      .set({ status: caseStatus, revision: caseRevision, updatedAt: now })
      .where(eq(campusMapModerationCases.id, command.caseId));
  } else if (
    command.kind === "hide-map-note" ||
    command.kind === "unhide-map-note"
  ) {
    target = { kind: "map-note", id: command.noteId };
    const desired = command.kind === "hide-map-note" ? "hidden" : "public";
    const state = await lockNoteVisibility(transaction, command.noteId, now);
    if (state === null) {
      return { status: "not-found", code: "moderation-target-not-found" };
    }
    if (state.visibility !== command.expectedVisibility) {
      return conflict(command.expectedVisibility, state.visibility);
    }
    before = { visibility: state.visibility, decisionRef: state.decisionRef };
    after = {
      visibility: desired,
      decisionRef: desired === "hidden" ? decisionRef : null,
    };
    await transaction
      .update(campusMapNoteVisibility)
      .set({
        visibility: desired,
        decisionRef: desired === "hidden" ? decisionRef : null,
        updatedAt: now,
      })
      .where(eq(campusMapNoteVisibility.noteId, command.noteId));
    if (desired === "hidden") {
      await transaction
        .update(notifications)
        .set({ actorId: null })
        .where(
          and(
            eq(notifications.kind, "campus_map_note_event"),
            sql`${notifications.metadata}->>'noteId' = ${command.noteId}`,
          ),
        );
    }
  } else if (
    command.kind === "hide-map-note-event" ||
    command.kind === "unhide-map-note-event"
  ) {
    target = { kind: "map-note-event", id: command.eventId };
    const desired =
      command.kind === "hide-map-note-event" ? "hidden" : "public";
    const state = await lockNoteEventVisibility(
      transaction,
      command.eventId,
      now,
    );
    if (state === null) {
      return { status: "not-found", code: "moderation-target-not-found" };
    }
    if (state.visibility !== command.expectedVisibility) {
      return conflict(command.expectedVisibility, state.visibility);
    }
    before = { visibility: state.visibility, decisionRef: state.decisionRef };
    after = {
      visibility: desired,
      decisionRef: desired === "hidden" ? decisionRef : null,
    };
    await transaction
      .update(campusMapNoteEventVisibility)
      .set({
        visibility: desired,
        decisionRef: desired === "hidden" ? decisionRef : null,
        updatedAt: now,
      })
      .where(eq(campusMapNoteEventVisibility.eventId, command.eventId));
    if (desired === "hidden") {
      await transaction
        .update(notifications)
        .set({ actorId: null })
        .where(
          and(
            eq(notifications.kind, "campus_map_note_event"),
            sql`${notifications.metadata}->>'eventId' = ${command.eventId}`,
          ),
        );
    }
    await refreshPublicNoteSearchDocument(transaction, state.noteId, now);
  } else if (
    command.kind === "redact-revision" ||
    command.kind === "revoke-revision-redaction"
  ) {
    target = { kind: "revision", id: command.revisionId };
    const desired = command.kind === "redact-revision" ? "redacted" : "public";
    const [state] = await transaction
      .select({
        visibility: campusMapRevisionVisibility.visibility,
        redactionRef: campusMapRevisionVisibility.redactionRef,
      })
      .from(campusMapRevisionVisibility)
      .where(eq(campusMapRevisionVisibility.revisionId, command.revisionId))
      .for("update")
      .limit(1);
    if (!state) {
      return { status: "not-found", code: "moderation-target-not-found" };
    }
    if (state.visibility !== command.expectedVisibility) {
      return conflict(command.expectedVisibility, state.visibility);
    }
    before = { visibility: state.visibility, decisionRef: state.redactionRef };
    after = {
      visibility: desired,
      decisionRef: desired === "redacted" ? decisionRef : null,
      ...(command.kind === "redact-revision"
        ? { trigger: command.trigger }
        : {}),
    };
    await transaction
      .update(campusMapRevisionVisibility)
      .set({
        visibility: desired,
        redactionRef: desired === "redacted" ? decisionRef : null,
        updatedBy: actor.id,
        updatedAt: now,
      })
      .where(eq(campusMapRevisionVisibility.revisionId, command.revisionId));
  } else if (command.kind === "block-contributor") {
    target = { kind: "actor", id: command.contributorId };
    const [contributor] = await transaction
      .select({ id: users.id, role: users.role })
      .from(users)
      .where(eq(users.id, command.contributorId))
      .for("update")
      .limit(1);
    if (!contributor) {
      return { status: "not-found", code: "moderation-target-not-found" };
    }
    if (contributor.role === "admin") {
      return validationFailure(
        "admin-contributor-not-blockable",
        "contributorId",
      );
    }
    const startsAt = new Date(command.startsAt);
    const endsAt = command.endsAt === null ? null : new Date(command.endsAt);
    const [overlap] = await transaction
      .select({ id: campusMapContributorBlocks.id })
      .from(campusMapContributorBlocks)
      .where(
        and(
          eq(campusMapContributorBlocks.contributorIdSnapshot, contributor.id),
          isNull(campusMapContributorBlocks.revokedAt),
          or(
            eq(campusMapContributorBlocks.scope, command.scope),
            eq(campusMapContributorBlocks.scope, "all"),
            sql`${command.scope} = 'all'`,
          ),
          endsAt === null
            ? sql`true`
            : lt(campusMapContributorBlocks.startsAt, endsAt),
          or(
            isNull(campusMapContributorBlocks.endsAt),
            gt(campusMapContributorBlocks.endsAt, startsAt),
          ),
        ),
      )
      .orderBy(
        campusMapContributorBlocks.startsAt,
        campusMapContributorBlocks.id,
      )
      .for("update")
      .limit(1);
    if (overlap) return conflict("no-overlapping-block", overlap.id);
    blockId = randomUUID();
    before = { blocks: [] };
    after = {
      blocks: [
        {
          blockId,
          scope: command.scope,
          startsAt: command.startsAt,
          endsAt: command.endsAt,
          needsAcknowledgement: command.needsAcknowledgement,
        },
      ],
    };
    await transaction.insert(campusMapContributorBlocks).values({
      id: blockId,
      contributorUserId: contributor.id,
      contributorIdSnapshot: contributor.id,
      scope: command.scope,
      reason: command.reason,
      createdByActorIdSnapshot: actor.id,
      startsAt,
      endsAt,
      needsAcknowledgement: command.needsAcknowledgement,
      createdDecisionRef: decisionRef,
      createdAt: now,
    });
  } else {
    const [state] = await transaction
      .select()
      .from(campusMapContributorBlocks)
      .where(eq(campusMapContributorBlocks.id, command.blockId))
      .for("update")
      .limit(1);
    if (!state) {
      return { status: "not-found", code: "moderation-target-not-found" };
    }
    target = { kind: "actor", id: state.contributorIdSnapshot };
    if (state.revokedAt !== null) {
      return conflict("active", "revoked");
    }
    before = {
      blockId: state.id,
      scope: state.scope,
      startsAt: state.startsAt.toISOString(),
      endsAt: state.endsAt?.toISOString() ?? null,
      revokedAt: null,
    };
    after = { ...before, revokedAt: now.toISOString() };
    await transaction
      .update(campusMapContributorBlocks)
      .set({
        revokedAt: now,
        revokedByActorIdSnapshot: actor.id,
        revokedDecisionRef: decisionRef,
        revokeReason: command.reason,
      })
      .where(eq(campusMapContributorBlocks.id, command.blockId));
  }

  await transaction.insert(campusMapModerationDecisions).values({
    id: decisionId,
    decisionRef,
    commandKind: command.kind,
    caseId: command.caseId,
    actorUserId: actor.id,
    actorIdSnapshot: actor.id,
    actorNicknameSnapshot: actor.nickname,
    reason: command.reason,
    targetKind: target.kind,
    targetId: target.id,
    before,
    after,
    internalNote: command.kind === "decide-case" ? command.internalNote : null,
    createdAt: now,
  });
  return {
    status: "decided",
    decisionId,
    decisionRef,
    caseId: command.caseId,
    caseRevision,
    caseStatus,
    ...(blockId ? { blockId } : {}),
  };
}

async function resolveAdminCommandTarget(
  transaction: DatabaseTransaction,
  command: Exclude<
    CampusMapModerationCommand,
    { kind: "report" } | { kind: "decide-case" }
  >,
): Promise<CampusMapModerationTarget | null> {
  if (command.kind === "hide-map-note" || command.kind === "unhide-map-note") {
    return { kind: "map-note", id: command.noteId };
  }
  if (
    command.kind === "hide-map-note-event" ||
    command.kind === "unhide-map-note-event"
  ) {
    return { kind: "map-note-event", id: command.eventId };
  }
  if (
    command.kind === "redact-revision" ||
    command.kind === "revoke-revision-redaction"
  ) {
    return { kind: "revision", id: command.revisionId };
  }
  if (command.kind === "block-contributor") {
    return { kind: "actor", id: command.contributorId };
  }
  const [block] = await transaction
    .select({ contributorId: campusMapContributorBlocks.contributorIdSnapshot })
    .from(campusMapContributorBlocks)
    .where(eq(campusMapContributorBlocks.id, command.blockId))
    .for("update")
    .limit(1);
  return block ? { kind: "actor", id: block.contributorId } : null;
}

async function lockNoteVisibility(
  transaction: DatabaseTransaction,
  noteId: string,
  now: Date,
): Promise<{ visibility: string; decisionRef: string | null } | null> {
  const [note] = await transaction
    .select({ id: campusMapNotes.id })
    .from(campusMapNotes)
    .where(eq(campusMapNotes.id, noteId))
    .for("update")
    .limit(1);
  if (!note) return null;
  await transaction
    .insert(campusMapNoteVisibility)
    .values({ noteId, visibility: "public", decisionRef: null, updatedAt: now })
    .onConflictDoNothing();
  const [state] = await transaction
    .select({
      visibility: campusMapNoteVisibility.visibility,
      decisionRef: campusMapNoteVisibility.decisionRef,
    })
    .from(campusMapNoteVisibility)
    .where(eq(campusMapNoteVisibility.noteId, noteId))
    .for("update")
    .limit(1);
  return state ?? null;
}

async function lockNoteEventVisibility(
  transaction: DatabaseTransaction,
  eventId: string,
  now: Date,
): Promise<{
  visibility: string;
  decisionRef: string | null;
  noteId: string;
} | null> {
  const [event] = await transaction
    .select({ id: campusMapNoteEvents.id, noteId: campusMapNoteEvents.noteId })
    .from(campusMapNoteEvents)
    .where(eq(campusMapNoteEvents.id, eventId))
    .for("update")
    .limit(1);
  if (!event) return null;
  await transaction
    .insert(campusMapNoteEventVisibility)
    .values({
      eventId,
      visibility: "public",
      decisionRef: null,
      updatedAt: now,
    })
    .onConflictDoNothing();
  const [state] = await transaction
    .select({
      visibility: campusMapNoteEventVisibility.visibility,
      decisionRef: campusMapNoteEventVisibility.decisionRef,
    })
    .from(campusMapNoteEventVisibility)
    .where(eq(campusMapNoteEventVisibility.eventId, eventId))
    .for("update")
    .limit(1);
  return state ? { ...state, noteId: event.noteId } : null;
}

async function refreshPublicNoteSearchDocument(
  transaction: DatabaseTransaction,
  noteId: string,
  now: Date,
): Promise<void> {
  const events = await transaction
    .select({ comment: campusMapNoteEvents.comment })
    .from(campusMapNoteEvents)
    .innerJoin(
      campusMapNoteEventVisibility,
      eq(campusMapNoteEventVisibility.eventId, campusMapNoteEvents.id),
    )
    .where(
      and(
        eq(campusMapNoteEvents.noteId, noteId),
        eq(campusMapNoteEventVisibility.visibility, "public"),
      ),
    )
    .orderBy(campusMapNoteEvents.revision);
  await transaction
    .update(campusMapNotes)
    .set({
      searchDocument: events
        .flatMap((event) => (event.comment === null ? [] : [event.comment]))
        .join(" ")
        .slice(0, 65_536),
      updatedAt: now,
    })
    .where(eq(campusMapNotes.id, noteId));
}

function conflict(
  expected: string | number,
  current: string | number | null,
): Extract<CampusMapModerationCommandResult, { status: "conflict" }> {
  return {
    status: "conflict",
    code: "moderation-state-conflict",
    expected,
    current,
  };
}

export async function getCampusMapModerationCase(
  caseId: string,
  context: CampusMapModerationAdminContext,
): Promise<CampusMapModerationCaseReadResult> {
  const authority = await readAdminAuthority(context.actorId);
  if (authority) return authority;
  const canonicalCaseId = caseId.toLowerCase();
  if (!isCanonicalCampusMapUuid(canonicalCaseId)) {
    return { status: "not-found", code: "moderation-case-not-found" };
  }
  const [moderationCase] = await db
    .select()
    .from(campusMapModerationCases)
    .where(eq(campusMapModerationCases.id, canonicalCaseId))
    .limit(1);
  if (!moderationCase) {
    return { status: "not-found", code: "moderation-case-not-found" };
  }
  const [reports, decisions] = await Promise.all([
    db
      .select()
      .from(campusMapReports)
      .where(eq(campusMapReports.caseId, canonicalCaseId))
      .orderBy(campusMapReports.createdAt, campusMapReports.id),
    db
      .select()
      .from(campusMapModerationDecisions)
      .where(eq(campusMapModerationDecisions.caseId, canonicalCaseId))
      .orderBy(
        campusMapModerationDecisions.createdAt,
        campusMapModerationDecisions.id,
      ),
  ]);
  const value: CampusMapModerationCaseView = {
    id: moderationCase.id,
    target: { kind: moderationCase.targetKind, id: moderationCase.targetId },
    status: moderationCase.status,
    revision: moderationCase.revision,
    reports: reports.map((report) => ({
      id: report.id,
      reporter: {
        id: report.reporterIdSnapshot,
        nickname: report.reporterNicknameSnapshot,
      },
      signal: report.signal,
      details: report.details,
      evidence: report.evidence,
      createdAt: report.createdAt.toISOString(),
    })),
    decisions: decisions.map((decision) => ({
      id: decision.id,
      ref: decision.decisionRef,
      kind: decision.commandKind as Exclude<
        CampusMapModerationCommand["kind"],
        "report"
      >,
      actor: {
        id: decision.actorIdSnapshot,
        nickname: decision.actorNicknameSnapshot,
      },
      reason: decision.reason,
      before: decision.before,
      after: decision.after,
      createdAt: decision.createdAt.toISOString(),
    })),
    internalNotes: decisions.flatMap((decision) =>
      decision.internalNote === null ? [] : [decision.internalNote],
    ),
    createdAt: moderationCase.createdAt.toISOString(),
    updatedAt: moderationCase.updatedAt.toISOString(),
  };
  return { status: "ok", case: value };
}

/** Admin-only unredacted payload lookup; public readers never call this seam. */
export async function getCampusMapModerationTarget(
  target: CampusMapModerationTarget,
  context: CampusMapModerationAdminContext,
): Promise<CampusMapModerationTargetReadResult> {
  const authority = await readAdminAuthority(context.actorId);
  if (authority) return authority;
  const canonicalTarget = { ...target, id: target.id.toLowerCase() };
  if (
    !CAMPUS_MAP_MODERATION_TARGET_KINDS.includes(canonicalTarget.kind) ||
    !isCanonicalCampusMapUuid(canonicalTarget.id)
  ) {
    return { status: "not-found", code: "moderation-target-not-found" };
  }
  const payload = await readModerationTargetPayload(db, canonicalTarget);
  return payload
    ? { status: "ok", target: canonicalTarget, payload }
    : { status: "not-found", code: "moderation-target-not-found" };
}

export async function listCampusMapModerationQueue(
  query: CampusMapModerationQueueQuery,
  context: CampusMapModerationAdminContext,
): Promise<CampusMapModerationQueueReadResult> {
  const authority = await readAdminAuthority(context.actorId);
  if (authority) return authority;
  const limit = Math.min(50, Math.max(1, query.limit ?? 20));
  const cursor = query.cursor ? decodeQueueCursor(query.cursor) : null;
  if (query.cursor && cursor === null) {
    return { status: "ok", page: { items: [], nextCursor: null } };
  }
  if (query.signal === "review-requested" || query.signal === "warning") {
    return listChangesetSignals(query, limit, cursor);
  }
  if (query.signal === "recent-high-risk-event") {
    return listHighRiskDecisions(query, limit, cursor);
  }
  const predicates = [];
  if (query.status)
    predicates.push(eq(campusMapModerationCases.status, query.status));
  if (query.targetKind) {
    predicates.push(eq(campusMapModerationCases.targetKind, query.targetKind));
  }
  if (
    query.signal &&
    query.signal !== "report" &&
    CAMPUS_MAP_REPORT_SIGNALS.includes(query.signal as CampusMapReportSignal)
  ) {
    predicates.push(
      sql`${query.signal} = any(${campusMapModerationCases.signals})`,
    );
  }
  const from = parseDate(query.from);
  const to = parseDate(query.to);
  if (from) predicates.push(gte(campusMapModerationCases.updatedAt, from));
  if (to) predicates.push(lte(campusMapModerationCases.updatedAt, to));
  if (cursor) {
    predicates.push(
      or(
        lt(campusMapModerationCases.updatedAt, cursor.occurredAt),
        and(
          eq(campusMapModerationCases.updatedAt, cursor.occurredAt),
          lt(campusMapModerationCases.id, cursor.id),
        ),
      )!,
    );
  }
  const rows = await db
    .select()
    .from(campusMapModerationCases)
    .where(predicates.length > 0 ? and(...predicates) : undefined)
    .orderBy(
      desc(campusMapModerationCases.updatedAt),
      desc(campusMapModerationCases.id),
    )
    .limit(limit + 1);
  const visible = rows.slice(0, limit);
  return {
    status: "ok",
    page: {
      items: visible.map((row) => ({
        kind: "case",
        id: row.id,
        target: { kind: row.targetKind, id: row.targetId },
        status: row.status,
        signal: (row.signals[0] ?? "other") as CampusMapReportSignal,
        summary: `${row.reportCount} 条 ${row.signals.join("/")} 举报`,
        occurredAt: row.updatedAt.toISOString(),
      })),
      nextCursor:
        rows.length > limit && visible.length > 0
          ? encodeQueueCursor(visible.at(-1)!.updatedAt, visible.at(-1)!.id)
          : null,
    },
  };
}

async function listChangesetSignals(
  query: CampusMapModerationQueueQuery,
  limit: number,
  cursor: QueueCursor | null,
): Promise<CampusMapModerationQueueReadResult> {
  if (
    query.status !== undefined ||
    (query.targetKind !== undefined && query.targetKind !== "changeset")
  ) {
    return { status: "ok", page: { items: [], nextCursor: null } };
  }
  const predicates =
    query.signal === "review-requested"
      ? [eq(campusMapChangesets.reviewRequested, true)]
      : [sql`jsonb_array_length(${campusMapChangesets.warningSummary}) > 0`];
  const from = parseDate(query.from);
  const to = parseDate(query.to);
  if (from) predicates.push(gte(campusMapChangesets.publishedAt, from));
  if (to) predicates.push(lte(campusMapChangesets.publishedAt, to));
  if (cursor) {
    predicates.push(
      or(
        lt(campusMapChangesets.publishedAt, cursor.occurredAt),
        and(
          eq(campusMapChangesets.publishedAt, cursor.occurredAt),
          lt(campusMapChangesets.id, cursor.id),
        ),
      )!,
    );
  }
  const rows = await db
    .select({
      id: campusMapChangesets.id,
      comment: campusMapChangesets.comment,
      warningSummary: campusMapChangesets.warningSummary,
      publishedAt: campusMapChangesets.publishedAt,
    })
    .from(campusMapChangesets)
    .where(and(...predicates))
    .orderBy(
      desc(campusMapChangesets.publishedAt),
      desc(campusMapChangesets.id),
    )
    .limit(limit + 1);
  const visible = rows.slice(0, limit);
  const signal = query.signal as "review-requested" | "warning";
  return {
    status: "ok",
    page: {
      items: visible.map((row) => ({
        kind: signal,
        id: row.id,
        target: { kind: "changeset", id: row.id },
        status: null,
        signal,
        summary:
          signal === "review-requested"
            ? row.comment
            : row.warningSummary
                .map((warning) => `${warning.code} × ${warning.count}`)
                .join("、"),
        occurredAt: row.publishedAt.toISOString(),
      })),
      nextCursor:
        rows.length > limit && visible.length > 0
          ? encodeQueueCursor(visible.at(-1)!.publishedAt, visible.at(-1)!.id)
          : null,
    },
  };
}

async function listHighRiskDecisions(
  query: CampusMapModerationQueueQuery,
  limit: number,
  cursor: QueueCursor | null,
): Promise<CampusMapModerationQueueReadResult> {
  const predicates = [];
  if (query.targetKind) {
    predicates.push(
      eq(campusMapModerationDecisions.targetKind, query.targetKind),
    );
  }
  if (query.status)
    predicates.push(eq(campusMapModerationCases.status, query.status));
  const from = parseDate(query.from);
  const to = parseDate(query.to);
  if (from) predicates.push(gte(campusMapModerationDecisions.createdAt, from));
  if (to) predicates.push(lte(campusMapModerationDecisions.createdAt, to));
  if (cursor) {
    predicates.push(
      or(
        lt(campusMapModerationDecisions.createdAt, cursor.occurredAt),
        and(
          eq(campusMapModerationDecisions.createdAt, cursor.occurredAt),
          lt(campusMapModerationDecisions.id, cursor.id),
        ),
      )!,
    );
  }
  const rows = await db
    .select({
      id: campusMapModerationDecisions.id,
      commandKind: campusMapModerationDecisions.commandKind,
      targetKind: campusMapModerationDecisions.targetKind,
      targetId: campusMapModerationDecisions.targetId,
      reason: campusMapModerationDecisions.reason,
      createdAt: campusMapModerationDecisions.createdAt,
      caseStatus: campusMapModerationCases.status,
    })
    .from(campusMapModerationDecisions)
    .leftJoin(
      campusMapModerationCases,
      eq(campusMapModerationCases.id, campusMapModerationDecisions.caseId),
    )
    .where(predicates.length > 0 ? and(...predicates) : undefined)
    .orderBy(
      desc(campusMapModerationDecisions.createdAt),
      desc(campusMapModerationDecisions.id),
    )
    .limit(limit + 1);
  const visible = rows.slice(0, limit);
  return {
    status: "ok",
    page: {
      items: visible.map((row) => ({
        kind: "recent-high-risk-event",
        id: row.id,
        target: { kind: row.targetKind, id: row.targetId },
        status: row.caseStatus,
        signal: "recent-high-risk-event",
        summary: `${row.commandKind}: ${row.reason}`,
        occurredAt: row.createdAt.toISOString(),
      })),
      nextCursor:
        rows.length > limit && visible.length > 0
          ? encodeQueueCursor(visible.at(-1)!.createdAt, visible.at(-1)!.id)
          : null,
    },
  };
}

async function readEligibleActor(
  transaction: DatabaseTransaction,
  actorId: string,
): Promise<
  | EligibleActor
  | Extract<CampusMapModerationCommandResult, { status: "forbidden" }>
> {
  const [actor] = await transaction
    .select({
      id: users.id,
      email: users.email,
      emailVerified: users.emailVerified,
      nickname: users.nickname,
      role: users.role,
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
  return { id: actor.id, nickname: actor.nickname, role: actor.role };
}

async function readAdminAuthority(
  actorId: string | null,
): Promise<
  | { status: "authentication-required"; code: "authentication-required" }
  | { status: "forbidden"; code: "admin-required" }
  | null
> {
  if (actorId === null) {
    return {
      status: "authentication-required",
      code: "authentication-required",
    };
  }
  const canonical = actorId.toLowerCase();
  if (!isCanonicalCampusMapUuid(canonical)) {
    return { status: "forbidden", code: "admin-required" };
  }
  const [actor] = await db
    .select({ role: users.role, banned: users.banned })
    .from(users)
    .where(eq(users.id, canonical))
    .limit(1);
  return actor?.role === "admin" && !actor.banned
    ? null
    : { status: "forbidden", code: "admin-required" };
}

async function targetExists(
  transaction: DatabaseTransaction,
  target: CampusMapModerationTarget,
): Promise<boolean> {
  return Boolean(await readModerationTargetPayload(transaction, target));
}

async function readModerationTargetPayload(
  source: typeof db | DatabaseTransaction,
  target: CampusMapModerationTarget,
): Promise<Record<string, unknown> | undefined> {
  if (target.kind === "actor") {
    return (
      await source
        .select({
          id: users.id,
          nickname: users.nickname,
          role: users.role,
          banned: users.banned,
        })
        .from(users)
        .where(eq(users.id, target.id))
        .limit(1)
    )[0];
  }
  if (target.kind === "changeset") {
    return (
      await source
        .select()
        .from(campusMapChangesets)
        .where(eq(campusMapChangesets.id, target.id))
        .limit(1)
    )[0];
  }
  if (target.kind === "revision") {
    return (
      await source
        .select()
        .from(campusMapFactRevisions)
        .where(eq(campusMapFactRevisions.id, target.id))
        .limit(1)
    )[0];
  }
  if (target.kind === "map-note") {
    return (
      await source
        .select()
        .from(campusMapNotes)
        .where(eq(campusMapNotes.id, target.id))
        .limit(1)
    )[0];
  }
  return (
    await source
      .select()
      .from(campusMapNoteEvents)
      .where(eq(campusMapNoteEvents.id, target.id))
      .limit(1)
  )[0];
}

function validateCommand(
  command: CampusMapModerationCommand | null,
  serialized: string | null,
): Array<{ code: string; field: string }> {
  if (command === null || serialized === null) {
    return [{ code: "invalid-command", field: "command" }];
  }
  const errors: Array<{ code: string; field: string }> = [];
  if (!isCanonicalCampusMapUuid(command.idempotencyKey)) {
    errors.push({ code: "invalid-idempotency-key", field: "idempotencyKey" });
  }
  if (Buffer.byteLength(serialized, "utf8") > MAX_COMMAND_BYTES) {
    errors.push({ code: "command-too-large", field: "command" });
  }
  if (command.kind === "report") {
    if (!CAMPUS_MAP_MODERATION_TARGET_KINDS.includes(command.target.kind)) {
      errors.push({ code: "invalid-target-kind", field: "target.kind" });
    }
    if (!isCanonicalCampusMapUuid(command.target.id)) {
      errors.push({ code: "invalid-target-id", field: "target.id" });
    }
    if (!CAMPUS_MAP_REPORT_SIGNALS.includes(command.signal)) {
      errors.push({ code: "invalid-report-signal", field: "signal" });
    }
    if (command.details === "") {
      errors.push({ code: "report-details-required", field: "details" });
    } else if (
      Buffer.byteLength(command.details, "utf8") > MAX_REPORT_DETAILS_BYTES
    ) {
      errors.push({ code: "report-details-too-long", field: "details" });
    }
    if (
      command.evidence !== null &&
      Buffer.byteLength(command.evidence, "utf8") > MAX_REPORT_EVIDENCE_BYTES
    ) {
      errors.push({ code: "report-evidence-too-long", field: "evidence" });
    }
  } else {
    if (command.reason === "") {
      errors.push({ code: "reason-required", field: "reason" });
    }
    if (command.caseId !== null && !isCanonicalCampusMapUuid(command.caseId)) {
      errors.push({ code: "invalid-case-id", field: "caseId" });
    }
    if (command.kind === "decide-case") {
      if (!isCanonicalCampusMapUuid(command.caseId)) {
        errors.push({ code: "invalid-case-id", field: "caseId" });
      }
      if (
        !Number.isSafeInteger(command.expectedRevision) ||
        command.expectedRevision < 1
      ) {
        errors.push({
          code: "invalid-expected-revision",
          field: "expectedRevision",
        });
      }
    } else if (
      command.kind === "hide-map-note" ||
      command.kind === "unhide-map-note"
    ) {
      if (!isCanonicalCampusMapUuid(command.noteId)) {
        errors.push({ code: "invalid-note-id", field: "noteId" });
      }
    } else if (
      command.kind === "hide-map-note-event" ||
      command.kind === "unhide-map-note-event"
    ) {
      if (!isCanonicalCampusMapUuid(command.eventId)) {
        errors.push({ code: "invalid-event-id", field: "eventId" });
      }
    } else if (
      command.kind === "redact-revision" ||
      command.kind === "revoke-revision-redaction"
    ) {
      if (!isCanonicalCampusMapUuid(command.revisionId)) {
        errors.push({ code: "invalid-revision-id", field: "revisionId" });
      }
      if (
        command.kind === "redact-revision" &&
        !CAMPUS_MAP_REVISION_REDACTION_TRIGGERS.includes(command.trigger)
      ) {
        errors.push({ code: "invalid-redaction-trigger", field: "trigger" });
      }
    } else if (command.kind === "block-contributor") {
      if (!isCanonicalCampusMapUuid(command.contributorId)) {
        errors.push({ code: "invalid-contributor-id", field: "contributorId" });
      }
      const startsAt = new Date(command.startsAt);
      const endsAt = command.endsAt === null ? null : new Date(command.endsAt);
      if (Number.isNaN(startsAt.getTime())) {
        errors.push({ code: "invalid-starts-at", field: "startsAt" });
      }
      if (
        endsAt !== null &&
        (Number.isNaN(endsAt.getTime()) ||
          endsAt.getTime() <= startsAt.getTime())
      ) {
        errors.push({ code: "invalid-ends-at", field: "endsAt" });
      }
    } else if (!isCanonicalCampusMapUuid(command.blockId)) {
      errors.push({ code: "invalid-block-id", field: "blockId" });
    }
  }
  return errors;
}

function validationFailure(
  code: string,
  field: string,
): Extract<CampusMapModerationCommandResult, { status: "validation-failed" }> {
  return { status: "validation-failed", errors: [{ code, field }] };
}

function parseDate(value: string | undefined): Date | null {
  if (value === undefined) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function encodeQueueCursor(occurredAt: Date, id: string): string {
  return Buffer.from(
    JSON.stringify({ occurredAt: occurredAt.toISOString(), id }),
    "utf8",
  ).toString("base64url");
}

function decodeQueueCursor(value: string): QueueCursor | null {
  try {
    const parsed = JSON.parse(
      Buffer.from(value, "base64url").toString("utf8"),
    ) as {
      occurredAt?: unknown;
      id?: unknown;
    };
    if (
      typeof parsed.occurredAt !== "string" ||
      typeof parsed.id !== "string" ||
      !isCanonicalCampusMapUuid(parsed.id)
    ) {
      return null;
    }
    const occurredAt = new Date(parsed.occurredAt);
    return Number.isNaN(occurredAt.getTime())
      ? null
      : { occurredAt, id: parsed.id };
  } catch {
    return null;
  }
}
