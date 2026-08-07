import type { NextRequest } from "next/server";

import { getWikiPage, searchWikiPages } from "@/lib/wiki-actions";
import { fail, ok } from "@/lib/cli-api/respond";
import { ERROR_CODES } from "@/lib/cli-api/errors";

/**
 * GET /api/wiki/[slug]
 *
 * `slug` is a URL-encoded wiki page title (Next.js decodes route params, so
 * the handler receives the decoded title). Resolution: search the page corpus
 * for the title, take the best match's id, then fetch the full page:
 *
 *   { title, content }
 *
 * 404 NOT_FOUND when no page matches the title (or the matched page is gone).
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;

  const results = await searchWikiPages(slug);
  if (results.length === 0) {
    return fail(ERROR_CODES.NOT_FOUND, 404);
  }

  const page = await getWikiPage(results[0].id);
  if (!page) {
    return fail(ERROR_CODES.NOT_FOUND, 404);
  }

  return ok({ title: page.title, content: page.content });
}
