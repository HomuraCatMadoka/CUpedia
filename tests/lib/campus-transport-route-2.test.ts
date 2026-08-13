import { describe, expect, it } from "vitest";

import {
  getCampusBusStopBoard,
  hongKongWallTimeToEpoch,
} from "@/lib/campus-transport/campus-bus";
import { route2ViewData } from "@/lib/campus-transport/routes-data";

function hkt(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
) {
  return hongKongWallTimeToEpoch({ day, hour, minute, month, year });
}

describe("Route 2 passenger projection", () => {
  it("builds the passenger stop list from the reviewed complete pattern", () => {
    expect(route2ViewData.status).toBe("staging_only");
    expect(route2ViewData.stops).toHaveLength(10);
    expect(route2ViewData.stops.map((stop) => stop.nameZhHant)).toEqual([
      "大學站廣場",
      "大學體育中心",
      "邵逸夫堂",
      "馮景禧樓",
      "聯合書院（上行）",
      "新亞書院",
      "聯合書院（下行）",
      "大學行政樓",
      "善衡書院",
      "大學站",
    ]);
    expect(
      route2ViewData.stops.find((stop) => stop.nameZhHant === "邵逸夫堂"),
    ).toMatchObject({ partialService: true });
  });

  it("adds the cold-start offset to official departures", () => {
    const board = getCampusBusStopBoard(
      route2ViewData,
      "cuhk-wp-stop-2550#1",
      hkt(2026, 8, 11, 8, 10),
    );

    expect(board.serviceStatus).toBe("in_service");
    expect(board.upcomingArrivals).toEqual([
      expect.objectContaining({ arrivalTime: "08:13", waitMinutes: 4 }),
      expect.objectContaining({ arrivalTime: "08:28", waitMinutes: 19 }),
      expect.objectContaining({ arrivalTime: "08:43", waitMinutes: 34 }),
    ]);
  });

  it("shows zero minutes during the final minute before arrival", () => {
    const board = getCampusBusStopBoard(
      route2ViewData,
      "cuhk-wp-stop-2550#1",
      hkt(2026, 8, 11, 8, 13) + 30_000,
    );

    expect(board.upcomingArrivals[0]).toMatchObject({
      arrivalTime: "08:13",
      waitMinutes: 0,
    });
  });

  it("marks origin departures whose pattern does not serve Shaw Hall", () => {
    const board = getCampusBusStopBoard(
      route2ViewData,
      "cuhk-wp-stop-2544#1",
      hkt(2026, 8, 11, 8, 10),
    );

    expect(board.upcomingArrivals[0]).toMatchObject({
      arrivalTime: "08:49",
      departureTime: "08:45",
    });
    expect(board.skippedDepartureTimes).toEqual(["08:15", "08:30"]);
  });

  it("does not roll after the last bus into tomorrow", () => {
    const board = getCampusBusStopBoard(
      route2ViewData,
      "cuhk-wp-stop-2550#1",
      hkt(2026, 8, 11, 19, 30),
    );

    expect(board.serviceStatus).toBe("after_service");
    expect(board.upcomingArrivals).toEqual([]);
  });

  it("returns no Route 2 service on Sundays", () => {
    const board = getCampusBusStopBoard(
      route2ViewData,
      "cuhk-wp-stop-2550#1",
      hkt(2026, 8, 16, 9, 0),
    );

    expect(board.serviceStatus).toBe("not_service_day");
    expect(board.upcomingArrivals).toEqual([]);
  });

  it("uses the public-holiday calendar instead of treating every weekday as a service day", () => {
    const board = getCampusBusStopBoard(
      route2ViewData,
      "cuhk-wp-stop-2550#1",
      hkt(2026, 7, 1, 9, 0),
    );

    expect(board.serviceStatus).toBe("not_service_day");
    expect(board.upcomingArrivals).toEqual([]);
  });
});
