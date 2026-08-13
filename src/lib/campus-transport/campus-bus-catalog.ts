import {
  formatHongKongTime,
  getCampusBusServiceHoursLabel,
  getCampusBusStopBoard,
  scheduledDeparturesForDate,
  type CampusBusPassengerRoute,
  type CampusBusStopBoard,
} from "./campus-bus";

type CampusBusCatalogStatus = CampusBusStopBoard["serviceStatus"];

export type CampusBusCatalogItem = {
  departureLabel: "起點開出" | null;
  departureTime: string | null;
  route: CampusBusPassengerRoute;
  status: CampusBusCatalogStatus;
  statusLabel: string;
};

export type CampusBusRouteCatalog = {
  available: CampusBusCatalogItem[];
  other: CampusBusCatalogItem[];
};

const OTHER_STATUS_ORDER: Record<CampusBusCatalogStatus, number> = {
  before_service: 0,
  after_service: 1,
  not_service_day: 2,
  in_service: -1,
};

function getRouteStatus(route: CampusBusPassengerRoute, now: number) {
  const statuses = route.stops.map(
    (stop) => getCampusBusStopBoard(route, stop.id, now).serviceStatus,
  );
  if (statuses.some((status) => status === "in_service")) return "in_service";
  if (statuses.some((status) => status === "before_service")) {
    return "before_service";
  }
  if (statuses.some((status) => status === "after_service")) {
    return "after_service";
  }
  return "not_service_day";
}

function getStatusLabel(
  route: CampusBusPassengerRoute,
  now: number,
  status: CampusBusCatalogStatus,
) {
  switch (status) {
    case "in_service":
      return "服務中";
    case "before_service": {
      const serviceHours = getCampusBusServiceHoursLabel(route, now);
      return serviceHours
        ? `今日 ${serviceHours.split("-")[0]} 開始`
        : "稍後開始";
    }
    case "after_service":
      return "今日服務已結束";
    case "not_service_day":
      return "今日不服務";
  }
}

function toCatalogItem(
  route: CampusBusPassengerRoute,
  now: number,
): CampusBusCatalogItem & { departureAt: number | null } {
  const status = getRouteStatus(route, now);
  const nextDeparture = scheduledDeparturesForDate(now, route).find(
    ({ departureAt }) => departureAt >= now,
  );

  return {
    departureAt: nextDeparture?.departureAt ?? null,
    departureLabel: nextDeparture ? "起點開出" : null,
    departureTime: nextDeparture
      ? formatHongKongTime(nextDeparture.departureAt)
      : null,
    route,
    status,
    statusLabel: getStatusLabel(route, now, status),
  };
}

function byDepartureThenCode(
  left: CampusBusCatalogItem & { departureAt: number | null },
  right: CampusBusCatalogItem & { departureAt: number | null },
) {
  const departureDifference =
    (left.departureAt ?? Number.POSITIVE_INFINITY) -
    (right.departureAt ?? Number.POSITIVE_INFINITY);
  return (
    departureDifference ||
    left.route.code.localeCompare(right.route.code, "en", { numeric: true })
  );
}

export function getCampusBusRouteCatalog(
  routes: CampusBusPassengerRoute[],
  now: number,
): CampusBusRouteCatalog {
  const items = routes.map((route) => toCatalogItem(route, now));
  const available = items
    .filter(
      (item) =>
        item.status === "in_service" &&
        item.route.riderEligibility !== "staff-only",
    )
    .sort(byDepartureThenCode);
  const other = items
    .filter(
      (item) =>
        item.status !== "in_service" ||
        item.route.riderEligibility === "staff-only",
    )
    .sort(
      (left, right) =>
        OTHER_STATUS_ORDER[left.status] - OTHER_STATUS_ORDER[right.status] ||
        byDepartureThenCode(left, right),
    );

  return { available, other };
}

export function getCampusBusRouteDisplayName(route: CampusBusPassengerRoute) {
  const prefix = `${route.code} `;
  return route.routeNameZhHant.startsWith(prefix)
    ? route.routeNameZhHant.slice(prefix.length)
    : route.routeNameZhHant;
}
