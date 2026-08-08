export type WikiDocumentKind = "page" | "draft";

export interface WikiSyncRevision {
  documentKind: WikiDocumentKind;
  userId: string;
  pageId: string;
  version: number;
  contentGeneration: number;
  updatedAt: string;
  snapshot: string;
}

export interface WikiSyncTarget {
  documentKind: WikiDocumentKind;
  userId: string | undefined;
  pageId: string;
  version: number | undefined;
  dirty: boolean;
}

export const WIKI_SYNC_CHANNEL = "cupedia-wiki-sync";
export const WIKI_SYNC_POLL_INTERVAL_MS = 2_000;

/** Decide whether one complete authoritative revision may replace the editor. */
export function shouldAdoptWikiSyncRevision(
  target: WikiSyncTarget,
  revision: Partial<WikiSyncRevision>,
): revision is WikiSyncRevision {
  return (
    !target.dirty &&
    typeof target.userId === "string" &&
    target.userId.length > 0 &&
    revision.userId === target.userId &&
    revision.documentKind === target.documentKind &&
    revision.pageId === target.pageId &&
    typeof revision.version === "number" &&
    revision.version > (target.version ?? 0) &&
    typeof revision.contentGeneration === "number" &&
    typeof revision.updatedAt === "string" &&
    typeof revision.snapshot === "string"
  );
}
