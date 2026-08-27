import type { CampusMapTaskReturnContext } from "./scene-kernel";
import {
  canonicalizeCampusMapUuid,
  isCanonicalCampusMapUuid,
} from "./canonical-uuid";

export const CAMPUS_MAP_NOTE_STATUSES = [
  "open",
  "closed",
  "moderator-hidden",
] as const;

export type CampusMapNoteStatus = (typeof CAMPUS_MAP_NOTE_STATUSES)[number];

export const CAMPUS_MAP_NOTE_RESOLUTION_REASONS = [
  "fixed",
  "not-an-issue",
  "duplicate",
  "insufficient-information",
  "other",
] as const;

export type CampusMapNoteResolutionReason =
  (typeof CAMPUS_MAP_NOTE_RESOLUTION_REASONS)[number];

export interface CampusMapNotePosition {
  longitude: number;
  latitude: number;
  crs: "wgs84";
}

export type CampusMapNoteCommand =
  | {
      kind: "create";
      idempotencyKey: string;
      placeId: string | null;
      position: CampusMapNotePosition | null;
      openingComment: string;
    }
  | {
      kind: "comment";
      idempotencyKey: string;
      noteId: string;
      comment: string;
    }
  | {
      kind: "resolve";
      idempotencyKey: string;
      noteId: string;
      expectedRevision: number;
      resolution: {
        reason: CampusMapNoteResolutionReason;
        resolvedByChangesetId: string | null;
      };
      comment: string | null;
    }
  | {
      kind: "reopen";
      idempotencyKey: string;
      noteId: string;
      expectedRevision: number;
      comment: string;
    };

export type CampusMapNoteCommandResult =
  | {
      status: "created" | "commented" | "resolved" | "reopened";
      noteId: string;
      eventId: string;
      revision: number;
    }
  | {
      status: "conflict";
      code: "note-revision-conflict";
      noteId: string;
      expectedRevision: number;
      currentRevision: number;
      currentStatus: CampusMapNoteStatus;
    }
  | {
      status: "rate-limited";
      code: "map-note-rate-limit";
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
        | "contributor-blocked"
        | "profile-incomplete"
        | "note-hidden";
    }
  | {
      status: "validation-failed";
      errors: Array<{
        code: string;
        field: string;
      }>;
    }
  | { status: "not-found"; code: "note-not-found" }
  | { status: "temporarily-unavailable"; code: "map-note-unavailable" };

export interface CampusMapNoteEventView {
  id: string;
  revision: number;
  kind: "opening-comment" | "comment" | "resolve" | "reopen";
  actor: { id: string; nickname: string };
  comment: string | null;
  resolution: {
    reason: CampusMapNoteResolutionReason;
    resolvedByChangesetId: string | null;
  } | null;
  createdAt: string;
}

export interface CampusMapNoteView {
  id: string;
  placeId: string | null;
  position: CampusMapNotePosition | null;
  status: CampusMapNoteStatus;
  revision: number;
  author: { id: string; nickname: string };
  createdAt: string;
  updatedAt: string;
  subscribed: boolean;
  events: CampusMapNoteEventView[];
}

export interface CampusMapNoteSummary {
  id: string;
  placeId: string | null;
  position: CampusMapNotePosition | null;
  status: CampusMapNoteStatus;
  revision: number;
  author: { id: string; nickname: string };
  excerpt: string | null;
  updatedAt: string;
}

export type CampusMapNoteQuery = {
  scope:
    | { kind: "recent" }
    | { kind: "place"; placeId: string }
    | {
        kind: "bbox";
        west: number;
        south: number;
        east: number;
        north: number;
      }
    | { kind: "author"; actorId: string }
    | { kind: "search"; text: string };
  status?: "open" | "closed";
  cursor?: string;
  limit?: number;
};

export interface CampusMapNotePage {
  items: CampusMapNoteSummary[];
  nextCursor: string | null;
}

export interface CampusMapNoteCommandContext {
  actorId: string | null;
  clientIp: string;
  now?: Date;
}

export interface CampusMapNoteCorrectionContext {
  placeId: string;
  editHref: string;
  returnContext: CampusMapTaskReturnContext & { href: string };
}

export function createCampusMapNoteCorrectionContext(
  noteId: string,
  placeId: string,
): CampusMapNoteCorrectionContext | null {
  const canonicalNoteId = canonicalizeCampusMapUuid(noteId);
  const canonicalPlaceId = canonicalizeCampusMapUuid(placeId);
  if (
    !isCanonicalCampusMapUuid(canonicalNoteId) ||
    !isCanonicalCampusMapUuid(canonicalPlaceId)
  ) {
    return null;
  }
  const query = new URLSearchParams({
    v: "1",
    task: "edit",
    id: canonicalPlaceId,
    returnNote: canonicalNoteId,
  });
  return {
    placeId: canonicalPlaceId,
    editHref: `/prototype/campus-map?${query.toString()}`,
    returnContext: {
      kind: "map-note",
      noteId: canonicalNoteId,
      href: `/campus-map/notes/${canonicalNoteId}`,
    },
  };
}

export function normalizeCampusMapNoteCommand(
  command: CampusMapNoteCommand,
): CampusMapNoteCommand {
  if (command.kind === "create") {
    return {
      ...command,
      idempotencyKey: canonicalizeCampusMapUuid(command.idempotencyKey),
      placeId:
        command.placeId === null
          ? null
          : canonicalizeCampusMapUuid(command.placeId),
      openingComment: command.openingComment.trim(),
    };
  }
  if (command.kind === "comment") {
    return {
      ...command,
      idempotencyKey: canonicalizeCampusMapUuid(command.idempotencyKey),
      noteId: canonicalizeCampusMapUuid(command.noteId),
      comment: command.comment.trim(),
    };
  }
  if (command.kind === "resolve") {
    return {
      ...command,
      idempotencyKey: canonicalizeCampusMapUuid(command.idempotencyKey),
      noteId: canonicalizeCampusMapUuid(command.noteId),
      resolution: {
        ...command.resolution,
        resolvedByChangesetId:
          command.resolution.resolvedByChangesetId === null
            ? null
            : canonicalizeCampusMapUuid(
                command.resolution.resolvedByChangesetId,
              ),
      },
      comment: command.comment?.trim() || null,
    };
  }
  return {
    ...command,
    idempotencyKey: canonicalizeCampusMapUuid(command.idempotencyKey),
    noteId: canonicalizeCampusMapUuid(command.noteId),
    comment: command.comment.trim(),
  };
}
