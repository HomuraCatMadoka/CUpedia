import { stripTitleHeading } from "./headings";
import { parseContent } from "./plate-utils";
import {
  isWikiPageId,
  resolveWikiLinkUrls,
  restoreLegacyChildPageLinks,
  stripLegacyChildPageLinks,
} from "./wiki-links";

export function normalizeWikiEditorHiddenChildPageIds(value: unknown) {
  if (
    !Array.isArray(value) ||
    value.some((candidate) => !isWikiPageId(candidate))
  ) {
    throw new Error("Invalid editor projection");
  }
  return [...new Set(value)].sort();
}

export function toWikiEditorValue(
  page: { content: string; title: string },
  childPageIds: string[],
) {
  const hiddenChildPageIds =
    normalizeWikiEditorHiddenChildPageIds(childPageIds);
  return stripTitleHeading(
    resolveWikiLinkUrls(
      stripLegacyChildPageLinks(
        parseContent(page.content),
        new Set(hiddenChildPageIds),
      ),
    ),
    page.title,
  );
}

export function restoreWikiEditorContentProjection(
  storedContent: string,
  editorContent: string,
  childPageIds: string[],
) {
  const hiddenChildPageIds =
    normalizeWikiEditorHiddenChildPageIds(childPageIds);
  return JSON.stringify(
    restoreLegacyChildPageLinks(
      parseContent(storedContent),
      parseContent(editorContent),
      new Set(hiddenChildPageIds),
    ),
  );
}
