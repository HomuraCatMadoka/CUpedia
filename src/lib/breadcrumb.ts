type TreePage = {
  id: string;
  title: string;
  parentId: string | null;
};
type BreadcrumbItem = { id: string; title: string };

export function buildBreadcrumb(
  pages: TreePage[],
  currentPageId: string,
): BreadcrumbItem[] {
  const byId = new Map(pages.map((p) => [p.id, p]));
  const current = byId.get(currentPageId);
  if (!current) return [];

  const crumbs: BreadcrumbItem[] = [];
  let node = current.parentId ? byId.get(current.parentId) : undefined;
  while (node) {
    crumbs.unshift({ id: node.id, title: node.title });
    node = node.parentId ? byId.get(node.parentId) : undefined;
  }
  return crumbs;
}
