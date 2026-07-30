import { describe, expect, it } from "vitest";
import {
  MTR_JOURNEY_LINES,
  UNIVERSITY_30_MINUTE_TOPOLOGY,
  UNIVERSITY_JOURNEY_TIMES,
  UNIVERSITY_JOURNEY_TIME_COUNTS,
  UNIVERSITY_JOURNEY_TIME_NEXT_BOUNDARY,
  UNIVERSITY_JOURNEY_TIME_SOURCE,
  getUniversityRoute,
} from "@/lib/food-map/university-journey-times";

describe("University MTR journey time snapshot", () => {
  it("contains the complete inclusive 10, 20 and 30 minute bands", () => {
    const within10 = UNIVERSITY_JOURNEY_TIMES.filter(
      (station) => station.minutes <= 10,
    );
    const within20 = UNIVERSITY_JOURNEY_TIMES.filter(
      (station) => station.minutes <= 20,
    );
    const within30 = UNIVERSITY_JOURNEY_TIMES.filter(
      (station) => station.minutes <= 30,
    );

    expect(within10.map((station) => station.code)).toEqual([
      "UNI",
      "FOT",
      "SHT",
      "TAP",
      "RAC",
      "TWO",
      "TAW",
    ]);
    expect(
      UNIVERSITY_JOURNEY_TIMES.filter(
        (station) => station.minutes > 10 && station.minutes <= 20,
      ).map((station) => station.code),
    ).toEqual([
      "FAN",
      "KOT",
      "HIK",
      "CKT",
      "MKK",
      "SHS",
      "STW",
      "CIO",
      "DIH",
      "HUH",
    ]);
    expect(
      UNIVERSITY_JOURNEY_TIMES.filter(
        (station) => station.minutes > 20 && station.minutes <= 30,
      ).map((station) => station.code),
    ).toEqual([
      "LOF",
      "LOW",
      "SHM",
      "SKM",
      "KAT",
      "WTS",
      "PRE",
      "EXC",
      "MOK",
      "SUW",
      "ADM",
      "ETS",
      "HOM",
      "TSH",
      "CHH",
      "SSP",
      "TKW",
      "YMT",
      "HEO",
      "LMC",
      "AUS",
      "CSW",
      "KOB",
      "MOS",
      "JOR",
      "LCK",
    ]);

    expect([within10.length, within20.length, within30.length]).toEqual([
      UNIVERSITY_JOURNEY_TIME_COUNTS.includingOriginAndSpecialService.within10,
      UNIVERSITY_JOURNEY_TIME_COUNTS.includingOriginAndSpecialService.within20,
      UNIVERSITY_JOURNEY_TIME_COUNTS.includingOriginAndSpecialService.within30,
    ]);
  });

  it("marks Racecourse as special service and reports regular-service counts", () => {
    const regularStations = UNIVERSITY_JOURNEY_TIMES.filter(
      (station) =>
        !("service" in station) || station.service !== "special-event",
    );
    const regularCounts = [10, 20, 30].map(
      (minutes) =>
        regularStations.filter((station) => station.minutes <= minutes).length,
    );

    expect(
      UNIVERSITY_JOURNEY_TIMES.find((station) => station.code === "RAC"),
    ).toMatchObject({
      journeyPlannerId: 70,
      minutes: 8,
      service: "special-event",
    });
    expect(regularCounts).toEqual([
      UNIVERSITY_JOURNEY_TIME_COUNTS.regularServiceIncludingOrigin.within10,
      UNIVERSITY_JOURNEY_TIME_COUNTS.regularServiceIncludingOrigin.within20,
      UNIVERSITY_JOURNEY_TIME_COUNTS.regularServiceIncludingOrigin.within30,
    ]);
  });

  it("keeps station codes unique and the 31 minute boundary excluded", () => {
    const stationCodes = new Set<string>(
      UNIVERSITY_JOURNEY_TIMES.map((station) => station.code),
    );
    const nextBoundaryCodes = UNIVERSITY_JOURNEY_TIME_NEXT_BOUNDARY.map(
      (station) => station.code,
    );

    expect(stationCodes.size).toBe(43);
    expect(UNIVERSITY_JOURNEY_TIMES.at(-2)).toMatchObject({
      code: "JOR",
      minutes: 30,
    });
    expect(UNIVERSITY_JOURNEY_TIMES.at(-1)).toMatchObject({
      code: "LCK",
      minutes: 30,
    });
    expect(nextBoundaryCodes).toEqual([
      "CEN",
      "NAC",
      "NTK",
      "WAC",
      "WHA",
      "WKS",
    ]);
    expect(
      UNIVERSITY_JOURNEY_TIME_NEXT_BOUNDARY.every(
        (station) => station.minutes === 31 && !stationCodes.has(station.code),
      ),
    ).toBe(true);
  });

  it("covers every reachable station with the four route topologies", () => {
    const stationCodes = new Set(
      UNIVERSITY_JOURNEY_TIMES.map((station) => station.code),
    );
    const topologyCodes = new Set<string>();

    expect(Object.keys(MTR_JOURNEY_LINES)).toEqual([
      "EAL",
      "TML",
      "KTL",
      "TWL",
    ]);

    for (const branches of Object.values(UNIVERSITY_30_MINUTE_TOPOLOGY)) {
      for (const branch of branches) {
        for (const code of branch.stationCodes) {
          expect(stationCodes.has(code), code).toBe(true);
          topologyCodes.add(code);
        }
      }
    }

    expect(topologyCodes).toEqual(stationCodes);
  });

  it("records a successful full-network crawl from University", () => {
    expect(UNIVERSITY_JOURNEY_TIME_SOURCE).toMatchObject({
      originCode: "UNI",
      originJourneyPlannerId: 71,
      accessedOn: "2026-07-30",
      audit: {
        journeyPlannerStationRecords: 102,
        uniqueStationCodes: 99,
        mtrStationCodesInScope: 98,
        destinationRecordsQueried: 101,
        successfulResponses: 101,
        failedResponses: 0,
      },
    });
  });

  it("preserves the official shortest-route edge state at each budget", () => {
    const lineCountsAt = (limit: number) => {
      const edges = new Map<string, string>();

      for (const station of UNIVERSITY_JOURNEY_TIMES) {
        if (station.minutes > limit) continue;
        for (const segment of getUniversityRoute(station.code).segments) {
          const pair = [segment.from, segment.to].sort().join("|");
          edges.set(`${pair}|${segment.lineId}`, segment.lineId);
        }
      }

      return Object.fromEntries(
        [...edges.values()].reduce(
          (counts, lineId) => counts.set(lineId, (counts.get(lineId) ?? 0) + 1),
          new Map<string, number>(),
        ),
      );
    };

    expect(lineCountsAt(10)).toEqual({ EAL: 6 });
    expect(lineCountsAt(20)).toEqual({ EAL: 11, TML: 5 });
    expect(lineCountsAt(30)).toEqual({
      EAL: 15,
      TML: 15,
      KTL: 9,
      TWL: 5,
    });

    expect(getUniversityRoute("YMT")).toMatchObject({
      stationCodes: [
        "UNI",
        "FOT",
        "SHT",
        "TAW",
        "KOT",
        "SKM",
        "PRE",
        "MOK",
        "YMT",
      ],
      segments: expect.arrayContaining([
        { from: "MOK", to: "YMT", lineId: "KTL" },
      ]),
    });
    expect(getUniversityRoute("JOR")).toMatchObject({
      stationCodes: [
        "UNI",
        "FOT",
        "SHT",
        "TAW",
        "KOT",
        "SKM",
        "PRE",
        "MOK",
        "YMT",
        "JOR",
      ],
      segments: expect.arrayContaining([
        { from: "MOK", to: "YMT", lineId: "TWL" },
      ]),
    });
  });
});
