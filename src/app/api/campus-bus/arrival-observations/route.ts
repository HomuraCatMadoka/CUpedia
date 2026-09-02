import { NextRequest, NextResponse } from "next/server";

import { insertArrivalObservation } from "@/lib/campus-transport/arrival-observation-store";
import {
  getCampusBusScheduledArrivals,
  type CampusBusRoute,
  type CampusBusStop,
} from "@/lib/campus-transport/campus-bus";
import {
  CAMPUS_BUS_FEEDBACK_SESSION_COOKIE,
  getCampusBusFeedbackSession,
} from "@/lib/campus-transport/feedback-session";
import {
  campusBusRoutes,
  getCampusBusRoute,
  isRetiredCampusBusRouteId,
} from "@/lib/campus-transport/routes-data";
import { getChampionCampusBusRoute } from "@/lib/campus-transport/prediction-model-cache";

const MAX_PAST_MILLISECONDS = 15 * 60_000;
const MAX_FUTURE_MILLISECONDS = 2 * 60_000;
const MAX_CANDIDATE_LOOKAHEAD_MILLISECONDS = 60 * 60_000;

function objectValue(value: unknown): Record<string, unknown> | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function validatedCandidateContext(
  value: unknown,
  route: CampusBusRoute,
  stop: CampusBusStop,
  receivedAt: Date,
) {
  const context = objectValue(value);
  if (!context) return null;
  const patternRevisionId =
    typeof context.patternRevisionId === "string"
      ? context.patternRevisionId
      : "";
  const predictionModelRevisionId =
    typeof context.predictionModelRevisionId === "string"
      ? context.predictionModelRevisionId
      : "";
  const scheduledDepartureAt = new Date(
    typeof context.scheduledDepartureAt === "string"
      ? context.scheduledDepartureAt
      : NaN,
  );
  if (!patternRevisionId || !Number.isFinite(scheduledDepartureAt.getTime())) {
    return null;
  }

  const matchingArrival = getCampusBusScheduledArrivals(
    route,
    stop.id,
    scheduledDepartureAt.getTime(),
  ).find(
    (arrival) =>
      arrival.departureAt === scheduledDepartureAt.getTime() &&
      arrival.patternRevisionId === patternRevisionId,
  );
  const candidateLead = matchingArrival
    ? matchingArrival.arrivalAt - receivedAt.getTime()
    : Infinity;
  if (
    !matchingArrival ||
    candidateLead < -MAX_PAST_MILLISECONDS ||
    candidateLead > MAX_CANDIDATE_LOOKAHEAD_MILLISECONDS
  ) {
    return null;
  }

  const activeModelRevisionId =
    route.predictionRevisionId ?? route.seedModelRevisionId;
  return {
    candidatePatternRevisionId: patternRevisionId,
    candidateScheduledDepartureAt: scheduledDepartureAt,
    predictionModelRevisionId:
      predictionModelRevisionId === activeModelRevisionId
        ? predictionModelRevisionId
        : null,
  };
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
  if (isRetiredCampusBusRouteId(routeId)) {
    return NextResponse.json(
      {
        error: "ROUTE_CATALOG_STALE",
        message: "Route 1B retired on 2026-09-01; refresh the route catalog.",
        currentRouteCodes: campusBusRoutes.map((route) => route.code),
      },
      { status: 409 },
    );
  }
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

  const candidateContext = validatedCandidateContext(
    body.candidateContext,
    route,
    stop,
    receivedAt,
  );

  try {
    const feedbackSession = getCampusBusFeedbackSession(request);
    const observation = await insertArrivalObservation(
      {
        candidatePatternRevisionId:
          candidateContext?.candidatePatternRevisionId ?? null,
        candidateScheduledDepartureAt:
          candidateContext?.candidateScheduledDepartureAt ?? null,
        observedArrivalAt,
        predictionModelRevisionId:
          candidateContext?.predictionModelRevisionId ?? null,
        receivedAt,
        routeId: route.routeId,
        stopId: stop.stopId,
        stopOccurrenceId: stop.id,
        submittedAnonymously: true,
      },
      feedbackSession.sessionId,
      receivedAt,
    );

    const response = NextResponse.json(
      { observationId: observation.id },
      { status: 201 },
    );
    if (feedbackSession.cookie) {
      response.cookies.set(
        CAMPUS_BUS_FEEDBACK_SESSION_COOKIE,
        feedbackSession.cookie.value,
        {
          httpOnly: true,
          maxAge: feedbackSession.cookie.maxAge,
          path: "/",
          sameSite: "lax",
          secure: process.env.NODE_ENV === "production",
        },
      );
    }
    return response;
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
