// The Nginx preview map must emit only labels from this list.
const performanceRouteLabels = new Set([
  "/courses",
  "/courses/[code]",
  "/wiki",
  "/wiki/[...id]",
  "static",
  "other",
]);

export function isPerformanceRouteLabel(route) {
  return performanceRouteLabels.has(route);
}
