import { describe, expect, it } from "vitest";

import type { CampusBusPassengerRoute } from "@/lib/campus-transport/campus-bus";
import { computeBusPositions } from "@/lib/campus-transport/bus-positions";
import { campusBusRoutes } from "@/lib/campus-transport/routes-data";

// ref #601 — per-trip vehicle positions along the route geometry.

function mockRoute(overrides: Partial<CampusBusPassengerRoute>): CampusBusPassengerRoute {
  const base: CampusBusPassengerRoute = {
    academicTerms: [],
    code: "T",
    defaultStopId: "s1",
    frequencyLabel: "測試",
    map: {
      attribution: "test",
      geometry: {
        type: "Feature",
        properties: {},
        geometry: {
          type: "LineString",
          coordinates: [
            [0, 0],
            [0, 0.001],
            [0, 0.002],
          ],
        },
      },
      sourceUrl: "",
      stopCoordinates: {
        s1: [0, 0],
        s2: [0, 0.001],
        s3: [0, 0.002],
      },
    },
    patterns: [
      {
        departureMinutes: [0, 5],
        id: "p",
        projections: [
          { p50Seconds: 0, stopOccurrenceId: "s1" },
          { p50Seconds: 60, stopOccurrenceId: "s2" },
          { p50Seconds: 120, stopOccurrenceId: "s3" },
        ],
        serviceDayType: "scheduled_service_day",
      },
    ],
    publicHolidayDates: [],
    readingWeeks: [],
    routeId: "t",
    routeNameZhHant: "測試線",
    serviceBands: [
      {
        endMinutes: 59,
        serviceDayRule: "daily",
        serviceRuleRaw: "test",
        startMinutes: 0,
      },
    ],
    serviceHoursLabel: "00:00-00:59",
    slug: "t",
    stops: [
      { id: "s1", nameEn: "A", nameZhHant: "甲", partialService: false, sequence: 1, stopId: "s1" },
      { id: "s2", nameEn: "B", nameZhHant: "乙", partialService: false, sequence: 2, stopId: "s2" },
      { id: "s3", nameEn: "C", nameZhHant: "丙", partialService: false, sequence: 3, stopId: "s3" },
    ],
    subtitle: "測試",
    ...overrides,
  };
  return base;
}

