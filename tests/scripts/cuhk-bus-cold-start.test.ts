import { describe, expect, it } from "vitest";

import {
  buildColdStartDataset,
  type PublicDataSnapshot,
} from "../../scripts/cuhk-bus-cold-start";

function snapshotWithPriors(
  priors: PublicDataSnapshot["merged"]["segmentTravelTimePriors"],
): PublicDataSnapshot {
  return {
    generatedAt: "2026-08-10T00:00:00.000Z",
    parserVersion: "fixture/1",
    merged: {
      routes: [
        {
          routeId: "2",
          name: "2 NA / UC",
          nameZhHant: "2 新聯線",
          sourceRef: "route-source",
          scheduleBands: [
            {
              sourceOrdinal: 0,
              startTime: "07:45",
              endTime: "18:45",
              departureMinutes: [0, 15, 30, 45],
              serviceRuleRaw:
                "07:45 - 18:45 For Mon to Sat (Except Public Holidays)",
              departureRuleRaw: "00, 15, 30, 45",
              parseStatus: "parsed",
            },
          ],
          officialMapEvidence: {
            sourceRef: "map-source",
            routePatterns: [
              {
                patternId: "2:default",
                activation: {
                  departureMinutes: [15, 30],
                  serviceDayType: "scheduled_service_day",
                },
                stopSequence: [
                  {
                    sequence: 1,
                    stopId: "a",
                    stopName: "A",
                    sourceName: "A",
                  },
                  {
                    sequence: 2,
                    stopId: "b",
                    stopName: "B",
                    sourceName: "B",
                  },
                  {
                    sequence: 3,
                    stopId: "c",
                    stopName: "C",
                    sourceName: "C",
                  },
                ],
                evidence: {
                  officialPdfSourceRef: "pdf-source",
                  officialPdfPages: [1],
                  officialRoutePageSourceRefs: ["route-page-source"],
                  busClockSourceRef: "bus-clock-source",
                  busClockVariantIds: ["2"],
                },
                confidence: "reviewed",
              },
            ],
          },
        },
      ],
      stops: [
        { stopId: "a", nameEn: "A", nameZhHant: "甲" },
        { stopId: "b", nameEn: "B", nameZhHant: "乙" },
        { stopId: "c", nameEn: "C", nameZhHant: "丙" },
      ],
      segmentTravelTimePriors: priors,
      serviceCalendars: {
        publicHolidays: {
          sourceRef: "holiday-source",
          events: [{ date: "2026-07-01" }],
        },
      },
    },
  };
}

function prior(
  fromStopId: string,
  toStopId: string,
  sampleCount: number,
  p10Seconds: number,
  p50Seconds: number,
  p90Seconds: number,
) {
  return {
    segmentKey: `${fromStopId}>>${toStopId}`,
    fromMatch: { status: "auto" as const, stopId: fromStopId },
    toMatch: { status: "auto" as const, stopId: toStopId },
    routeScope: null,
    sampleCount,
    p10Seconds,
    p50Seconds,
    p90Seconds,
    sourceRef: `source:${fromStopId}-${toStopId}`,
    confidence: "weak_prior",
  };
}

