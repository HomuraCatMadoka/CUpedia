import { describe, expect, it } from "vitest";

import {
  applyPredictionAdjustmentsToRoutes,
  candidateBeatsChampion,
  eventsForRouteRevisions,
  reconstructArrivalEvidence,
  trainCandidateModel,
} from "@/lib/campus-transport/prediction-model";
import {
  getCampusBusScheduledArrivals,
  getCampusBusStopBoard,
} from "@/lib/campus-transport/campus-bus";
import {
  campusBusRoutes,
  getCampusBusRouteForServiceDate,
  historicalCampusBusRoutes,
} from "@/lib/campus-transport/routes-data";

const historicalRoute2ViewData = getCampusBusRouteForServiceDate(
  "2",
  "2026-08-31",
)!;
type ReconstructedArrivalEvent = Parameters<
  typeof trainCandidateModel
>[0][number];

function event(
  day: number,
  residualSeconds: number,
  hour = 8,
): ReconstructedArrivalEvent {
  const departure = new Date(
    `2026-08-${String(day).padStart(2, "0")}T${String(hour).padStart(2, "0")}:00:00+08:00`,
  );
  const baselineArrival = new Date(departure.getTime() + 8 * 60_000);
  return {
    eventKey: `event-${day}-${hour}`,
    trajectoryId: `trajectory-${day}-${hour}`,
    routeId: "2",
    routeRevisionId: historicalRoute2ViewData.routeRevisionId,
    patternId: "2:default",
    patternRevisionId: "2:default:97e5da66c56a7077",
    stopOccurrenceId: "cuhk-wp-stop-2550#1",
    scheduledDepartureAt: departure,
    baselineArrivalAt: baselineArrival,
    observedArrivalAt: new Date(
      baselineArrival.getTime() + residualSeconds * 1_000,
    ),
    serviceDate: `2026-08-${String(day).padStart(2, "0")}`,
    residualSeconds,
    observationIds: [`observation-${day}-${hour}`],
    observationCount: 1,
    confidence: 0.9,
  };
}

