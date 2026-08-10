import { createHash } from "node:crypto";

export interface WikiPageSubmissionPayload {
  pageId: string;
  title: string;
  icon?: string | null;
  content: string;
  editSummary?: string;
  parentId?: string | null;
  baseTitle?: string;
  baseIcon?: string | null;
  baseContent?: string;
  baseParentId?: string | null;
  hiddenChildPageIds?: string[];
}

function optionalValue<T>(value: T | undefined) {
  return value === undefined
    ? (["omitted"] as const)
    : (["provided", value] as const);
}

/** Binds an idempotency key to the immutable command, excluding CAS metadata. */
export function fingerprintWikiPageSubmission(
  submission: WikiPageSubmissionPayload,
) {
  const canonicalPayload = JSON.stringify({
    pageId: submission.pageId,
    title: submission.title,
    icon: optionalValue(submission.icon),
    content: submission.content,
    editSummary: optionalValue(submission.editSummary),
    parentId: optionalValue(submission.parentId),
    baseTitle: optionalValue(submission.baseTitle),
    baseIcon: optionalValue(submission.baseIcon),
    baseContent: optionalValue(submission.baseContent),
    baseParentId: optionalValue(submission.baseParentId),
    hiddenChildPageIds: optionalValue(
      submission.hiddenChildPageIds === undefined
        ? undefined
        : [...new Set(submission.hiddenChildPageIds)].sort(),
    ),
  });
  return createHash("sha256").update(canonicalPayload).digest("hex");
}
