import { describe, expect, it } from "vitest";

import {
  getCampusBusRouteCatalog,
  getCampusBusRouteDisplayName,
} from "@/lib/campus-transport/campus-bus-catalog";
import {
  hongKongWallTimeToEpoch,
  toCampusBusPassengerRoute,
} from "@/lib/campus-transport/campus-bus";
import {
  campusBusRoutes,
  getCampusBusRoute,
} from "@/lib/campus-transport/routes-data";

function hkt(hour: number, minute: number) {
  return hongKongWallTimeToEpoch({
    day: 10,
    hour,
    minute,
    month: 8,
    year: 2026,
  });
}

describe("campus bus route catalog", () => {
  it("groups running routes before routes with truthful inactive states", () => {
    const catalog = getCampusBusRouteCatalog(
      campusBusRoutes.map(toCampusBusPassengerRoute),
      hkt(8, 0),
    );

    expect(catalog.available.length).toBeGreaterThan(0);
    expect(
      catalog.available.every((item) => item.status === "in_service"),
    ).toBe(true);
    expect(catalog.other.every((item) => item.status !== "in_service")).toBe(
      true,
    );
    expect(catalog.other.map((item) => item.status)).toEqual(
      [...catalog.other.map((item) => item.status)].sort(
        (left, right) =>
          ["before_service", "after_service", "not_service_day"].indexOf(left) -
          ["before_service", "after_service", "not_service_day"].indexOf(right),
      ),
    );
  });

  it("labels a future origin time as a scheduled departure", () => {
    const route = toCampusBusPassengerRoute(getCampusBusRoute("1a")!);
    const catalog = getCampusBusRouteCatalog([route], hkt(7, 30));
    const item = catalog.other[0];

    expect(item).toMatchObject({
      departureLabel: "起點開出",
      departureTime: "07:40",
      status: "before_service",
      statusLabel: "今日 07:40 開始",
    });
  });

  it("does not invent a departure after today's service has ended", () => {
    const route = toCampusBusPassengerRoute(getCampusBusRoute("1a")!);
    const catalog = getCampusBusRouteCatalog([route], hkt(20, 0));
    const item = catalog.other[0];

    expect(item).toMatchObject({
      departureLabel: null,
      departureTime: null,
      status: "after_service",
      statusLabel: "今日服務已結束",
    });
  });

  it("uses the sourced route name without repeating its code badge", () => {
    const route = toCampusBusPassengerRoute(getCampusBusRoute("3")!);

    expect(route.routeNameZhHant).toBe("3 逸夫線");
    expect(getCampusBusRouteDisplayName(route)).toBe("逸夫線");
  });
});
