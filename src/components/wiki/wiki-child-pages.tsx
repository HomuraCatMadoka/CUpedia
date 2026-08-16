import Link from "next/link";
import { FileTextIcon } from "lucide-react";

import { getWikiDisplayTitle } from "@/lib/wiki-title";

export interface WikiChildPage {
  id: string;
  title: string;
  icon?: string | null;
}

export function WikiChildPages({ pages }: { pages: WikiChildPage[] }) {
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
              <span
                aria-hidden="true"
                data-testid="wiki-child-page-icon"
                className="inline-flex size-4 items-center justify-center"
              >
                {page.icon ?? <FileTextIcon className="size-4" />}
              </span>
              {getWikiDisplayTitle(page.title)}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
