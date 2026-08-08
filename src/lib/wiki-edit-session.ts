import {
  WIKI_DRAFT_SCHEMA_VERSION,
  type WikiDraftRecord,
  type WikiDraftServerState,
} from "@/lib/wiki-draft";
import { sameWikiPageSnapshot } from "@/lib/wiki-edit-snapshot";

export type WikiEditSessionRecovery =
  | { kind: "discard" }
  | {
      kind: "resume-local";
      baseline: Pick<
        WikiDraftServerState,
        "version" | "contentGeneration" | "snapshot"
      >;
      pendingSnapshot?: string;
      localSnapshot: string;
    }
  | { kind: "manual"; reason: "stale-generation" | "server-changed" };

export type WikiEditSessionAttention = Exclude<
  WikiEditSessionRecovery,
  { kind: "discard" }
>;

export function shouldAdvanceWikiEditBaseline({
  draftMode,
  submittedSnapshot,
  authoritativeSnapshot,
  localSnapshot,
}: {
  draftMode: boolean;
  submittedSnapshot: string;
  authoritativeSnapshot: string;
  localSnapshot: string;
}) {
  return (
    draftMode ||
    submittedSnapshot === localSnapshot ||
    sameWikiPageSnapshot(submittedSnapshot, authoritativeSnapshot)
  );
}

export function restoreWikiEditSession(
  record: WikiDraftRecord,
  server: WikiDraftServerState,
): WikiEditSessionRecovery {
  if (
    record.schemaVersion !== WIKI_DRAFT_SCHEMA_VERSION ||
    record.userId !== server.userId ||
    record.pageId !== server.pageId
  ) {
    return { kind: "discard" };
  }
  if (record.contentGeneration !== server.contentGeneration) {
    return { kind: "manual", reason: "stale-generation" };
  }
  if (record.recoveryDisposition === "manual") {
    return { kind: "manual", reason: "server-changed" };
  }
  if (
    record.submittedSnapshot === undefined &&
    record.draftSnapshot === server.snapshot
  ) {
    return { kind: "discard" };
  }

  if (
    record.submittedSnapshot !== undefined &&
    server.version > record.baseVersion &&
    sameWikiPageSnapshot(record.submittedSnapshot, server.snapshot) &&
    record.draftSnapshot === record.submittedSnapshot
  ) {
    return { kind: "discard" };
  }

  if (
    record.submittedSnapshot !== undefined &&
    server.version > record.baseVersion &&
    sameWikiPageSnapshot(record.submittedSnapshot, server.snapshot)
  ) {
    return {
      kind: "resume-local",
      baseline: {
        version: server.version,
        contentGeneration: server.contentGeneration,
        snapshot: server.snapshot,
      },
      localSnapshot: record.draftSnapshot,
    };
  }

  if (
    record.baseVersion <= server.version &&
    sameWikiPageSnapshot(record.baseSnapshot, server.snapshot)
  ) {
    return {
      kind: "resume-local",
      baseline: {
        version: server.version,
        contentGeneration: server.contentGeneration,
        snapshot: server.snapshot,
      },
      ...(record.submittedSnapshot === undefined
        ? {}
        : { pendingSnapshot: record.submittedSnapshot }),
      localSnapshot: record.draftSnapshot,
    };
  }

  if (record.baseVersion > server.version) {
    return {
      kind: "resume-local",
      baseline: {
        version: record.baseVersion,
        contentGeneration: record.contentGeneration,
        snapshot: record.baseSnapshot,
      },
      ...(record.submittedSnapshot === undefined
        ? {}
        : { pendingSnapshot: record.submittedSnapshot }),
      localSnapshot: record.draftSnapshot,
    };
  }

  return { kind: "manual", reason: "server-changed" };
}
