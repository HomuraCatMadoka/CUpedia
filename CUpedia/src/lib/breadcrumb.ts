type TreePage = {
  id: string;
  slug: string;
  title: string;
  parentId: string | null;
};
type BreadcrumbItem = { slug: string; title: string };

export function buildBreadcrumb(
  pages: TreePage[],
  currentSlug: string
): BreadcrumbItem[] {
  const byId = new Map(pages.map((p) => [p.id, p]));
  const current = pages.find((p) => p.slug === currentSlug);
  if (!current) return [];

  const crumbs: BreadcrumbItem[] = [];
  let node = current.parentId ? byId.get(current.parentId) : undefined;
  while (node) {
    crumbs.unshift({ slug: node.slug, title: node.title });
    node = node.parentId ? byId.get(node.parentId) : undefined;
  }
  return crumbs;
}
