type Node = { pageId?: string; children?: Node[] };
type ResolvableNode = {
  pageId?: unknown;
  url?: unknown;
  children?: unknown;
  [key: string]: unknown;
};

const WIKI_PAGE_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isWikiPageId(value: unknown): value is string {
  return typeof value === "string" && WIKI_PAGE_ID_PATTERN.test(value);
}

function walk(nodes: Node[], targets: Set<string>): void {
  for (const node of nodes) {
    if (isWikiPageId(node.pageId)) {
      targets.add(node.pageId);
    }
    if (node.children) walk(node.children, targets);
  }
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
