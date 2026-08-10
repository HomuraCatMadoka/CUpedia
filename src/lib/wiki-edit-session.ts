import {
  compareWikiDraftBaselines,
  WIKI_DRAFT_SCHEMA_VERSION,
  type WikiDraftRecord,
  type WikiDraftServerState,
  type WikiDraftSubmission,
} from "./wiki-draft";
import {
  serializeWikiEditSnapshot,
  sameWikiPageSnapshot,
  tryParseWikiEditSnapshot,
} from "./wiki-edit-snapshot";
import { threeWayMergeContent } from "./merge-content";

export type WikiEditSessionRecovery =
  | { kind: "discard" }
  | {
      kind: "resume-local";
      baseline: Pick<
        WikiDraftServerState,
        "version" | "contentGeneration" | "snapshot"
      >;
      pendingSnapshot?: string;
      /** Private-draft write already visible on the server at boot. */
      settledSubmissionId?: string;
      localSnapshot: string;
    }
  | { kind: "manual"; reason: "stale-generation" | "server-changed" };

export type WikiEditSessionAttention = Exclude<
  WikiEditSessionRecovery,
  { kind: "discard" }
>;

export interface WikiEditSessionLease {
  isCurrent: () => boolean;
  release: () => void;
}

export interface WikiPreparedSubmission extends WikiDraftSubmission {
  isCurrent: () => boolean;
}

export function createWikiEditSessionLeaseRegistry() {
  const activeLeases = new Map<string, symbol>();

  return {
    claim(sessionKey: string): WikiEditSessionLease {
      const token = Symbol(sessionKey);
      activeLeases.set(sessionKey, token);
      let released = false;

      return {
        isCurrent: () => !released && activeLeases.get(sessionKey) === token,
        release: () => {
          if (released) return;
          released = true;
          if (activeLeases.get(sessionKey) === token) {
            activeLeases.delete(sessionKey);
          }
        },
      };
    },
  };
}

export const wikiEditSessionLeases = createWikiEditSessionLeaseRegistry();

function rebaseTrailingField<T>(base: T, local: T, authoritative: T) {
  const localChanged = local !== base;
  const authoritativeChanged = authoritative !== base;
  if (localChanged && authoritativeChanged && local !== authoritative) {
    return { clean: false as const };
  }
  return {
    clean: true as const,
    value: authoritativeChanged ? authoritative : local,
  };
}

/** Rebase edits made behind a committed request onto its actual Page result. */
export async function rebaseTrailingWikiEditSnapshot({
  submittedSnapshot,
  authoritativeSnapshot,
  localSnapshot,
}: {
  submittedSnapshot: string;
  authoritativeSnapshot: string;
  localSnapshot: string;
}): Promise<string | null> {
  const submitted = tryParseWikiEditSnapshot(submittedSnapshot);
  const authoritative = tryParseWikiEditSnapshot(authoritativeSnapshot);
  const local = tryParseWikiEditSnapshot(localSnapshot);
  if (!submitted || !authoritative || !local) return null;

  const title = rebaseTrailingField(
    submitted.title,
    local.title,
    authoritative.title,
  );
  const icon = rebaseTrailingField(
    submitted.icon,
    local.icon,
    authoritative.icon,
  );
  const parentId = rebaseTrailingField(
    submitted.parentId,
    local.parentId,
    authoritative.parentId,
  );
  if (!title.clean || !icon.clean || !parentId.clean) return null;

  const content = await threeWayMergeContent({
    base: submitted.content,
    mine: local.content,
    theirs: authoritative.content,
  });
  if (!content.clean || content.content === undefined) return null;

  return serializeWikiEditSnapshot({
    title: title.value,
    icon: icon.value,
    content: content.content,
    parentId: parentId.value,
    editSummary: local.editSummary,
    hiddenChildPageIds:
      authoritative.hiddenChildPageIds ??
      submitted.hiddenChildPageIds ??
      local.hiddenChildPageIds,
  });
}

export function settleWikiEditSessionSubmission(
  record: WikiDraftRecord,
  settlement: {
    submissionId: string;
    nextBase: Pick<
      WikiDraftServerState,
      "version" | "contentGeneration" | "snapshot"
    >;
    latestDraftSnapshot?: string;
    deleteIfClean: boolean;
  },
):
  | { kind: "stale"; record: WikiDraftRecord }
  | { kind: "settled"; record: WikiDraftRecord | null } {
  if (record.submitted?.id !== settlement.submissionId) {
    return { kind: "stale", record };
  }

  const latestRecord =
    settlement.latestDraftSnapshot === undefined
      ? record
      : { ...record, draftSnapshot: settlement.latestDraftSnapshot };
  const settled = { ...latestRecord };
  delete settled.submitted;
  delete settled.submittedSnapshot;
  const advancesBaseline =
    compareWikiDraftBaselines(settlement.nextBase, {
      version: record.baseVersion,
      contentGeneration: record.contentGeneration,
      snapshot: record.baseSnapshot,
    }) >= 0;
  const next = {
    ...settled,
    ...(advancesBaseline
      ? {
          baseVersion: settlement.nextBase.version,
          contentGeneration: settlement.nextBase.contentGeneration,
          baseSnapshot: settlement.nextBase.snapshot,
        }
      : {}),
  };
  return {
    kind: "settled",
    record:
      settlement.deleteIfClean &&
      latestRecord.draftSnapshot === record.submitted.snapshot
        ? null
        : next,
  };
}

