import Fuse from "fuse.js";

export interface SearchablePage {
  id: string;
  slug: string;
  title: string;
  content: string;
}

export interface SearchResult {
  id: string;
  slug: string;
  title: string;
  snippet?: string;
}

const MAX_RESULTS = 20;
const MIN_QUERY_LENGTH = 2;
const SNIPPET_RADIUS = 30;

export function searchPages(
  pages: SearchablePage[],
  query: string,
): SearchResult[] {
  const trimmed = query.trim();
  if (trimmed.length < MIN_QUERY_LENGTH) return [];

  const lowerQuery = trimmed.toLowerCase();

  const exactMatches: {
    page: SearchablePage;
    titleMatch: boolean;
    pos: number;
  }[] = [];

  for (const page of pages) {
    const titleIdx = page.title.toLowerCase().indexOf(lowerQuery);
    const contentIdx = page.content.toLowerCase().indexOf(lowerQuery);

    if (titleIdx >= 0 || contentIdx >= 0) {
      exactMatches.push({
        page,
        titleMatch: titleIdx >= 0,
        pos: contentIdx >= 0 ? contentIdx : Infinity,
      });
    }
  }

  if (exactMatches.length > 0) {
    exactMatches.sort((a, b) => {
      if (a.titleMatch !== b.titleMatch) return a.titleMatch ? -1 : 1;
      return a.pos - b.pos;
    });

    return exactMatches
      .slice(0, MAX_RESULTS)
      .map(({ page, titleMatch, pos }) => {
        const contentHasMatch =
          page.content.toLowerCase().indexOf(lowerQuery) >= 0;
        const titleOnly = titleMatch && !contentHasMatch;

        return {
          id: page.id,
          slug: page.slug,
          title: page.title,
          snippet: titleOnly
            ? undefined
            : generateSnippet(page.content, trimmed, pos),
        };
      });
  }

  // Fuzzy fallback
  const fuse = new Fuse(pages, {
    keys: [
      { name: "title", weight: 2 },
      { name: "content", weight: 1 },
    ],
    threshold: 0.4,
    includeScore: true,
  });

  return fuse.search(trimmed, { limit: MAX_RESULTS }).map((r) => ({
    id: r.item.id,
    slug: r.item.slug,
    title: r.item.title,
    snippet: generateFuzzySnippet(r.item.content, trimmed),
  }));
}

function generateSnippet(
  content: string,
  keyword: string,
  pos: number,
): string {
  const actualPos =
    pos >= 0 && pos !== Infinity
      ? pos
      : content.toLowerCase().indexOf(keyword.toLowerCase());

  if (actualPos < 0) return "";

  const start = Math.max(0, actualPos - SNIPPET_RADIUS);
  const end = Math.min(
    content.length,
    actualPos + keyword.length + SNIPPET_RADIUS,
  );

  let snippet = content.slice(start, end);

  const keywordInSnippet = snippet.toLowerCase().indexOf(keyword.toLowerCase());
  if (keywordInSnippet >= 0) {
    const original = snippet.slice(
      keywordInSnippet,
      keywordInSnippet + keyword.length,
    );
    snippet =
      snippet.slice(0, keywordInSnippet) +
      `<mark>${original}</mark>` +
      snippet.slice(keywordInSnippet + keyword.length);
  }

  if (start > 0) snippet = "…" + snippet;
  if (end < content.length) snippet = snippet + "…";

  return snippet;
}

function generateFuzzySnippet(
  content: string,
  keyword: string,
): string | undefined {
  const idx = content.toLowerCase().indexOf(keyword.toLowerCase());
  if (idx >= 0) return generateSnippet(content, keyword, idx);
  return undefined;
}
