import Link from "next/link";

import { getWikiDisplayTitle } from "@/lib/wiki-title";

interface ChildPage {
  id: string;
  title: string;
  icon?: string | null;
}

export function WikiChildPages({ pages }: { pages: ChildPage[] }) {
  if (pages.length === 0) return null;

  return (
    <section aria-label="子页面" className="mt-6">
      <ul className="space-y-2">
        {pages.map((page) => (
          <li key={page.id}>
            <Link
              href={`/wiki/${page.id}`}
              className="inline-flex items-center gap-2 underline underline-offset-4"
            >
              {page.icon && <span aria-hidden="true">{page.icon}</span>}
              {getWikiDisplayTitle(page.title)}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
