/** Write-side revision coalescing — see ADR 0009.
 *
 * `writeWikiPage` collapses a run of same-author edits inside a sliding idle
 * window into a single `wikiRevision` (updating the latest one in place) instead
 * of inserting a row per autosave. This module holds the pure decision so it can
 * be tested without a database. */

export const REVISION_COALESCE_WINDOW_MS = 5 * 60 * 1000;

/** editSummary written by `createWikiPage` for a page's first revision. */
export const CREATE_REVISION_SUMMARY = "创建页面";
/** editSummary prefix written by `rollbackToRevision` (`<prefix><revisionId>`). */
export const ROLLBACK_REVISION_SUMMARY_PREFIX = "回滚至版本 ";

export interface PreviousRevision {
  editedBy: string;
  createdAt: Date;
  editSummary: string | null;
}

/** A checkpoint (page creation / rollback) must stand on its own — it is an
 * intentional marker in the history and must not be absorbed by a following
 * edit. We recognise checkpoints by the machine-generated summaries their
 * writers stamp (the constants above), so no schema column is needed. */
function isCheckpointSummary(summary: string | null): boolean {
  if (summary === null) return false;
  return (
    summary === CREATE_REVISION_SUMMARY ||
    summary.startsWith(ROLLBACK_REVISION_SUMMARY_PREFIX)
  );
}

/** True when the incoming write should be folded into `previous` (update it in
 * place) rather than inserted as a new revision. Coalesce only a continuation of
 * the same author's editing sitting: same author, within the idle window, and
 * the previous revision is an ordinary edit (not a checkpoint). */
export function shouldCoalesceRevision(
  previous: PreviousRevision | null | undefined,
  next: { userId: string; at: Date },
  windowMs: number = REVISION_COALESCE_WINDOW_MS,
): boolean {
  if (!previous) return false;
  if (isCheckpointSummary(previous.editSummary)) return false;
  if (previous.editedBy !== next.userId) return false;
  return next.at.getTime() - previous.createdAt.getTime() <= windowMs;
}
