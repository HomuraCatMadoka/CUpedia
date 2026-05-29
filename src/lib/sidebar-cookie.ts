export const SIDEBAR_COOKIE = "wiki-sidebar-collapsed";

const COLLAPSED = "collapsed";
const EXPANDED = "expanded";
const MAX_AGE = 60 * 60 * 24 * 365;

export function parseSidebarCollapsed(cookieHeader?: string | null): boolean {
  if (!cookieHeader) return false;
  return cookieHeader
    .split(";")
    .some((c) => c.trim() === `${SIDEBAR_COOKIE}=${COLLAPSED}`);
}

export function serializeSidebarCookie(collapsed: boolean): string {
  const value = collapsed ? COLLAPSED : EXPANDED;
  return `${SIDEBAR_COOKIE}=${value}; path=/; max-age=${MAX_AGE}; samesite=lax`;
}
