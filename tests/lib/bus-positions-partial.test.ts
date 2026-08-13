import { describe, expect, it } from "vitest";

import { computeBusPositions } from "@/lib/campus-transport/bus-positions";
import { formatHongKongTime } from "@/lib/campus-transport/campus-bus";
import { campusBusRoutes } from "@/lib/campus-transport/routes-data";

describe("computeBusPositions partial-service patterns", () => {
  const route2 = campusBusRoutes.find((candidate) => candidate.routeId === "2")!;
  const shawHallStopId = "cuhk-wp-stop-2544#1"; // 邵逸夫堂（partialService）
  const fungKingHeyStopId = "cuhk-wp-stop-2814#1"; // 馮景禧樓

  it("does not mark a skipped partial-service stop as docking", () => {
    // 2:default 班次（:15/:30 发车）不停邵逸夫堂；11:15 发车，p50 冯景禧楼=364s
    // 11:21:20 正处冯景禧楼 dwell 窗口（到站 11:21:04，停留 30s）
    const now = new Date("2026-08-13T11:21:20+08:00").getTime();
    const positions = computeBusPositions(route2, now, 30_000);
    const defaultBus = positions.find(
      (bus) => formatHongKongTime(bus.departureAt) === "11:15",
    );
    expect(defaultBus).toBeDefined();
    // 应停靠在冯景禧楼，而不是被跳过的邵逸夫堂
    expect(defaultBus!.atStop).toBe(true);
    expect(defaultBus!.stopId).toBe(fungKingHeyStopId);
    expect(defaultBus!.stopId).not.toBe(shawHallStopId);
  });

  it("still marks the shaw-hall pattern as docking there", () => {
    // 2:via-shaw-hall 班次（:00/:45 发车）停邵逸夫堂；11:00 发车，p50 邵逸夫堂=284s
    // 11:04:50 正处邵逸夫堂 dwell 窗口（到站 11:04:44，停留 30s）
    const now = new Date("2026-08-13T11:04:50+08:00").getTime();
    const positions = computeBusPositions(route2, now, 30_000);
    const shawBus = positions.find(
      (bus) => formatHongKongTime(bus.departureAt) === "11:00",
    );
    expect(shawBus).toBeDefined();
    expect(shawBus!.atStop).toBe(true);
    expect(shawBus!.stopId).toBe(shawHallStopId);
  });
});
