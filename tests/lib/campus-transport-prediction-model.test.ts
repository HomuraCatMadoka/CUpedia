import { describe, expect, it } from "vitest";

import {
  applyPredictionAdjustments,
  candidateBeatsChampion,
  reconstructArrivalEvidence,
  trainCandidateModel,
  type ReconstructedArrivalEvent,
} from "@/lib/campus-transport/prediction-model";
import { getCampusBusStopBoard } from "@/lib/campus-transport/campus-bus";
import { getCampusBusRouteForServiceDate } from "@/lib/campus-transport/routes-data";

const historicalRoute2ViewData = getCampusBusRouteForServiceDate(
  "2",
  "2026-08-31",
)!;

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
    routeId: "2",
    patternId: "2:default",
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

  it("shrinks a stable residual toward the cold-start baseline and promotes only after holdout improvement", () => {
    const events = Array.from({ length: 10 }, (_, index) =>
      event(index + 1, index % 2 === 0 ? 175 : 185),
    );
    const model = trainCandidateModel(events, {
      minEvents: 4,
      minServiceDays: 3,
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

  it("falls back to cold-start when the service-day threshold is not met", () => {
    const model = trainCandidateModel(
      Array.from({ length: 12 }, (_, index) => event(1, 240 + index)),
    );

    expect(model.adjustments).toEqual([]);
    expect(model.shouldPromote).toBe(false);
  });

  it("applies a champion correction to the passenger stop board", () => {
    const adjusted = applyPredictionAdjustments(
      historicalRoute2ViewData,
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
