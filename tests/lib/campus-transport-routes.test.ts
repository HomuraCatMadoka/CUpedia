import { describe, expect, it } from "vitest";

import {
  getCampusBusServiceHoursLabel,
  getCampusBusStopBoard,
  hongKongWallTimeToEpoch,
  scheduledDeparturesForDate,
  toCampusBusPassengerRoute,
} from "@/lib/campus-transport/campus-bus";
import { BUS_DWELL_MILLISECONDS } from "@/lib/campus-transport/bus-kinematics";
import { buildStopAnchoredPath } from "@/lib/campus-transport/route-geometry";
import {
  campusBusRoutes,
  getCampusBusRoute,
  getCampusBusRouteForServiceDate,
  getCampusBusRoutesForServiceDate,
  historicalCampusBusRoutes,
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

function geometryLineCount(route: (typeof campusBusRoutes)[number]) {
  const geometry =
    route.map.geometry.type === "Feature" ? route.map.geometry.geometry : null;
  if (!geometry) return 0;
  return geometry.type === "MultiLineString"
    ? geometry.coordinates.length
    : geometry.type === "LineString"
      ? 1
      : 0;
}

describe("campus bus route catalog", () => {
  it("keeps service-date ranges non-overlapping within each route", () => {
    const revisionsByRoute = new Map<
      string,
      typeof historicalCampusBusRoutes
    >();
    for (const route of [...historicalCampusBusRoutes, ...campusBusRoutes]) {
      const revisions = revisionsByRoute.get(route.routeId) ?? [];
      revisions.push(route);
      revisionsByRoute.set(route.routeId, revisions);
    }

    const overlaps: string[] = [];
    for (const [routeId, revisions] of revisionsByRoute) {
      revisions.sort((left, right) =>
        (left.validFrom ?? "").localeCompare(right.validFrom ?? ""),
      );
      for (let index = 1; index < revisions.length; index += 1) {
        const previous = revisions[index - 1];
        const current = revisions[index];
        if (
          previous.validTo === null ||
          current.validFrom === null ||
          previous.validTo >= current.validFrom
        ) {
          overlaps.push(
            `${routeId}: ${previous.routeRevisionId} overlaps ${current.routeRevisionId}`,
          );
        }
      }
    }

    expect(overlaps).toEqual([]);
  });

  it("publishes the reviewed route batches", () => {
    expect(campusBusRoutes.map((route) => route.slug)).toEqual([
      "1",
      "2",
      "2s",
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
        route.stops.every((stop) =>
          Boolean(route.map.stopCoordinates[stop.id]),
        ),
      ]),
    ).toEqual([
      ["1a", 6, true],
      ["2", 10, true],
      ["2s", 12, true],
      ["3", 15, true],
      ["4", 15, true],
      ["5", 9, true],
      ["6a", 10, true],
      ["6b", 6, true],
      ["7", 8, true],
      ["8", 21, true],
      ["n", 21, true],
      ["h", 21, true],
    ]);
  });

  it("replays the old catalog through August 31 and switches on September 1", () => {
    expect(
      getCampusBusRoutesForServiceDate("2026-08-31").map(
        (route) => route.routeId,
      ),
    ).toEqual(["1a", "1b", "2", "3", "4", "5", "6a", "6b", "7", "8", "n", "h"]);
    expect(
      getCampusBusRoutesForServiceDate("2026-09-01").map((route) => route.slug),
    ).toEqual(campusBusRoutes.map((route) => route.slug));
    expect(getCampusBusRouteForServiceDate("1a", "2026-08-31")?.code).toBe(
      "1A",
    );
    expect(getCampusBusRouteForServiceDate("1b", "2026-09-01")).toBeUndefined();
    expect(getCampusBusRoutesForServiceDate("1900-01-01")).toEqual([]);
    expect(getCampusBusRoutesForServiceDate("2026-02-30")).toEqual([]);
    expect(getCampusBusRoutesForServiceDate("not-a-date")).toEqual([]);
  });

  it("keeps Route 1 lineage while separating reused WordPress identities", () => {
    const historical1a = getCampusBusRouteForServiceDate("1a", "2026-08-31")!;
    const route1 = getCampusBusRoute("1")!;
    const route2s = getCampusBusRoute("2s")!;

    expect(getCampusBusRoute("1a")).toBe(route1);
    expect(route1).toMatchObject({
      code: "1",
      lineageId: historical1a.lineageId,
      routeId: historical1a.routeId,
      slug: "1",
      sourceIdentity: {
        displayCode: "1",
        wordpressPostId: 2554,
        wordpressSlug: "1a",
      },
    });
    expect(route2s).toMatchObject({
      lineageId: "route-lineage-2s",
      routeId: "2s",
      sourceIdentity: {
        displayCode: "2S",
        wordpressPostId: 2567,
        wordpressSlug: "1b",
      },
    });
    expect(route2s.lineageId).not.toBe(
      getCampusBusRouteForServiceDate("1b", "2026-08-31")!.lineageId,
    );
    expect(getCampusBusRoute("1b")).toBeUndefined();
  });

  it("keeps every composite map source as its own valid link", () => {
    expect(getCampusBusRoute("2s")!.map.sources).toEqual([
      {
        attribution: "© OpenStreetMap contributors",
        url: "https://www.openstreetmap.org/relation/21069990",
      },
      {
        attribution: "© OpenStreetMap contributors",
        url: "https://www.openstreetmap.org/relation/8022757",
      },
    ]);
    expect(getCampusBusRoute("8")!.map.sources).toEqual([
      {
        attribution: "© OpenStreetMap contributors",
        url: "https://www.openstreetmap.org/relation/8027087",
      },
      {
        attribution: "© OpenStreetMap contributors",
        url: "https://www.openstreetmap.org/relation/8022758",
      },
    ]);
    for (const routeId of ["2s", "8"]) {
      for (const source of getCampusBusRoute(routeId)!.map.sources) {
        expect(new URL(source.url).href).toBe(source.url);
      }
    }
  });

  it("publishes the reviewed September timetables and pattern choices", () => {
    const route1 = getCampusBusRoute("1")!;
    const route2 = getCampusBusRoute("2")!;
    const route2s = getCampusBusRoute("2s")!;
    const route7 = getCampusBusRoute("7")!;
    const route8 = getCampusBusRoute("8")!;

    expect(route1.patterns[0].departureMinutes).toEqual([10, 25, 40, 55]);
    expect(
      route2.patterns.map((pattern) => [pattern.id, pattern.departureMinutes]),
    ).toEqual([
      ["2:default", [15]],
      ["2:via-shaw-hall", [45]],
    ]);
    expect(route2s.patterns[0].departureMinutes).toEqual([0, 30]);
    expect(
      route2s.patterns[0].projections.map(
        (projection) => projection.p50Seconds,
      ),
    ).toEqual([0, 130, 228, 348, 438, 508, 592, 657, 750, 902, 1000, 1140]);
    expect(route7.patterns[0].departureMinutes).toEqual([0, 18]);
    expect(route8.patterns.map((pattern) => pattern.departureMinutes)).toEqual([
      [15, 35, 55],
      [15, 35, 55],
    ]);
    expect(route1.serviceBands.map((band) => band.serviceRuleRaw)).toEqual([
      "07:40-18:55 For Mon to Sat (Except Public Holidays)",
    ]);
    expect(route7.serviceBands.map((band) => band.serviceRuleRaw)).toEqual([
      "08:18 - 17:18 Mon to Fri; Teaching days only",
      "08:18 - 13:18 Sat; Teaching days only",
    ]);
    expect(route8.serviceBands.map((band) => band.serviceRuleRaw)).toEqual([
      "07:35 - 18:35 For Mon to Sat (Except Public Holidays)",
    ]);

    const weekday = hkt(2026, 9, 2, 8, 0);
    expect(
      scheduledDeparturesForDate(weekday, toCampusBusPassengerRoute(route1)),
    ).toHaveLength(46);
    expect(
      scheduledDeparturesForDate(weekday, toCampusBusPassengerRoute(route2)),
    ).toHaveLength(23);
    expect(
      scheduledDeparturesForDate(weekday, toCampusBusPassengerRoute(route2s)),
    ).toHaveLength(22);
    expect(
      scheduledDeparturesForDate(weekday, toCampusBusPassengerRoute(route8)),
    ).toHaveLength(34);
    expect(
      scheduledDeparturesForDate(
        hkt(2026, 9, 7, 8, 0),
        toCampusBusPassengerRoute(route7),
      ),
    ).toHaveLength(19);
  });

  it("uses the official 2S sequence with low-confidence estimated offsets", () => {
    const route2s = getCampusBusRoute("2s")!;
    expect(route2s.stops.map((stop) => stop.stopId)).toEqual([
      "cuhk-wp-stop-2812",
      "cuhk-wp-stop-3172",
      "cuhk-wp-stop-2546",
      "cuhk-wp-stop-2544",
      "cuhk-wp-stop-2814",
      "cuhk-wp-stop-2816",
      "cuhk-wp-stop-2820",
      "cuhk-wp-stop-2818",
      "cuhk-wp-stop-2548",
      "cuhk-wp-stop-2550",
      "cuhk-wp-stop-3172",
      "cuhk-wp-stop-2552",
    ]);
    expect(
      route2s.patterns[0].projections.every(
        (projection) =>
          projection.offsetConfidence === "weak_prior" &&
          projection.sourceKind === "derived-spliced-segment-prior" &&
          projection.sourceRefs.some((sourceRef) =>
            sourceRef.startsWith("cupedia-cold-start-derivation:2s:"),
          ) &&
          projection.publicationStatus === "staging_only",
      ),
    ).toBe(true);
    const coordinates = route2s.patterns[0].projections.map(
      (projection) => route2s.map.stopCoordinates[projection.stopOccurrenceId]!,
    );
    expect(
      buildStopAnchoredPath(route2s.map.geometry, coordinates).segments,
    ).toHaveLength(coordinates.length - 1);
    const historicalRoute1b = historicalCampusBusRoutes.find(
      (route) => route.routeId === "1b",
    )!;
    const historicalRoute2 = historicalCampusBusRoutes.find(
      (route) => route.routeId === "2",
    )!;
    expect(geometryLineCount(route2s)).toBeLessThan(
      geometryLineCount(historicalRoute1b) +
        geometryLineCount(historicalRoute2),
    );
  });

  it("extends Route 8 from Y.I.A.P. and keeps both day-type patterns continuous", () => {
    const route8 = getCampusBusRoute("8")!;
    for (const pattern of route8.patterns) {
      expect(
        pattern.projections
          .slice(0, 4)
          .map((projection) => projection.p50Seconds),
      ).toEqual([0, 80, 166, 247]);
      expect(
        pattern.projections
          .slice(0, 4)
          .map((projection) => projection.stopOccurrenceId),
      ).toEqual([
        "cuhk-wp-stop-2913#1",
        "cuhk-wp-stop-2932#1",
        "cuhk-wp-stop-2936#1",
        "cuhk-wp-stop-2939#1",
      ]);
      const coordinates = pattern.projections.map(
        (projection) =>
          route8.map.stopCoordinates[projection.stopOccurrenceId]!,
      );
      const path = buildStopAnchoredPath(route8.map.geometry, coordinates);
      expect(path.segments).toHaveLength(coordinates.length - 1);
      expect(path.segments.every((segment) => segment.totalLength > 0)).toBe(
        true,
      );
    }
    const historicalRoute4 = historicalCampusBusRoutes.find(
      (route) => route.routeId === "4",
    )!;
    const historicalRoute8 = historicalCampusBusRoutes.find(
      (route) => route.routeId === "8",
    )!;
    expect(geometryLineCount(route8)).toBeLessThan(
      geometryLineCount(historicalRoute4) + geometryLineCount(historicalRoute8),
    );
    expect(
      route8.patterns.every((pattern) =>
        pattern.projections.every(
          (projection) =>
            projection.offsetConfidence === "weak_prior" &&
            projection.sourceRefs.some((sourceRef) =>
              sourceRef.startsWith("cupedia-cold-start-derivation:8:"),
            ),
        ),
      ),
    ).toBe(true);
  });

  it("removes Route H Residence No. 10 without deleting its road-time prior", () => {
    const historicalH = historicalCampusBusRoutes.find(
      (route) => route.routeId === "h",
    )!;
    const currentH = getCampusBusRoute("h")!;
    expect(currentH.stops.map((stop) => stop.stopId)).not.toContain(
      "cuhk-wp-stop-2967",
    );
    for (const pattern of currentH.patterns) {
      const historicalPattern = historicalH.patterns.find(
        (candidate) => candidate.id === pattern.id,
      )!;
      const currentResidence15 = pattern.projections.find(
        (projection) => projection.stopOccurrenceId === "cuhk-wp-stop-2924#1",
      )!;
      const historicalResidence15 = historicalPattern.projections.find(
        (projection) => projection.stopOccurrenceId === "cuhk-wp-stop-2924#1",
      )!;
      expect(currentResidence15.p50Seconds).toBe(
        historicalResidence15.p50Seconds,
      );
    }
    expect(
      currentH.patterns.find((pattern) => pattern.id === "h:00-via-pgh1-area39")
        ?.departureMinutes,
    ).toEqual([0]);
  });

  it("keeps repeated physical stops as distinct route occurrences", () => {
    const route2s = getCampusBusRoute("2S")!;
    const postgraduateHall = route2s.stops.filter(
      (stop) => stop.stopId === "cuhk-wp-stop-3172",
    );

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
      routeId: "1",
      stopId: "cuhk-wp-stop-2546#1",
      waitMinutes: 2,
    },
    {
      arrivalTime: "08:02",
      routeId: "2s",
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
    const route1a = getCampusBusRoute("1")!;
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
    const route1a = getCampusBusRoute("1")!;
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
    const route1a = getCampusBusRoute("1")!;
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
