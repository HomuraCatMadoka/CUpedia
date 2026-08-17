"use client";

import {
  WikiChildPages,
  type WikiChildPage,
} from "@/components/wiki/wiki-child-pages";
import { useOptionalWikiTree } from "@/components/wiki/wiki-tree-provider";

export function WikiEditorChildPages({
  pageId,
  fallbackPages,
}: {
  pageId?: string;
  fallbackPages: WikiChildPage[];
}) {
  const wikiTree = useOptionalWikiTree();
  const publicChildIds = new Set(fallbackPages.map((page) => page.id));
  const pages =
    pageId && wikiTree
      ? wikiTree.pages
          .filter(
            (page) => page.parentId === pageId && publicChildIds.has(page.id),
          )
          .map(({ id, title, icon }) => ({ id, title, icon }))
      : fallbackPages;

  return <WikiChildPages pages={pages} />;
}
