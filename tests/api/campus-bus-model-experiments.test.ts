import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { currentUserMock, runExperimentMock } = vi.hoisted(() => ({
  currentUserMock: vi.fn(),
  runExperimentMock: vi.fn(),
}));

vi.mock("@/lib/auth-guard", () => ({
  getAuthenticatedUserForApi: currentUserMock,
}));
vi.mock("@/lib/campus-transport/model-experiment-store", () => ({
  runModelExperiment: runExperimentMock,
}));

import { POST } from "@/app/api/campus-bus/model-experiments/route";
import { modelExperimentDefaults } from "@/lib/campus-transport/model-experiment";

function request(body: unknown) {
  return new NextRequest("http://localhost/api/campus-bus/model-experiments", {
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
}

describe("POST /api/campus-bus/model-experiments", () => {
  beforeEach(() => {
    currentUserMock.mockReset();
    runExperimentMock.mockReset();
    currentUserMock.mockResolvedValue({ id: "user-1", role: "user" });
    runExperimentMock.mockResolvedValue({ id: "experiment-1" });
  });

  it("requires a signed-in contributor", async () => {
    currentUserMock.mockResolvedValueOnce(null);
    const response = await POST(request(modelExperimentDefaults));
    expect(response.status).toBe(401);
    expect(runExperimentMock).not.toHaveBeenCalled();
  });

  it("runs a validated experiment without exposing database access", async () => {
    const response = await POST(request(modelExperimentDefaults));
    expect(response.status).toBe(201);
    expect(runExperimentMock).toHaveBeenCalledWith(
      "user-1",
      expect.objectContaining({ routeId: null, trainingWindowDays: 28 }),
    );
  });

  it("maps the per-user cooldown to 429", async () => {
    runExperimentMock.mockRejectedValueOnce(
      new Error("MODEL_EXPERIMENT_RATE_LIMIT_EXCEEDED"),
    );
    const response = await POST(request(modelExperimentDefaults));
    expect(response.status).toBe(429);
  });
});