describe("campus bus feedback model", () => {
  it("requires a candidate to beat the current champion on the same holdout", () => {
    expect(
      candidateBeatsChampion(
        {
          eventCount: 20,
          baselineMaeSeconds: 180,
          baselineP90Seconds: 300,
          candidateMaeSeconds: 110,
          candidateP90Seconds: 210,
        },
        {
          eventCount: 20,
          baselineMaeSeconds: 180,
          baselineP90Seconds: 300,
          candidateMaeSeconds: 100,
          candidateP90Seconds: 205,
        },
      ),
    ).toBe(false);
    expect(
      candidateBeatsChampion(
        {
          eventCount: 20,
          baselineMaeSeconds: 180,
          baselineP90Seconds: 300,
          candidateMaeSeconds: 90,
          candidateP90Seconds: 220,
        },
        {
          eventCount: 20,
          baselineMaeSeconds: 180,
          baselineP90Seconds: 300,
          candidateMaeSeconds: 100,
          candidateP90Seconds: 205,
        },
      ),
    ).toBe(true);
  });

  it("keeps ambiguous trip candidates but only reconstructs a unique event", () => {
    const stopOccurrenceId = "cuhk-wp-stop-2550#1";
    const result = reconstructArrivalEvidence(
      [
        {
          id: "with-context",
          routeId: "2",
          stopOccurrenceId,
          observedArrivalAt: new Date("2026-08-10T08:14:00+08:00"),
          receivedAt: new Date("2026-08-10T08:14:30+08:00"),
        },
        {
          id: "ambiguous",
          routeId: "2",
          stopOccurrenceId,
          observedArrivalAt: new Date("2026-08-10T08:21:30+08:00"),
          receivedAt: new Date("2026-08-10T08:22:00+08:00"),
        },
      ],
      [historicalRoute2ViewData],
    );

    expect(
      result.candidates.filter((row) => row.observationId === "ambiguous"),
    ).toHaveLength(2);
    expect(result.events).toHaveLength(1);
    expect(result.events[0]).toMatchObject({
      observationIds: ["with-context"],
      patternId: "2:via-shaw-hall",
      routeId: "2",
    });
  });

  it("aggregates multiple observations of one physical arrival into one event", () => {
    const result = reconstructArrivalEvidence(
      [0, 20, 40].map((seconds, index) => ({
        id: `observation-${index}`,
        routeId: "2",
        stopOccurrenceId: "cuhk-wp-stop-2550#1",
        observedArrivalAt: new Date(
          new Date("2026-08-10T08:14:00+08:00").getTime() + seconds * 1_000,
        ),
        receivedAt: new Date("2026-08-10T08:15:00+08:00"),
      })),
      [historicalRoute2ViewData],
    );

    expect(result.events).toHaveLength(1);
    expect(result.events[0]).toMatchObject({
      observationCount: 3,
      observationIds: ["observation-0", "observation-1", "observation-2"],
    });
  });

  it("merges same-stop observations that independently match the same physical arrival", () => {
    const route = getCampusBusRouteForServiceDate("2", "2026-09-02")!;
    const pattern = route.patterns.find(
      (candidate) => candidate.id === "2:via-shaw-hall",
    )!;
    const stopOccurrenceId = pattern.projections[1].stopOccurrenceId;
    const scheduledArrival = getCampusBusScheduledArrivals(
      route,
      stopOccurrenceId,
      new Date("2026-09-02T08:00:00+08:00").getTime(),
    ).find((arrival) => arrival.patternId === pattern.id)!;
    const result = reconstructArrivalEvidence(
      [0, 120].map((seconds, index) => ({
        id: `same-arrival-${index + 1}`,
        routeId: route.routeId,
        stopOccurrenceId,
        observedArrivalAt: new Date(
          scheduledArrival.arrivalAt + seconds * 1_000,
        ),
        receivedAt: new Date(
          scheduledArrival.arrivalAt + seconds * 1_000 + 5_000,
        ),
      })),
      [route],
    );

    expect(result.trajectories).toHaveLength(1);
    expect(result.events).toHaveLength(1);
    expect(result.events[0]).toMatchObject({
      observationCount: 2,
      observationIds: ["same-arrival-1", "same-arrival-2"],
      scheduledDepartureAt: new Date(scheduledArrival.departureAt),
      stopOccurrenceId,
    });
  });

  it("does not reconstruct one trip moving between adjacent stops in zero seconds", () => {
    const route = getCampusBusRouteForServiceDate("2", "2026-09-02")!;
    const pattern = route.patterns.find(
      (candidate) => candidate.id === "2:via-shaw-hall",
    )!;
    const previousStop = pattern.projections[1].stopOccurrenceId;
    const currentStop = pattern.projections[2].stopOccurrenceId;
    const scheduledArrival = getCampusBusScheduledArrivals(
      route,
      previousStop,
      new Date("2026-09-02T08:00:00+08:00").getTime(),
    ).find((arrival) => arrival.patternId === pattern.id)!;
    const observedArrivalAt = new Date(scheduledArrival.arrivalAt);
    const result = reconstructArrivalEvidence(
      [
        {
          id: "impossible-previous",
          routeId: route.routeId,
          stopOccurrenceId: previousStop,
          observedArrivalAt,
          receivedAt: new Date(observedArrivalAt.getTime() + 5_000),
        },
        {
          id: "impossible-current",
          routeId: route.routeId,
          stopOccurrenceId: currentStop,
          observedArrivalAt,
          receivedAt: new Date(observedArrivalAt.getTime() + 5_000),
        },
      ],
      [route],
    );

    expect(result.events).toEqual([]);
    expect(
      result.exclusions
        .filter((exclusion) => exclusion.reason === "ambiguous_trip")
        .flatMap((exclusion) => exclusion.observationIds)
        .sort(),
    ).toEqual(["impossible-current", "impossible-previous"]);
  });

  it("rejects a trip that crosses a long scheduled section impossibly fast", () => {
    const route = getCampusBusRouteForServiceDate("1", "2026-09-02")!;
    const pattern = route.patterns.find(
      (candidate) => candidate.id === "1a:default",
    )!;
    const previousStop = pattern.projections[1];
    const currentStop = pattern.projections.at(-1)!;
    const scheduledArrival = getCampusBusScheduledArrivals(
      route,
      previousStop.stopOccurrenceId,
      new Date("2026-09-02T08:00:00+08:00").getTime(),
    ).find((arrival) => arrival.patternId === pattern.id)!;
    const observedArrivalAt = scheduledArrival.arrivalAt;
    const result = reconstructArrivalEvidence(
      [
        {
          id: "long-section-previous",
          routeId: route.routeId,
          stopOccurrenceId: previousStop.stopOccurrenceId,
          observedArrivalAt: new Date(observedArrivalAt),
          receivedAt: new Date(observedArrivalAt + 5_000),
        },
        {
          id: "long-section-current",
          routeId: route.routeId,
          stopOccurrenceId: currentStop.stopOccurrenceId,
          observedArrivalAt: new Date(observedArrivalAt + 30_000),
          receivedAt: new Date(observedArrivalAt + 35_000),
        },
      ],
      [route],
    );

    expect(currentStop.p50Seconds - previousStop.p50Seconds).toBeGreaterThan(
      7 * 60,
    );
    expect(result.events).toEqual([]);
    expect(
      result.exclusions
        .filter((exclusion) => exclusion.reason === "ambiguous_trip")
        .flatMap((exclusion) => exclusion.observationIds)
        .sort(),
    ).toEqual(["long-section-current", "long-section-previous"]);
  });

  it("selects the route revision that was valid on the Hong Kong service date", () => {
    const historical1b = getCampusBusRouteForServiceDate("1b", "2026-08-20")!;
    const stopOccurrenceId =
      historical1b.patterns[0].projections[1].stopOccurrenceId;
    const baseline = getCampusBusStopBoard(
      historical1b,
      stopOccurrenceId,
      new Date("2026-08-20T08:00:00+08:00").getTime(),
    ).upcomingArrivals[0]!;
    const result = reconstructArrivalEvidence(
      [
        {
          id: "old-1b",
          routeId: "1b",
          stopOccurrenceId,
          observedArrivalAt: new Date(baseline.arrivalAt),
          receivedAt: new Date(baseline.arrivalAt + 30_000),
        },
      ],
      [...historicalCampusBusRoutes, ...campusBusRoutes],
    );

    expect(result.trajectories[0]).toMatchObject({
      patternRevisionId: historical1b.patterns[0].revisionId,
      routeId: "1b",
      routeRevisionId: historical1b.routeRevisionId,
      status: "matched",
    });
    expect(result.trajectories[0].routeRevisionId).not.toContain("2s");
    expect(eventsForRouteRevisions(result.events, campusBusRoutes)).toEqual([]);
  });

  it("keeps a delayed N-line sequence on one trip and merges the two origin reports", () => {
    const result = reconstructArrivalEvidence(
      [
        {
          id: "university-1",
          routeId: "n",
          stopOccurrenceId: "cuhk-wp-stop-2552#1",
          observedArrivalAt: new Date("2026-08-20T21:14:00+08:00"),
          receivedAt: new Date("2026-08-20T21:14:10+08:00"),
        },
        {
          id: "university-2",
          routeId: "n",
          stopOccurrenceId: "cuhk-wp-stop-2552#1",
          observedArrivalAt: new Date("2026-08-20T21:14:44+08:00"),
          receivedAt: new Date("2026-08-20T21:14:50+08:00"),
        },
        {
          id: "downstream",
          routeId: "n",
          stopOccurrenceId: "cuhk-wp-stop-2550#1",
          observedArrivalAt: new Date("2026-08-20T21:52:00+08:00"),
          receivedAt: new Date("2026-08-20T21:52:10+08:00"),
        },
      ],
      [...historicalCampusBusRoutes, ...campusBusRoutes],
    );

    expect(result.trajectories).toHaveLength(1);
    expect(result.trajectories[0]).toMatchObject({
      observationIds: ["university-1", "university-2", "downstream"],
      scheduledDepartureAt: new Date("2026-08-20T21:15:00+08:00"),
      status: "matched",
    });
    expect(result.events).toHaveLength(1);
    expect(result.events[0]).toMatchObject({
      observationIds: ["downstream"],
      scheduledDepartureAt: new Date("2026-08-20T21:15:00+08:00"),
    });
    expect(
      result.exclusions.find(
        (exclusion) => exclusion.reason === "origin_without_departure_evidence",
      ),
    ).toMatchObject({
      observationIds: ["university-1", "university-2"],
    });
    expect(
      result.events.some(
        (arrivalEvent) =>
          arrivalEvent.scheduledDepartureAt.getTime() ===
          new Date("2026-08-20T21:30:00+08:00").getTime(),
      ),
    ).toBe(false);
  });

  it("shrinks a stable residual toward the cold-start baseline and promotes only after holdout improvement", () => {
    const events = Array.from({ length: 15 }, (_, index) =>
      event(index + 1, index % 2 === 0 ? 175 : 185),
    );
    const model = trainCandidateModel(events, {
      priorStrength: 4,
    });

    const morning = model.adjustments.find(
      (adjustment) => adjustment.timeBand === "morning_peak",
    );
    expect(morning).toBeDefined();
    expect(morning!.residualSeconds).toBeGreaterThan(100);
    expect(morning!.residualSeconds).toBeLessThan(180);
    expect(model.evaluation.candidateMaeSeconds).toBeLessThan(
      model.evaluation.baselineMaeSeconds!,
    );
    expect(model.shouldPromote).toBe(true);
  });

  it("enforces the established ten-event and five-day publication threshold", () => {
    const events = Array.from({ length: 5 }, (_, index) => index + 1).flatMap(
      (day) => [8, 9].map((hour) => event(day, 180, hour)),
    );
    const model = trainCandidateModel(events);

    expect(
      model.adjustments.find((adjustment) => adjustment.timeBand === "all_day"),
    ).toMatchObject({ eventCount: 10, serviceDayCount: 5 });
  });

  it("falls back to cold-start when the service-day threshold is not met", () => {
    const model = trainCandidateModel(
      Array.from({ length: 12 }, (_, index) => event(1, 240 + index)),
    );

    expect(model.adjustments).toEqual([]);
    expect(model.shouldPromote).toBe(false);
  });

  it("applies a champion correction to the passenger stop board", () => {
    const [adjusted] = applyPredictionAdjustmentsToRoutes(
      [historicalRoute2ViewData],
      [
        {
          routeId: "2",
          patternId: "2:via-shaw-hall",
          stopOccurrenceId: "cuhk-wp-stop-2550#1",
          timeBand: "morning_peak",
          residualSeconds: 180,
          eventCount: 12,
          serviceDayCount: 6,
          medianResidualSeconds: 240,
          medianAbsoluteDeviationSeconds: 20,
          shrinkageWeight: 0.75,
        },
      ],
      "model-1",
    );
    const board = getCampusBusStopBoard(
      adjusted,
      "cuhk-wp-stop-2550#1",
      new Date("2026-08-10T08:10:00+08:00").getTime(),
    );

    expect(adjusted.predictionRevisionId).toBe("model-1");
    expect(board.upcomingArrivals[0].arrivalTime).toBe("08:16");
  });
});
