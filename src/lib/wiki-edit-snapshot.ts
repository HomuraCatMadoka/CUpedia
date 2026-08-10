import { extractText } from "./plate-utils";

export interface WikiEditSnapshot {
  title: string;
  icon: string | null;
  content: string;
  parentId: string | null;
  /** Session metadata; it is not part of the public Page state. */
  editSummary: string;
  /** Exact tree projection; absent only while reading a legacy snapshot. */
  hiddenChildPageIds?: string[];
}

function normalizeHiddenChildPageIds(value: unknown) {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.some((id) => typeof id !== "string")) {
    return null;
  }
  return [...new Set(value)].sort();
}

function normalizeWikiEditSnapshot(value: unknown): WikiEditSnapshot | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<WikiEditSnapshot>;
  const hiddenChildPageIds = normalizeHiddenChildPageIds(
    candidate.hiddenChildPageIds,
  );
  if (
    typeof candidate.title !== "string" ||
    typeof candidate.content !== "string" ||
    (candidate.icon !== null && typeof candidate.icon !== "string") ||
    (candidate.parentId !== null && typeof candidate.parentId !== "string") ||
    (candidate.editSummary !== undefined &&
      typeof candidate.editSummary !== "string") ||
    hiddenChildPageIds === null
  ) {
    return null;
  }
  return {
    title: candidate.title,
    icon: candidate.icon,
    content: candidate.content,
    parentId: candidate.parentId,
    editSummary: candidate.editSummary ?? "",
    ...(hiddenChildPageIds === undefined ? {} : { hiddenChildPageIds }),
  };
}

export function serializeWikiEditSnapshot(snapshot: WikiEditSnapshot) {
  const hiddenChildPageIds = normalizeHiddenChildPageIds(
    snapshot.hiddenChildPageIds ?? [],
  );
  if (hiddenChildPageIds === null || hiddenChildPageIds === undefined) {
    throw new Error("Invalid wiki edit projection");
  }
  return JSON.stringify({
    ...snapshot,
    hiddenChildPageIds,
  });
}

export function parseWikiEditSnapshot(snapshot: string): WikiEditSnapshot {
  let value: unknown;
  try {
    value = JSON.parse(snapshot);
  } catch {
    throw new Error("Invalid wiki edit snapshot");
  }
  const parsed = normalizeWikiEditSnapshot(value);
  if (!parsed) throw new Error("Invalid wiki edit snapshot");
  return parsed;
}

export function tryParseWikiEditSnapshot(snapshot: string) {
  try {
    return parseWikiEditSnapshot(snapshot);
  } catch {
    return null;
  }
}

/** Compare public Page fields while ignoring session-only edit metadata. */
export function sameWikiPageSnapshot(left: string, right: string) {
  const leftPage = tryParseWikiEditSnapshot(left);
  const rightPage = tryParseWikiEditSnapshot(right);
  return (
    leftPage !== null &&
    rightPage !== null &&
    leftPage.title === rightPage.title &&
    leftPage.icon === rightPage.icon &&
    leftPage.content === rightPage.content &&
    leftPage.parentId === rightPage.parentId &&
    JSON.stringify(leftPage.hiddenChildPageIds ?? []) ===
      JSON.stringify(rightPage.hiddenChildPageIds ?? [])
  );
}

export function wikiEditSnapshotCopyText(snapshot: string) {
  const draft = tryParseWikiEditSnapshot(snapshot);
  if (!draft) return snapshot;
  return [draft.title || "未命名", extractText(draft.content)]
    .filter(Boolean)
    .join("\n\n");
}
