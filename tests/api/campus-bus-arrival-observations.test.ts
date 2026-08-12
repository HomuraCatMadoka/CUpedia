import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { feedbackSessionMock, insertArrivalObservationMock } = vi.hoisted(() => {
  return {
    feedbackSessionMock: vi.fn(),
    insertArrivalObservationMock: vi.fn(),
  };
});

vi.mock("@/lib/campus-transport/arrival-observation-store", () => ({
  insertArrivalObservation: insertArrivalObservationMock,
}));
vi.mock("@/lib/campus-transport/feedback-session", () => ({
  CAMPUS_BUS_FEEDBACK_SESSION_COOKIE: "campus_bus_feedback_session",
  getCampusBusFeedbackSession: feedbackSessionMock,
}));

vi.mock("@/lib/campus-transport/prediction-model-cache", async () => {
  const routes = await import("@/lib/campus-transport/routes-data");
  return {
    getChampionCampusBusRoute: vi.fn(async (routeId: string) =>
      routes.getCampusBusRoute(routeId),
    ),
  };
});

import { POST } from "@/app/api/campus-bus/arrival-observations/route";
const NOW = new Date("2026-08-10T00:10:00.000Z");

function request(body: unknown) {
  return new NextRequest(
    "http://localhost/api/campus-bus/arrival-observations",
    {
      body: JSON.stringify(body),
      headers: { "content-type": "application/json" },
      method: "POST",
    },
  );
}

describe("POST /api/campus-bus/arrival-observations", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    insertArrivalObservationMock.mockReset();
    insertArrivalObservationMock.mockResolvedValue({
      id: "11111111-1111-4111-8111-111111111111",
    });
    feedbackSessionMock.mockReturnValue({
      cookie: null,
      sessionId: "22222222-2222-4222-8222-222222222222",
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("stores a valid anonymous arrival observation", async () => {
    const response = await POST(
      request({
        observedArrivalAt: "2026-08-10T00:09:00.000Z",
        routeId: "2",
        stopOccurrenceId: "cuhk-wp-stop-2550#1",
      }),
    );

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({
      observationId: "11111111-1111-4111-8111-111111111111",
    });
    expect(insertArrivalObservationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        observedArrivalAt: new Date("2026-08-10T00:09:00.000Z"),
        routeId: "2",
        stopId: "cuhk-wp-stop-2550",
        stopOccurrenceId: "cuhk-wp-stop-2550#1",
        submittedAnonymously: true,
      }),
      "22222222-2222-4222-8222-222222222222",
      NOW,
    );
  });

  it("ignores client fields beyond route, stop, and arrival time", async () => {
    const response = await POST(
      request({
        observedArrivalAt: "2026-08-10T00:09:00.000Z",
        predictionContext: { patternId: "2:default" },
        routeId: "2",
        stopOccurrenceId: "cuhk-wp-stop-2550#1",
      }),
    );

    expect(response.status).toBe(201);
    expect(insertArrivalObservationMock).toHaveBeenCalledWith(
      {
        observedArrivalAt: new Date("2026-08-10T00:09:00.000Z"),
        receivedAt: NOW,
        routeId: "2",
        stopId: "cuhk-wp-stop-2550",
        stopOccurrenceId: "cuhk-wp-stop-2550#1",
        submittedAnonymously: true,
      },
      "22222222-2222-4222-8222-222222222222",
      NOW,
    );
  });

  it("sets a signed anonymous session cookie on the first submission", async () => {
    feedbackSessionMock.mockReturnValueOnce({
      cookie: { maxAge: 3600, value: "signed-cookie" },
      sessionId: "22222222-2222-4222-8222-222222222222",
    });

    const response = await POST(
      request({
        observedArrivalAt: "2026-08-10T00:09:00.000Z",
        routeId: "2",
        stopOccurrenceId: "cuhk-wp-stop-2550#1",
      }),
    );

    expect(response.status).toBe(201);
    expect(response.headers.get("set-cookie")).toContain(
      "campus_bus_feedback_session=signed-cookie",
    );
  });

  it("rejects an unknown route occurrence without writing", async () => {
    const response = await POST(
      request({
        observedArrivalAt: "2026-08-10T00:09:00.000Z",
        routeId: "2",
        stopOccurrenceId: "missing-stop#1",
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "INVALID_STOP",
    });
    expect(insertArrivalObservationMock).not.toHaveBeenCalled();
  });

  it("rejects an arrival time outside the adjustment window", async () => {
    const response = await POST(
      request({
        observedArrivalAt: "2026-08-09T23:49:00.000Z",
        routeId: "2",
        stopOccurrenceId: "cuhk-wp-stop-2550#1",
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "INVALID_ARRIVAL_TIME",
    });
    expect(insertArrivalObservationMock).not.toHaveBeenCalled();
  });

  it("returns 429 with a retry window when anonymous feedback is throttled", async () => {
    insertArrivalObservationMock.mockRejectedValueOnce(
      new Error("CAMPUS_BUS_FEEDBACK_RATE_LIMIT_EXCEEDED"),
    );

    const response = await POST(
      request({
        observedArrivalAt: "2026-08-10T00:09:00.000Z",
        routeId: "2",
        stopOccurrenceId: "cuhk-wp-stop-2550#1",
      }),
    );

    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("600");
    await expect(response.json()).resolves.toEqual({
      error: "RATE_LIMIT_EXCEEDED",
    });
  });
});