describe("buildColdStartDataset", () => {
  it("accumulates adjacent public priors while preserving conservative evidence", () => {
    const dataset = buildColdStartDataset(
      snapshotWithPriors([
        prior("a", "b", 8, 50, 60, 80),
        prior("b", "c", 3, 90, 100, 130),
      ]),
      "2",
      "snapshot-hash",
    );

    expect(dataset.status).toBe("staging_only");
    expect(dataset.service).toMatchObject({
      publicHolidayDates: ["2026-07-01"],
      publicHolidaySourceRef: "holiday-source",
      scheduleBands: [
        {
          startTime: "07:45",
          endTime: "18:45",
          serviceDayRule: "monday_saturday_except_public_holidays",
        },
      ],
    });
    expect(dataset.coverage).toMatchObject({
      patterns: 1,
      stopProjections: 3,
      availableStopProjections: 3,
      unavailableStopProjections: 0,
    });
    expect(dataset.patterns[0].projections).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          stopId: "a",
          cumulativeOffsetSeconds: 0,
          offsetConfidence: "official",
          sourceKind: "official-origin",
        }),
        expect.objectContaining({
          stopId: "b",
          cumulativeOffsetSeconds: 60,
          p10Seconds: 50,
          p90Seconds: 80,
          offsetConfidence: "weak_observation",
          sampleCount: 8,
        }),
        expect.objectContaining({
          stopId: "c",
          cumulativeOffsetSeconds: 160,
          p10Seconds: 140,
          p90Seconds: 210,
          sampleCount: 3,
          evidence: expect.objectContaining({
            segmentCount: 2,
            segmentSamplesTotal: 11,
            bottleneckSampleCount: 3,
            serviceDayCount: null,
            routeScope: "mixed_or_unknown",
          }),
        }),
      ]),
    );
  });

  it("marks the first missing segment and every downstream stop unavailable", () => {
    const dataset = buildColdStartDataset(
      snapshotWithPriors([prior("b", "c", 3, 90, 100, 130)]),
      "2",
    );
    const projections = dataset.patterns[0].projections;

    expect(projections[0].cumulativeOffsetSeconds).toBe(0);
    expect(projections[1]).toMatchObject({
      cumulativeOffsetSeconds: null,
      sourceKind: "unavailable",
      fallbackLevel: "unavailable",
    });
    expect(projections[2].cumulativeOffsetSeconds).toBeNull();
  });

  it("fills a missing adjacent pair through the shortest directed public-prior path", () => {
    const snapshot = snapshotWithPriors([
      prior("a", "b", 8, 50, 60, 80),
      prior("b", "c", 3, 90, 100, 130),
    ]);
    snapshot.merged.routes[0].officialMapEvidence!.routePatterns[0].stopSequence =
      [
        { sequence: 1, stopId: "a", stopName: "A", sourceName: "A" },
        { sequence: 2, stopId: "c", stopName: "C", sourceName: "C" },
      ];

    const dataset = buildColdStartDataset(snapshot, "2");

    expect(dataset.patterns[0].projections[1]).toMatchObject({
      cumulativeOffsetSeconds: 160,
      fallbackLevel: "shortest-public-prior-path",
      p10Seconds: 140,
      p90Seconds: 210,
      sampleCount: 3,
      sourceKind: "public-observation",
      evidence: expect.objectContaining({ segmentCount: 2 }),
    });
  });

  it("uses a route-aligned community template as the baseline and keeps public priors as sensitivity evidence", () => {
    const dataset = buildColdStartDataset(
      snapshotWithPriors([prior("a", "b", 8, 50, 60, 80)]),
      "2",
      "snapshot-hash",
      {
        patterns: { "2:default": [0, 65, 175] },
        sha256: "community-hash",
        sourceRef: "community-source",
      },
    );

    expect(dataset.patterns[0].projections[1]).toMatchObject({
      baselineSourceRefs: ["community-source"],
      cumulativeOffsetSeconds: 65,
      fallbackLevel: "community-route-baseline",
      offsetConfidence: "weak_prior",
      p50Seconds: 65,
      sourceKind: "community-prior",
    });
    expect(dataset.patterns[0].projections[2]).toMatchObject({
      cumulativeOffsetSeconds: 175,
      fallbackLevel: "community-route-baseline",
      intervalMethod: "community-route-point-estimate",
      p10Seconds: null,
      p50Seconds: 175,
      p90Seconds: null,
      sourceKind: "community-prior",
      sourceRefs: expect.arrayContaining(["community-source"]),
    });
    expect(dataset.patterns[0].segments).toEqual([
      expect.objectContaining({
        baselineSeconds: 65,
        confidence: "weak_prior",
        fromStopId: "a",
        sourceKind: "community-prior",
        sourceRefs: ["community-source"],
        toStopId: "b",
        sensitivityCheck: expect.objectContaining({
          absoluteDifferenceSeconds: 5,
          p50Seconds: 60,
          sampleCount: 8,
        }),
      }),
      expect.objectContaining({
        baselineSeconds: 110,
        fromStopId: "b",
        toStopId: "c",
        sensitivityCheck: expect.objectContaining({
          p50Seconds: null,
          sampleCount: 0,
        }),
      }),
    ]);
    expect(dataset.derivedFrom.communityPriorSha256).toBe("community-hash");
    expect(dataset.publicationBlockers).not.toContain(
      "community_app_data_license_unresolved",
    );
  });

  it("prefers a unique exact stop match over a reviewed terminal alias", () => {
    const exact = prior("a", "b", 8, 50, 60, 80);
    const reviewedAlias = {
      ...prior("a", "b", 1, 70, 75, 80),
      segmentKey: "a>>b (Terminus)",
      toMatch: { status: "review" as const, stopId: "b" },
    };

    const dataset = buildColdStartDataset(
      snapshotWithPriors([
        exact,
        reviewedAlias,
        prior("b", "c", 3, 90, 100, 130),
      ]),
      "2",
    );

    expect(dataset.patterns[0].projections[1]).toMatchObject({
      p50Seconds: 60,
      sampleCount: 8,
    });
    expect(dataset.coverage.uniqueObservedSegmentPairs).toBe(2);
  });

  it("rejects ambiguous priors instead of silently choosing one", () => {
    const duplicate = prior("a", "b", 4, 40, 55, 70);

    expect(() =>
      buildColdStartDataset(
        snapshotWithPriors([prior("a", "b", 8, 50, 60, 80), duplicate]),
        "2",
      ),
    ).toThrow("Ambiguous segment prior");
  });
});
