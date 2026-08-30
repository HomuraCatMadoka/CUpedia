export const CAMPUS_MAP_RETURN_PATH_HEADER = "x-campus-map-return-path";

export function getCampusMapReturnPath(requestUrl: string) {
  const url = new URL(requestUrl);
  return `${url.pathname}${url.search}`;
}
