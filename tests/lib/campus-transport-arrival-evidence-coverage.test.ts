import { describe, expect, it } from "vitest";

import {
  buildArrivalEvidenceCoverage,
  summarizeArrivalEvidenceReplay,
} from "@/lib/campus-transport/arrival-evidence-coverage";
import {
  reconstructArrivalEvidence,
  trainCandidateModel,
  type ArrivalObservationForModel,
} from "@/lib/campus-transport/prediction-model";
import { getCampusBusScheduledArrivals } from "@/lib/campus-transport/campus-bus";
import {
  campusBusRoutes,
  getCampusBusRouteForServiceDate,
  historicalCampusBusRoutes,
} from "@/lib/campus-transport/routes-data";

function existingSample(): ArrivalObservationForModel[] {
  const route = getCampusBusRouteForServiceDate("n", "2026-08-20")!;
  const pattern = route.patterns.find(
    (candidate) => candidate.id === "n:default",
  )!;
  const departureAt = new Date("2026-08-20T20:15:00+08:00").getTime();
  return pattern.projections.slice(1, 14).flatMap((projection, stopIndex) =>
    [0, 20, 40].map((duplicateSeconds, duplicateIndex) => {
      const observedArrivalAt = new Date(
        departureAt + (projection.p50Seconds + 60 + duplicateSeconds) * 1_000,
      );
      return {
        id: `sample-${stopIndex + 1}-${duplicateIndex + 1}`,
        observedArrivalAt,
        receivedAt: new Date(observedArrivalAt.getTime() + 5_000),
        routeId: "n",
        stopOccurrenceId: projection.stopOccurrenceId,
      };
    }),
  );
}

describe("campus bus read-only arrival evidence replay", () => {
  it("replays 39 context-less observations deterministically without reaching the model threshold", () => {
    const observations = existingSample();
    const routeRevisions = [...historicalCampusBusRoutes, ...campusBusRoutes];
    const first = reconstructArrivalEvidence(observations, routeRevisions);
    const second = reconstructArrivalEvidence(observations, routeRevisions);

    expect(observations).toHaveLength(39);
    expect(summarizeArrivalEvidenceReplay(observations, first)).toEqual(
      summarizeArrivalEvidenceReplay(observations, second),
    );
    expect(first.trajectories).toHaveLength(1);
    expect(first.events).toHaveLength(13);
    expect(trainCandidateModel(first.events).adjustments).toEqual([]);
  });

  it("reports route, pattern, stop, and segment deficits and highlights revised-route gaps", () => {
    const observations = existingSample();
    const replay = reconstructArrivalEvidence(observations, [
      ...historicalCampusBusRoutes,
      ...campusBusRoutes,
    ]);
    const coverage = buildArrivalEvidenceCoverage(
      observations,
      historicalCampusBusRoutes,
      campusBusRoutes,
      replay,
    );

    expect(new Set(coverage.map((row) => row.dimension))).toEqual(
      new Set(["route", "pattern", "stop", "segment"]),
    );
    expect(
      coverage.find(
        (row) =>
          row.routeId === "n" &&
          row.dimension === "stop" &&
          row.observationCount === 3,
      ),
    ).toMatchObject({
      eventDeficit: 10,
      independentEventCount: 1,
      serviceDayCount: 1,
      serviceDayDeficit: 5,
    });
    expect(
      coverage.some(
        (row) => row.routeId === "2s" && row.highlightedRevisionGap,
      ),
    ).toBe(true);
    expect(
      coverage.some(
        (row) =>
          row.routeId === "8" &&
          row.dimension === "segment" &&
          row.highlightedRevisionGap,
      ),
    ).toBe(true);
    expect(
      coverage.some(
        (row) =>
          row.routeId === "h" &&
          row.dimension === "segment" &&
          row.highlightedRevisionGap,
      ),
    ).toBe(true);

    const repeatedUniversityStops = coverage.filter(
      (row) =>
        row.routeId === "n" &&
        row.patternId === "n:default" &&
        row.dimension === "stop" &&
        row.label === "大學站",
    );
    expect(repeatedUniversityStops).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          stopOccurrenceId: "cuhk-wp-stop-2552#1",
        }),
        expect.objectContaining({
          stopOccurrenceId: "cuhk-wp-stop-2552#2",
        }),
      ]),
    );
  });

  it("computes publication deficits after reserving validation service days", () => {
    const observations: ArrivalObservationForModel[] = [];
    for (const day of [10, 11, 12, 13, 14]) {
      const serviceDate = `2026-08-${day}`;
      const route = getCampusBusRouteForServiceDate("2", serviceDate)!;
      const pattern = route.patterns.find(
        (candidate) => candidate.id === "2:via-shaw-hall",
      )!;
      const stopOccurrenceId = pattern.projections[1].stopOccurrenceId;
      const arrivals = getCampusBusScheduledArrivals(
        route,
        stopOccurrenceId,
        new Date(`${serviceDate}T12:00:00+08:00`).getTime(),
      )
        .filter((arrival) => arrival.patternId === pattern.id)
        .slice(0, 2);
      observations.push(
        ...arrivals.map((arrival, index) => ({
          id: `${serviceDate}-${index + 1}`,
          observedArrivalAt: new Date(arrival.arrivalAt),
          receivedAt: new Date(arrival.arrivalAt + 5_000),
          routeId: route.routeId,
          stopOccurrenceId,
        })),
      );
    }
    const routeRevisions = [...historicalCampusBusRoutes, ...campusBusRoutes];
    const replay = reconstructArrivalEvidence(observations, routeRevisions);
    const coverage = buildArrivalEvidenceCoverage(
      observations,
      historicalCampusBusRoutes,
      campusBusRoutes,
      replay,
    );
    const route = getCampusBusRouteForServiceDate("2", "2026-08-10")!;
    const pattern = route.patterns.find(
      (candidate) => candidate.id === "2:via-shaw-hall",
    )!;
    const stopOccurrenceId = pattern.projections[1].stopOccurrenceId;
    const stopCoverage = coverage.find(
      (row) =>
        row.routeRevisionId === route.routeRevisionId &&
        row.patternRevisionId === pattern.revisionId &&
        row.dimension === "stop" &&
        row.stopOccurrenceId === stopOccurrenceId,
    );

    expect(replay.events).toHaveLength(10);
    expect(trainCandidateModel(replay.events).shouldPromote).toBe(false);
    expect(stopCoverage).toMatchObject({
      eventDeficit: 2,
      independentEventCount: 10,
      serviceDayCount: 5,
      serviceDayDeficit: 1,
    });
  });
});
