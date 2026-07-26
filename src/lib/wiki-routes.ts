export function isFocusedWikiEditorRoute(pathname: string) {
  return pathname === "/wiki/new" || pathname.startsWith("/wiki/edit/");
}