export function rejectWikiEditSessionSubmission(
  record: WikiDraftRecord,
  submissionId: string,
):
  | { kind: "stale"; record: WikiDraftRecord }
  | { kind: "rejected"; record: WikiDraftRecord } {
  if (record.submitted?.id !== submissionId) {
    return { kind: "stale", record };
  }

  const rejected = { ...record };
  delete rejected.submitted;
  delete rejected.submittedSnapshot;
  return { kind: "rejected", record: rejected };
}

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
  // A successful mutation may advance CAS when its Page was confirmed, or
  // when the local tail changed only session metadata. If both the server Page
  // and the trailing local Page diverged, the old ancestor is still required
  // for the next three-way merge.
  return (
    draftMode ||
    submittedSnapshot === localSnapshot ||
    sameWikiPageSnapshot(submittedSnapshot, authoritativeSnapshot) ||
    sameWikiPageSnapshot(submittedSnapshot, localSnapshot)
  );
}

export function restoreWikiEditSession(
  record: WikiDraftRecord,
  server: WikiDraftServerState,
): WikiEditSessionRecovery {
  if (
    record.schemaVersion !== WIKI_DRAFT_SCHEMA_VERSION ||
    record.userId !== server.userId ||
    record.pageId !== server.pageId ||
    record.documentKind !== server.documentKind
  ) {
    return { kind: "discard" };
  }
  const submittedSnapshot =
    record.submitted?.snapshot ?? record.submittedSnapshot;
  if (record.recoveryDisposition === "legacy-ambiguous") {
    const submitted =
      submittedSnapshot === undefined
        ? null
        : tryParseWikiEditSnapshot(submittedSnapshot);
    const alreadyMatchesServer =
      submittedSnapshot === undefined &&
      record.draftSnapshot === server.snapshot;
    const submittedAlreadySettled =
      submittedSnapshot !== undefined &&
      record.draftSnapshot === submittedSnapshot &&
      (submittedSnapshot === server.snapshot ||
        (submitted?.editSummary === "" &&
          record.contentGeneration === server.contentGeneration &&
          server.version > record.baseVersion &&
          sameWikiPageSnapshot(submittedSnapshot, server.snapshot)));
    return alreadyMatchesServer || submittedAlreadySettled
      ? { kind: "discard" }
      : { kind: "manual", reason: "server-changed" };
  }
  if (record.contentGeneration !== server.contentGeneration) {
    return { kind: "manual", reason: "stale-generation" };
  }
  if (record.recoveryDisposition === "manual") {
    return { kind: "manual", reason: "server-changed" };
  }
  if (record.documentKind === "page" && record.submitted) {
    return {
      kind: "resume-local",
      baseline: {
        version: record.baseVersion,
        contentGeneration: record.contentGeneration,
        snapshot: record.baseSnapshot,
      },
      pendingSnapshot: record.submitted.snapshot,
      localSnapshot: record.draftSnapshot,
    };
  }
  if (
    submittedSnapshot === undefined &&
    record.draftSnapshot === server.snapshot
  ) {
    return { kind: "discard" };
  }

  if (
    submittedSnapshot !== undefined &&
    server.version > record.baseVersion &&
    sameWikiPageSnapshot(submittedSnapshot, server.snapshot) &&
    record.draftSnapshot === submittedSnapshot
  ) {
    return { kind: "discard" };
  }

  if (
    submittedSnapshot !== undefined &&
    server.version > record.baseVersion &&
    sameWikiPageSnapshot(submittedSnapshot, server.snapshot)
  ) {
    return {
      kind: "resume-local",
      baseline: {
        version: server.version,
        contentGeneration: server.contentGeneration,
        snapshot: server.snapshot,
      },
      ...(record.documentKind === "draft" && record.submitted
        ? { settledSubmissionId: record.submitted.id }
        : {}),
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
      ...(submittedSnapshot === undefined
        ? {}
        : { pendingSnapshot: submittedSnapshot }),
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
      ...(submittedSnapshot === undefined
        ? {}
        : { pendingSnapshot: submittedSnapshot }),
      localSnapshot: record.draftSnapshot,
    };
  }

  return { kind: "manual", reason: "server-changed" };
}
