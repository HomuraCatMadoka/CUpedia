export const CAMPUS_MAP_RETURN_PATH_HEADER = "x-campus-map-return-path";

export function getCampusMapReturnPath(requestUrl: string) {
  const url = new URL(requestUrl);
  return `${url.pathname}${url.search}`;
}

export function isPublicCampusMapPlaceDetailPath(returnPath: string | null) {
  if (!returnPath) return false;
  try {
    const pathname = new URL(returnPath, "https://campus-map.local").pathname;
    return /^\/campus-map\/places\/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\/?$/i.test(
      pathname,
    );
  } catch {
    return false;
  }
}
