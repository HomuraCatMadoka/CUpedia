import { canonicalizeCampusMapUuid } from "./canonical-uuid";

export const CAMPUS_MAP_MODERATION_TARGET_KINDS = [
  "changeset",
  "revision",
  "map-note",
  "map-note-event",
  "actor",
] as const;
export type CampusMapModerationTargetKind =
  (typeof CAMPUS_MAP_MODERATION_TARGET_KINDS)[number];

export const CAMPUS_MAP_REPORT_SIGNALS = [
  "privacy",
  "copyright",
  "harassment",
  "spam",
  "vandalism",
  "other",
] as const;
export type CampusMapReportSignal = (typeof CAMPUS_MAP_REPORT_SIGNALS)[number];

export const CAMPUS_MAP_MODERATION_CASE_STATUSES = [
  "open",
  "ignored",
  "resolved",
  "reopened",
] as const;
export type CampusMapModerationCaseStatus =
  (typeof CAMPUS_MAP_MODERATION_CASE_STATUSES)[number];

export const CAMPUS_MAP_CONTRIBUTOR_BLOCK_SCOPES = [
  "publish",
  "map-notes",
  "all",
] as const;
export type CampusMapContributorBlockScope =
  (typeof CAMPUS_MAP_CONTRIBUTOR_BLOCK_SCOPES)[number];

export type CampusMapModerationTarget = {
  kind: CampusMapModerationTargetKind;
  id: string;
};

type CommandBase = { idempotencyKey: string };
type AdminCommandBase = CommandBase & {
  reason: string;
  caseId: string | null;
};
type MapNoteVisibilityCommand<
  Kind extends "hide-map-note" | "unhide-map-note",
> = AdminCommandBase & {
  kind: Kind;
  noteId: string;
  expectedVisibility: "public" | "hidden";
};
type MapNoteEventVisibilityCommand<
  Kind extends "hide-map-note-event" | "unhide-map-note-event",
> = AdminCommandBase & {
  kind: Kind;
  eventId: string;
  expectedVisibility: "public" | "hidden";
};
type RevisionRedactionCommand<
  Kind extends "redact-revision" | "revoke-revision-redaction",
> = AdminCommandBase & {
  kind: Kind;
  revisionId: string;
  expectedVisibility: "public" | "redacted";
};

export type CampusMapModerationCommand =
  | (CommandBase & {
      kind: "report";
      target: CampusMapModerationTarget;
      signal: CampusMapReportSignal;
      details: string;
      evidence: string | null;
    })
  | (AdminCommandBase & {
      kind: "decide-case";
      caseId: string;
      expectedRevision: number;
      status: CampusMapModerationCaseStatus;
      internalNote: string | null;
    })
  | MapNoteVisibilityCommand<"hide-map-note">
  | MapNoteVisibilityCommand<"unhide-map-note">
  | MapNoteEventVisibilityCommand<"hide-map-note-event">
  | MapNoteEventVisibilityCommand<"unhide-map-note-event">
  | RevisionRedactionCommand<"redact-revision">
  | RevisionRedactionCommand<"revoke-revision-redaction">
  | (AdminCommandBase & {
      kind: "block-contributor";
      contributorId: string;
      scope: CampusMapContributorBlockScope;
      startsAt: string;
      endsAt: string | null;
      needsAcknowledgement: boolean;
    })
  | (AdminCommandBase & {
      kind: "revoke-contributor-block";
      blockId: string;
    });

export interface CampusMapModerationCommandContext {
  actorId: string | null;
  clientIp: string;
  now?: Date;
}

export type CampusMapModerationCommandResult =
  | {
      status: "reported";
      reportId: string;
      caseId: string;
      caseRevision: number;
      caseStatus: CampusMapModerationCaseStatus;
    }
  | {
      status: "decided";
      decisionId: string;
      decisionRef: string;
      caseId: string | null;
      caseRevision: number | null;
      caseStatus: CampusMapModerationCaseStatus | null;
      blockId?: string;
    }
  | {
      status: "conflict";
      code: "moderation-state-conflict";
      expected: string | number;
      current: string | number | null;
    }
  | {
      status: "rate-limited";
      code: "moderation-report-rate-limit";
      scope: "actor" | "ip";
      policy: "burst" | "sustained";
      retryAfter: number;
    }
  | { status: "authentication-required"; code: "authentication-required" }
  | {
      status: "forbidden";
      code:
        | "actor-not-eligible"
        | "actor-banned"
        | "profile-incomplete"
        | "admin-required";
    }
  | { status: "not-found"; code: "moderation-target-not-found" }
  | {
      status: "validation-failed";
      errors: Array<{ code: string; field: string }>;
    }
  | {
      status: "temporarily-unavailable";
      code: "moderation-unavailable";
    };

