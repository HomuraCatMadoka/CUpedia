import { describe, expect, it } from "vitest";

import {
  getCampusBusServiceHoursLabel,
  getCampusBusStopBoard,
  hongKongWallTimeToEpoch,
  toCampusBusPassengerRoute,
} from "@/lib/campus-transport/campus-bus";
import { BUS_DWELL_MILLISECONDS } from "@/lib/campus-transport/bus-kinematics";
import {
  campusBusRoutes,
  getCampusBusRoute,
} from "@/lib/campus-transport/routes-data";

function hkt(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
) {
  return hongKongWallTimeToEpoch({ day, hour, minute, month, year });
}

describe("campus bus route catalog", () => {
  it("publishes the reviewed route batches", () => {
    expect(campusBusRoutes.map((route) => route.routeId)).toEqual([
      "1a",
      "1b",
      "2",
      "3",
      "4",
      "5",
      "6a",
      "6b",
      "7",
      "8",
      "n",
      "h",
    ]);
    expect(
      campusBusRoutes.map((route) => [
        route.routeId,
        route.stops.length,
        Object.keys(route.map.stopCoordinates).length,
      ]),
    ).toEqual([
      ["1a", 6, 6],
      ["1b", 8, 8],
      ["2", 10, 10],
      ["3", 15, 15],
      ["4", 15, 15],
      ["5", 9, 9],
      ["6a", 10, 10],
      ["6b", 6, 6],
      ["7", 8, 8],
      ["8", 18, 18],
      ["n", 21, 21],
      ["h", 22, 22],
    ]);
  });

  it("keeps repeated physical stops as distinct route occurrences", () => {
    const route1b = getCampusBusRoute("1B")!;
    const universityStation = route1b.stops.filter(
      (stop) => stop.stopId === "cuhk-wp-stop-2552",
    );
    const postgraduateHall = route1b.stops.filter(
      (stop) => stop.stopId === "cuhk-wp-stop-3172",
    );

    expect(universityStation.map((stop) => stop.id)).toEqual([
      "cuhk-wp-stop-2552#1",
      "cuhk-wp-stop-2552#2",
    ]);
    expect(postgraduateHall.map((stop) => stop.id)).toEqual([
      "cuhk-wp-stop-3172#1",
      "cuhk-wp-stop-3172#2",
    ]);
  });

  it("retains cold-start provenance, confidence, and uncertainty at runtime", () => {
    const route = getCampusBusRoute("2")!;
    const projection = route.patterns[0].projections[1];

    expect(route.seedModelRevisionId).toMatch(/^cold-start:2:/);
    expect(route.datasetProvenance).toMatchObject({
      parserVersion: expect.any(String),
      snapshotGeneratedAt: expect.any(String),
      snapshotSha256: expect.any(String),
    });
    expect(route.patterns[0]).toMatchObject({
      confidence: expect.any(String),
      revisionId: expect.stringMatching(/^2:/),
      sourceRefs: expect.arrayContaining([
        expect.stringMatching(/^cuhk-route-2:/),
      ]),
    });
    expect(projection).toMatchObject({
      offsetConfidence: "weak_prior",
      publicationStatus: "staging_only",
      p10Seconds: null,
      p90Seconds: null,
      sampleCount: 0,
      sourceKind: "community-prior",
    });
    expect(projection.sourceRefs).toEqual(
      expect.arrayContaining([expect.stringMatching(/^cu-bus-app-v1\.18:/)]),
    );
    expect(projection.evidence.segmentSamplesTotal).toBeGreaterThan(0);
  });

  it("keeps provenance server-side when creating the passenger view", () => {
    const route = getCampusBusRoute("2")!;
    const passengerRoute = toCampusBusPassengerRoute(route);

    expect(passengerRoute).not.toHaveProperty("datasetProvenance");
    expect(passengerRoute.riderEligibility).toBe("students-and-staff");
    expect(passengerRoute.patterns[0]).not.toHaveProperty("sourceRefs");
    expect(passengerRoute.patterns[0].projections[0]).toEqual(
      expect.objectContaining({
        p50Seconds: expect.any(Number),
        stopOccurrenceId: expect.any(String),
      }),
    );
    expect(passengerRoute.patterns[0].projections[0]).not.toHaveProperty(
      "evidence",
    );
  });

  it.each([
    {
      arrivalTime: "07:41",
      routeId: "1a",
      stopId: "cuhk-wp-stop-2546#1",
      waitMinutes: 2,
    },
    {
      arrivalTime: "08:02",
      routeId: "1b",
      stopId: "cuhk-wp-stop-3172#1",
      waitMinutes: 3,
    },
    {
      arrivalTime: "09:01",
      routeId: "3",
      stopId: "cuhk-wp-stop-2546#1",
      waitMinutes: 2,
    },
    {
      arrivalTime: "07:31",
      routeId: "4",
      stopId: "cuhk-wp-stop-2932#1",
      waitMinutes: 2,
    },
  ])(
    "adds the $routeId route-pattern baseline to its official first departure",
    ({ arrivalTime, routeId, stopId, waitMinutes }) => {
      const route = getCampusBusRoute(routeId)!;
      const startMinutes = route.serviceBands[0].startMinutes;
      const board = getCampusBusStopBoard(
        route,
        stopId,
        hkt(2026, 8, 11, Math.floor(startMinutes / 60), startMinutes % 60),
      );

      expect(board.upcomingArrivals[0]).toMatchObject({
        arrivalTime,
        waitMinutes,
      });
    },
  );

  it("keeps the Route 1A stop board compact before the first service", () => {
    const route1a = getCampusBusRoute("1a")!;
    const board = getCampusBusStopBoard(
      route1a,
      route1a.defaultStopId,
      hkt(2026, 8, 11, 1, 28),
    );

    expect(board).toMatchObject({
      firstArrivalTime: "07:40",
      serviceStatus: "before_service",
      upcomingArrivals: [],
      dockingArrival: null,
    });
  });

  it("marks a bus as docking during its stop dwell and clears it afterwards", () => {
    const route1a = getCampusBusRoute("1a")!;
    const stopId = "cuhk-wp-stop-2546#1";
    const probe = getCampusBusStopBoard(
      route1a,
      stopId,
      hkt(2026, 8, 11, 8, 10),
    );
    const arrival = probe.upcomingArrivals[0]!;

    const duringDwell = getCampusBusStopBoard(
      route1a,
      stopId,
      arrival.arrivalAt + 15_000,
    );
    expect(duringDwell.dockingArrival).toMatchObject({
      arrivalTime: arrival.arrivalTime,
      patternId: arrival.patternId,
    });
    expect(duringDwell.dockingArrival?.arrivalAt).toBe(arrival.arrivalAt);

    const afterDwell = getCampusBusStopBoard(
      route1a,
      stopId,
      arrival.arrivalAt + BUS_DWELL_MILLISECONDS + 1_000,
    );
    expect(afterDwell.dockingArrival).toBeNull();
  });

  it("never treats the origin departure as a docking stop", () => {
    const route1a = getCampusBusRoute("1a")!;
    const originStopId = "cuhk-wp-stop-2552#1";
    const probe = getCampusBusStopBoard(
      route1a,
      originStopId,
      hkt(2026, 8, 11, 8, 10),
    );
    const originArrival = probe.upcomingArrivals[0]!;

    const afterDeparture = getCampusBusStopBoard(
      route1a,
      originStopId,
      originArrival.arrivalAt + 15_000,
    );
    expect(afterDeparture.dockingArrival).toBeNull();
    expect(afterDeparture.upcomingArrivals[0]).not.toMatchObject({
      arrivalAt: originArrival.arrivalAt,
    });
  });

  it("runs Route 5 on a teaching day and excludes the official reading week", () => {
    const route5 = getCampusBusRoute("5")!;
    const sportsCentre = "cuhk-wp-stop-2546#1";

    expect(
      getCampusBusStopBoard(route5, sportsCentre, hkt(2026, 2, 2, 9, 18))
        .upcomingArrivals[0],
    ).toMatchObject({ arrivalTime: "09:19", waitMinutes: 2 });
    expect(getCampusBusServiceHoursLabel(route5, hkt(2026, 2, 2, 9, 18))).toBe(
      "09:18-17:26",
    );
    expect(getCampusBusServiceHoursLabel(route5, hkt(2026, 2, 7, 9, 18))).toBe(
      "09:18-13:26",
    );
    expect(
      getCampusBusStopBoard(route5, sportsCentre, hkt(2026, 3, 2, 9, 18)),
    ).toMatchObject({
      serviceStatus: "not_service_day",
      upcomingArrivals: [],
    });
    expect(
      getCampusBusServiceHoursLabel(route5, hkt(2026, 3, 2, 9, 18)),
    ).toBeNull();
  });

  it("keeps the N and H conditional departures as separate reviewed patterns", () => {
    const routeN = getCampusBusRoute("N")!;
    const routeH = getCampusBusRoute("H")!;
    const pgh1Uphill = "cuhk-wp-stop-3172#1";
    const area39Uphill = "cuhk-wp-stop-2939#1";

    expect(
      routeN.patterns.find((pattern) => pattern.id === "n:default")
        ?.projections,
    ).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ stopOccurrenceId: pgh1Uphill }),
      ]),
    );
    expect(
      routeN.patterns.find((pattern) => pattern.id === "n:00-via-pgh1")
        ?.projections,
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ stopOccurrenceId: pgh1Uphill }),
      ]),
    );
    expect(
      routeH.patterns.find((pattern) => pattern.id === "h:default")
        ?.projections,
    ).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ stopOccurrenceId: area39Uphill }),
      ]),
    );
    expect(
      routeH.patterns.find((pattern) => pattern.id === "h:00-via-pgh1-area39")
        ?.projections,
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ stopOccurrenceId: area39Uphill }),
      ]),
    );
  });

  it("switches Route 8 between teaching-day and non-teaching-day termini", () => {
    const route8 = getCampusBusRoute("8")!;
    const universityStation = "cuhk-wp-stop-2552#1";
    const stationPiazza = "cuhk-wp-stop-2812#1";
    const chungChiTeachingBuilding = "cuhk-wp-stop-2810#1";

    expect(
      getCampusBusStopBoard(route8, universityStation, hkt(2026, 2, 2, 7, 40))
        .upcomingArrivals[0],
    ).toMatchObject({ patternId: "8:teaching-day" });
    expect(
      getCampusBusStopBoard(route8, stationPiazza, hkt(2026, 2, 2, 7, 40))
        .upcomingArrivals,
    ).toEqual([]);

    expect(
      getCampusBusStopBoard(
        route8,
        chungChiTeachingBuilding,
        hkt(2026, 8, 12, 7, 40),
      ).upcomingArrivals[0],
    ).toMatchObject({ patternId: "8:non-teaching-day" });
    expect(
      getCampusBusStopBoard(route8, universityStation, hkt(2026, 8, 12, 7, 40))
        .upcomingArrivals,
    ).toEqual([]);
  });

  it("runs N on a non-holiday weekday and H only on Sunday or public holidays", () => {
    const routeN = getCampusBusRoute("n")!;
    const routeH = getCampusBusRoute("h")!;

    expect(getCampusBusServiceHoursLabel(routeN, hkt(2026, 8, 12, 19, 0))).toBe(
      "19:00-23:30",
    );
    expect(
      getCampusBusServiceHoursLabel(routeH, hkt(2026, 8, 12, 19, 0)),
    ).toBeNull();
    expect(getCampusBusServiceHoursLabel(routeH, hkt(2026, 8, 16, 8, 20))).toBe(
      "08:20-23:20",
    );
  });
});
