const CANONICAL_WIKI_PAGE_ROUTE =
  /^\/wiki\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isFocusedWikiEditorRoute(pathname: string) {
  return (
    CANONICAL_WIKI_PAGE_ROUTE.test(pathname) ||
    pathname === "/wiki/new" ||
    pathname.startsWith("/wiki/edit/")
  );
}
