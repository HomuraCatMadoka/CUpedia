import { extractText } from "@/lib/plate-utils";

export interface WikiEditSnapshot {
  title: string;
  icon: string | null;
  content: string;
  parentId: string | null;
  /** Session metadata; it is not part of the public Page state. */
  editSummary: string;
}

function normalizeWikiEditSnapshot(value: unknown): WikiEditSnapshot | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<WikiEditSnapshot>;
  if (
    typeof candidate.title !== "string" ||
    typeof candidate.content !== "string" ||
    (candidate.icon !== null && typeof candidate.icon !== "string") ||
    (candidate.parentId !== null && typeof candidate.parentId !== "string") ||
    (candidate.editSummary !== undefined &&
      typeof candidate.editSummary !== "string")
  ) {
    return null;
  }
  return {
    title: candidate.title,
    icon: candidate.icon,
    content: candidate.content,
    parentId: candidate.parentId,
    editSummary: candidate.editSummary ?? "",
  };
}

export function serializeWikiEditSnapshot(snapshot: WikiEditSnapshot) {
  return JSON.stringify(snapshot);
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
    leftPage.parentId === rightPage.parentId
  );
}

export function wikiEditSnapshotCopyText(snapshot: string) {
  const draft = tryParseWikiEditSnapshot(snapshot);
  if (!draft) return snapshot;
  return [draft.title || "未命名", extractText(draft.content)]
    .filter(Boolean)
    .join("\n\n");
}
