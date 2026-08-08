import type { PlateValue } from "@/lib/plate-utils";

type Node = {
  type?: unknown;
  text?: unknown;
  pageId?: unknown;
  url?: unknown;
  children?: Node[];
};
type ResolvableNode = {
  pageId?: unknown;
  url?: unknown;
  children?: unknown;
  [key: string]: unknown;
};

const WIKI_PAGE_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const WIKI_PAGE_URL_PATTERN =
  /^(?:https:\/\/(?:www\.)?cupedia\.org)?\/wiki\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:[?#].*)?$/i;

export function isWikiPageId(value: unknown): value is string {
  return typeof value === "string" && WIKI_PAGE_ID_PATTERN.test(value);
}

function getWikiPageId(node: Pick<Node, "pageId" | "url">) {
  if (isWikiPageId(node.pageId)) return node.pageId;
  if (typeof node.url !== "string") return null;
  return node.url.match(WIKI_PAGE_URL_PATTERN)?.[1] ?? null;
}

function walk(nodes: Node[], targets: Set<string>): void {
  for (const node of nodes) {
    const pageId = getWikiPageId(node);
    if (pageId) targets.add(pageId);
    if (node.children) walk(node.children, targets);
  }
}

function getStandaloneWikiLinkTarget(block: unknown): string | null {
  const node = block as Node;
  if (node.type !== "p" || !Array.isArray(node.children)) return null;
  const meaningfulChildren = node.children.filter(
    (child) => !(typeof child.text === "string" && child.text.length === 0),
  );
  if (meaningfulChildren.length !== 1) return null;
  return getWikiPageId(meaningfulChildren[0]);
}

/** Collect unique target page IDs from wiki-link nodes in Plate JSON content. */
export function extractWikiLinkTargets(content: string): string[] {
  if (!content.trim()) return [];
  let nodes: Node[];
  try {
    nodes = JSON.parse(content) as Node[];
  } catch {
    return [];
  }
  const targets = new Set<string>();
  walk(nodes, targets);
  return Array.from(targets);
}

/**
 * Remove legacy Notion-style paragraphs that contain only a direct child link.
 * The canonical child region renders those pages in persisted sibling order.
 */
export function stripLegacyChildPageLinks(
  value: PlateValue,
  childPageIds: ReadonlySet<string>,
): PlateValue {
  const filtered = value.filter((block) => {
    const targetId = getStandaloneWikiLinkTarget(block);
    return !targetId || !childPageIds.has(targetId);
  });

  return filtered.length > 0
    ? (filtered as PlateValue)
    : ([{ type: "p", children: [{ text: "" }] }] as PlateValue);
}

/**
 * Reconstitute the stored document after editing a display projection.
 *
 * Direct-child links are hidden in the editor because the child-page region
 * renders them canonically. They still belong to the stored document: if that
 * child later moves elsewhere, the link becomes ordinary visible content.
 * Preserve only links the editor was known to hide, while honoring deletion
 * of every link that was visible to the editor.
 */
export function restoreLegacyChildPageLinks(
  storedValue: PlateValue,
  editorValue: PlateValue,
  hiddenChildPageIds: ReadonlySet<string>,
): PlateValue {
  if (hiddenChildPageIds.size === 0) return editorValue;

  const submittedCounts = new Map<string, number>();
  for (const block of editorValue) {
    const targetId = getStandaloneWikiLinkTarget(block);
    if (!targetId || !hiddenChildPageIds.has(targetId)) continue;
    submittedCounts.set(targetId, (submittedCounts.get(targetId) ?? 0) + 1);
  }

  const missing: { block: PlateValue[number]; index: number }[] = [];
  storedValue.forEach((block, index) => {
    const targetId = getStandaloneWikiLinkTarget(block);
    if (!targetId || !hiddenChildPageIds.has(targetId)) return;

    const submittedCount = submittedCounts.get(targetId) ?? 0;
    if (submittedCount > 0) {
      submittedCounts.set(targetId, submittedCount - 1);
      return;
    }
    missing.push({ block, index });
  });

  if (missing.length === 0) return editorValue;
  const restored = [...editorValue] as PlateValue;
  for (const candidate of missing) {
    restored.splice(
      Math.min(candidate.index, restored.length),
      0,
      candidate.block,
    );
  }
  return restored;
}

export function buildWikiLinkRows(
  pages: { id: string; content: string; deletedAt?: Date | null }[],
): { sourceId: string; targetId: string }[] {
  const pageIds = new Set(pages.map((page) => page.id));
  return pages.flatMap((page) =>
    extractWikiLinkTargets(page.content)
      .filter((targetId) => targetId !== page.id && pageIds.has(targetId))
      .map((targetId) => ({ sourceId: page.id, targetId })),
  );
}

/**
 * Resolve internal wiki-link URLs from their stable page IDs.
 *
 * `pageId` is the source of truth. Its URL remains valid while the page is
 * live, deleted (tombstone), or later restored.
 */
export function resolveWikiLinkUrls<T>(value: T): T {
  const visit = (input: unknown): unknown => {
    if (Array.isArray(input)) {
      let changed = false;
      const next = input.map((item) => {
        const resolved = visit(item);
        if (resolved !== item) changed = true;
        return resolved;
      });
      return changed ? next : input;
    }
    if (!input || typeof input !== "object") return input;

    const node = input as ResolvableNode;
    const resolvedChildren = visit(node.children);
    const pageId = isWikiPageId(node.pageId) ? node.pageId : undefined;
    const resolvedUrl = pageId ? `/wiki/${pageId}` : node.url;
    if (resolvedChildren === node.children && resolvedUrl === node.url) {
      return input;
    }
    return {
      ...node,
      ...(resolvedChildren !== node.children
        ? { children: resolvedChildren }
        : {}),
      ...(resolvedUrl !== node.url ? { url: resolvedUrl } : {}),
    };
  };

  return visit(value) as T;
}
