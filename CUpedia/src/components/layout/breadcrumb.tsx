import Link from "next/link";
import { buildBreadcrumb } from "@/lib/breadcrumb";

export function Breadcrumb({
  pages,
  currentSlug,
}: {
  pages: { id: string; slug: string; title: string; parentId: string | null }[];
  currentSlug: string;
}) {
  const crumbs = buildBreadcrumb(pages, currentSlug);
  if (crumbs.length === 0) return null;

  return (
    <nav
      className="flex items-center gap-1 text-xs text-muted-foreground"
      aria-label="面包屑导航"
    >
      {crumbs.map((crumb, i) => (
        <span key={crumb.slug} className="flex items-center gap-1">
          <Link
            href={`/wiki/${crumb.slug}`}
            className="hover:text-foreground hover:underline"
          >
            {crumb.title}
          </Link>
          {i < crumbs.length - 1 && <span className="text-border">/</span>}
        </span>
      ))}
    </nav>
  );
}
