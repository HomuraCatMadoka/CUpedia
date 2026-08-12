import { NextRequest, NextResponse } from "next/server";

import {
  arrivalFeedbackRateLimitKey,
  insertArrivalObservation,
} from "@/lib/campus-transport/arrival-observation-store";
import { getCampusBusRoute } from "@/lib/campus-transport/routes-data";
import { getChampionCampusBusRoute } from "@/lib/campus-transport/prediction-model-cache";

const MAX_PAST_MILLISECONDS = 15 * 60_000;
const MAX_FUTURE_MILLISECONDS = 2 * 60_000;

type PredictionContext = {
  departureAt?: unknown;
  modelRevisionId?: unknown;
  patternId?: unknown;
};

function objectValue(value: unknown): Record<string, unknown> | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

export async function POST(request: NextRequest) {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 });
  }

  const body = objectValue(raw);
  if (!body) {
    return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 });
  }

  const routeId = typeof body.routeId === "string" ? body.routeId : "";
  const stopOccurrenceId =
    typeof body.stopOccurrenceId === "string" ? body.stopOccurrenceId : "";
  const route =
    (await getChampionCampusBusRoute(routeId)) ?? getCampusBusRoute(routeId);
  if (!route) {
    return NextResponse.json({ error: "INVALID_ROUTE" }, { status: 400 });
  }

  const stop = route.stops.find(
    (candidate) => candidate.id === stopOccurrenceId,
  );
  if (!stop) {
    return NextResponse.json({ error: "INVALID_STOP" }, { status: 400 });
  }

  const observedArrivalAt = new Date(
    typeof body.observedArrivalAt === "string" ? body.observedArrivalAt : NaN,
  );
  const receivedAt = new Date();
  const difference = receivedAt.getTime() - observedArrivalAt.getTime();
  if (
    !Number.isFinite(observedArrivalAt.getTime()) ||
    difference > MAX_PAST_MILLISECONDS ||
    difference < -MAX_FUTURE_MILLISECONDS
  ) {
    return NextResponse.json(
      { error: "INVALID_ARRIVAL_TIME" },
      { status: 400 },
    );
  }

  const rawPredictionContext = objectValue(
    body.predictionContext,
  ) as PredictionContext | null;
  const candidatePattern = route.patterns.find(
    (pattern) => pattern.id === rawPredictionContext?.patternId,
  );
  const candidateDepartureAt = new Date(
    typeof rawPredictionContext?.departureAt === "string"
      ? rawPredictionContext.departureAt
      : NaN,
  );
  const hasValidPredictionContext =
    rawPredictionContext?.modelRevisionId ===
      (route.predictionRevisionId ?? route.datasetId) &&
    Boolean(candidatePattern) &&
    Number.isFinite(candidateDepartureAt.getTime());
  const projectionId = hasValidPredictionContext
    ? [
        route.predictionRevisionId ?? route.datasetId,
        candidatePattern!.id,
        stop.id,
        candidateDepartureAt.toISOString(),
      ].join(":")
    : null;

  try {
    const observation = await insertArrivalObservation(
      {
        candidateDepartureAt: hasValidPredictionContext
          ? candidateDepartureAt
          : null,
        candidatePatternId: hasValidPredictionContext
          ? candidatePattern!.id
          : null,
        modelRevisionId: route.predictionRevisionId ?? route.datasetId,
        observedArrivalAt,
        projectionId,
        receivedAt,
        routeId: route.routeId,
        stopId: stop.stopId,
        stopOccurrenceId: stop.id,
        submittedAnonymously: true,
      },
      arrivalFeedbackRateLimitKey(request),
      receivedAt,
    );

    return NextResponse.json(
      { observationId: observation.id },
      { status: 201 },
    );
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "CAMPUS_BUS_FEEDBACK_RATE_LIMIT_EXCEEDED"
    ) {
      return NextResponse.json(
        { error: "RATE_LIMIT_EXCEEDED" },
        { status: 429, headers: { "Retry-After": "600" } },
      );
    }
    throw error;
  }
}