export interface CampusMapModerationAdminContext {
  actorId: string | null;
}

export interface CampusMapModerationReportView {
  id: string;
  reporter: { id: string; nickname: string };
  signal: CampusMapReportSignal;
  details: string;
  evidence: string | null;
  createdAt: string;
}

export interface CampusMapModerationDecisionView {
  id: string;
  ref: string;
  kind: Exclude<CampusMapModerationCommand["kind"], "report">;
  actor: { id: string; nickname: string };
  reason: string;
  before: unknown;
  after: unknown;
  createdAt: string;
}

export interface CampusMapModerationCaseView {
  id: string;
  target: CampusMapModerationTarget;
  status: CampusMapModerationCaseStatus;
  revision: number;
  reports: CampusMapModerationReportView[];
  decisions: CampusMapModerationDecisionView[];
  internalNotes: string[];
  createdAt: string;
  updatedAt: string;
}

export type CampusMapModerationCaseReadResult =
  | { status: "ok"; case: CampusMapModerationCaseView }
  | { status: "authentication-required"; code: "authentication-required" }
  | { status: "forbidden"; code: "admin-required" }
  | { status: "not-found"; code: "moderation-case-not-found" };

export type CampusMapModerationTargetReadResult =
  | {
      status: "ok";
      target: CampusMapModerationTarget;
      payload: Record<string, unknown>;
    }
  | { status: "authentication-required"; code: "authentication-required" }
  | { status: "forbidden"; code: "admin-required" }
  | { status: "not-found"; code: "moderation-target-not-found" };

export type CampusMapModerationQueueSignal =
  | CampusMapReportSignal
  | "report"
  | "review-requested"
  | "warning"
  | "recent-high-risk-event";

export interface CampusMapModerationQueueQuery {
  signal?: CampusMapModerationQueueSignal;
  targetKind?: CampusMapModerationTargetKind;
  status?: CampusMapModerationCaseStatus;
  from?: string;
  to?: string;
  cursor?: string;
  limit?: number;
}

export interface CampusMapModerationQueueItem {
  kind: "case" | "review-requested" | "warning" | "recent-high-risk-event";
  id: string;
  target: CampusMapModerationTarget;
  status: CampusMapModerationCaseStatus | null;
  signal: CampusMapModerationQueueSignal;
  summary: string;
  occurredAt: string;
}

export interface CampusMapModerationQueuePage {
  items: CampusMapModerationQueueItem[];
  nextCursor: string | null;
}

export type CampusMapModerationQueueReadResult =
  | { status: "ok"; page: CampusMapModerationQueuePage }
  | { status: "authentication-required"; code: "authentication-required" }
  | { status: "forbidden"; code: "admin-required" };

export function normalizeCampusMapModerationCommand(
  command: CampusMapModerationCommand,
): CampusMapModerationCommand {
  const idempotencyKey = canonicalizeCampusMapUuid(command.idempotencyKey);
  if (command.kind === "report") {
    return {
      ...command,
      idempotencyKey,
      target: {
        ...command.target,
        id: canonicalizeCampusMapUuid(command.target.id),
      },
      details: command.details.trim(),
      evidence: command.evidence?.trim() || null,
    };
  }
  const caseId =
    command.caseId === null ? null : canonicalizeCampusMapUuid(command.caseId);
  const reason = command.reason.trim();
  if (command.kind === "decide-case") {
    return {
      ...command,
      idempotencyKey,
      reason,
      caseId: canonicalizeCampusMapUuid(command.caseId),
      internalNote: command.internalNote?.trim() || null,
    };
  }
  if (command.kind === "hide-map-note" || command.kind === "unhide-map-note") {
    return {
      ...command,
      idempotencyKey,
      reason,
      caseId,
      noteId: canonicalizeCampusMapUuid(command.noteId),
    };
  }
  if (
    command.kind === "hide-map-note-event" ||
    command.kind === "unhide-map-note-event"
  ) {
    return {
      ...command,
      idempotencyKey,
      reason,
      caseId,
      eventId: canonicalizeCampusMapUuid(command.eventId),
    };
  }
  if (
    command.kind === "redact-revision" ||
    command.kind === "revoke-revision-redaction"
  ) {
    return {
      ...command,
      idempotencyKey,
      reason,
      caseId,
      revisionId: canonicalizeCampusMapUuid(command.revisionId),
    };
  }
  if (command.kind === "block-contributor") {
    return {
      ...command,
      idempotencyKey,
      reason,
      caseId,
      contributorId: canonicalizeCampusMapUuid(command.contributorId),
    };
  }
  return {
    ...command,
    idempotencyKey,
    reason,
    caseId,
    blockId: canonicalizeCampusMapUuid(command.blockId),
  };
}