describe("computeBusPositions", () => {
  it("returns one moving bus shortly after departure", () => {
    const route = mockRoute({});
    // 00:00 班次发车后 30s：仍在 s1→s2 行驶中（站间行程 60s）；00:05 班未发车
    const now = new Date("2026-08-13T00:00:30+08:00").getTime();
    const positions = computeBusPositions(route, now, 30_000);
    expect(positions).toHaveLength(1);
    expect(positions[0]!.atStop).toBe(false);
    expect(positions[0]!.position[1]).toBeGreaterThan(0);
    expect(positions[0]!.position[1]).toBeLessThan(0.001);
  });

  it("marks a bus as atStop during the dwell at a stop", () => {
    const route = mockRoute({});
    // 00:00 班次：s2 到站 00:01:00，停留至 00:01:30
    const now = new Date("2026-08-13T00:01:20+08:00").getTime();
    const positions = computeBusPositions(route, now, 30_000);
    expect(positions).toHaveLength(1);
    expect(positions[0]!.atStop).toBe(true);
    expect(positions[0]!.stopId).toBe("s2");
    expect(positions[0]!.position[1]).toBeCloseTo(0.001, 6);
  });

  it("hides a trip after it reaches the terminus", () => {
    const route = mockRoute({});
    // 00:00 班次 00:02:00 到末站收班；00:05 班次尚未发车
    const now = new Date("2026-08-13T00:03:00+08:00").getTime();
    expect(computeBusPositions(route, now, 30_000)).toHaveLength(0);
  });

  it("shows two buses when two trips overlap", () => {
    const route = mockRoute({
      patterns: [
        {
          departureMinutes: [0, 1],
          id: "p",
          projections: [
            { p50Seconds: 0, stopOccurrenceId: "s1" },
            { p50Seconds: 60, stopOccurrenceId: "s2" },
            { p50Seconds: 120, stopOccurrenceId: "s3" },
          ],
          serviceDayType: "scheduled_service_day",
        },
      ],
    });
    // 00:00 班在 s2 停留（00:01:00-00:01:30），00:01 班在 s1→s2 途中
    const now = new Date("2026-08-13T00:01:10+08:00").getTime();
    const positions = computeBusPositions(route, now, 30_000);
    expect(positions).toHaveLength(2);
  });

  it("returns no positions outside service hours", () => {
    const route = mockRoute({});
    const now = new Date("2026-08-13T05:00:00+08:00").getTime();
    expect(computeBusPositions(route, now, 30_000)).toHaveLength(0);
  });

  it("works with the real 1A route inside its service window", () => {
    const route = campusBusRoutes.find((candidate) => candidate.routeId === "1a")!;
    // 2026-08-13 是周四（服务日）；08:50 发车后 1 分钟，班次在 s1→s2 途中
    // （1A 发车分钟 [10,20,40,50]、行程 ~9.7 分钟；09:00 整点恰好无车，故用 08:51）
    const now = new Date("2026-08-13T08:51:00+08:00").getTime();
    const positions = computeBusPositions(route, now, 30_000);
    expect(positions.length).toBeGreaterThanOrEqual(1);
    for (const bus of positions) {
      expect(bus.position[0]).toBeGreaterThan(113);
      expect(bus.position[0]).toBeLessThan(115);
      expect(bus.position[1]).toBeGreaterThan(22);
      expect(bus.position[1]).toBeLessThan(23);
    }
  });

  it("moves the 1A bus from the first stop toward the second after departure", () => {
    const route = campusBusRoutes.find((candidate) => candidate.routeId === "1a")!;
    // 10:10 发车（1A 发车分钟 [10,20,40,50]），p50 第一站 0s、第二站 111s
    const samples = [11, 13].map((minute) =>
      computeBusPositions(
        route,
        new Date(`2026-08-13T10:${minute}:00+08:00`).getTime(),
        30_000,
      ),
    );
    const firstBus = samples[0]![0]!;
    const lastBus = samples[1]![0]!;
    // 车沿站序前进：1 分钟后沿里程 ~331m，3 分钟后已越过第二站（610m）
    expect(firstBus.along).toBeGreaterThan(100);
    expect(firstBus.along).toBeLessThan(500);
    expect(lastBus.along).toBeGreaterThan(610);
    expect(lastBus.along).toBeLessThan(1_200);
    // 方向：位置离首站越来越远
    const first = route.map.stopCoordinates[route.stops[0]!.id]!;
    const d1 = Math.hypot(
      firstBus.position[0] - first[0],
      firstBus.position[1] - first[1],
    );
    const d2 = Math.hypot(
      lastBus.position[0] - first[0],
      lastBus.position[1] - first[1],
    );
    expect(d2).toBeGreaterThan(d1);
  });

  it("shows all concurrent trips of the real route 2 fleet", () => {
    // ref #601 — "所有应该有的车都显示"：route 2 发车间隔 15 分钟、行程
    // 超过 15 分钟，08:15 时 08:00 班（接近终点）与 08:15 班（刚发车）并存。
    const route = campusBusRoutes.find((candidate) => candidate.routeId === "2")!;
    const now = new Date("2026-08-13T08:15:00+08:00").getTime();
    const positions = computeBusPositions(route, now, 30_000);
    expect(positions.length).toBeGreaterThanOrEqual(2);
    const departureTimes = positions
      .map((bus) => new Date(bus.departureAt).toTimeString().slice(0, 5))
      .sort();
    expect(departureTimes).toContain("08:00");
    expect(departureTimes).toContain("08:15");
    // 两车应在不同里程：早班更接近终点
    const alongs = positions.map((bus) => bus.along).sort((a, b) => a - b);
    expect(alongs[0]!).toBeLessThan(200); // 08:15 班刚起步
    expect(alongs[1]!).toBeGreaterThan(3_000); // 08:00 班接近终点
  });
});
