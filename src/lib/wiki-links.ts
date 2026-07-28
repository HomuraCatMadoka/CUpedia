type Node = { pageId?: string; children?: Node[] };
type ResolvableNode = {
  pageId?: unknown;
  url?: unknown;
  children?: unknown;
  [key: string]: unknown;
};

function walk(nodes: Node[], targets: Set<string>): void {
  for (const node of nodes) {
    if (typeof node.pageId === "string" && node.pageId) {
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

/**
 * Resolve internal wiki-link URLs from their stable page IDs.
 *
 * Stored Plate nodes retain the URL that existed when the mention was
 * inserted. Rendering from pageId keeps old documents on the canonical URL.
 */
export function resolveWikiLinkUrls<T>(value: T, pages: { id: string }[]): T {
  const pageIds = new Set(pages.map((page) => page.id));

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
    const pageId =
      typeof node.pageId === "string" && pageIds.has(node.pageId)
        ? node.pageId
        : undefined;
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
