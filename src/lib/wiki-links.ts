type Node = { pageId?: string; children?: Node[] };

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
