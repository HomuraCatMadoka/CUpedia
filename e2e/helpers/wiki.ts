const UUID_SOURCE =
  "[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}";

export const canonicalWikiPageUrl = new RegExp(`/wiki/${UUID_SOURCE}$`, "i");

export const canonicalWikiEditUrl = new RegExp(
  `/wiki/edit/${UUID_SOURCE}$`,
  "i",
);

export function wikiPageUrl(pageId: string) {
  return new RegExp(`/wiki/${pageId}$`);
}

export function wikiEditUrl(pageId: string) {
  return new RegExp(`/wiki/edit/${pageId}$`);
}
