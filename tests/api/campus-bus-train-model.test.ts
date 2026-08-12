import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { rebuildMock } = vi.hoisted(() => ({ rebuildMock: vi.fn() }));

vi.mock("@/lib/campus-transport/prediction-model-store", () => ({
  rebuildCampusBusPredictionModel: rebuildMock,
}));

import { GET } from "@/app/api/internal/campus-bus/train-model/route";

function request(token?: string) {
  return new NextRequest(
    "http://localhost/api/internal/campus-bus/train-model",
    {
      headers: token ? { authorization: `Bearer ${token}` } : {},
    },
  );
}

describe("GET /api/internal/campus-bus/train-model", () => {
  const previousSecret = process.env.CRON_SECRET;
  const previousFlag = process.env.CAMPUS_BUS_MODEL_OPERATIONS_ENABLED;

  beforeEach(() => {
    process.env.CAMPUS_BUS_MODEL_OPERATIONS_ENABLED = "true";
    process.env.CRON_SECRET = "test-cron-secret";
    rebuildMock.mockReset();
    rebuildMock.mockResolvedValue({
      adjustmentCount: 0,
      eventCount: 0,
      modelRevisionId: "revision-1",
      observationCount: 0,
      promoted: false,
      status: "insufficient",
    });
  });

  afterEach(() => {
    if (previousSecret === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = previousSecret;
    if (previousFlag === undefined) {
      delete process.env.CAMPUS_BUS_MODEL_OPERATIONS_ENABLED;
    } else {
      process.env.CAMPUS_BUS_MODEL_OPERATIONS_ENABLED = previousFlag;
    }
  });

  it("stays unavailable during feedback-only rollout", async () => {
    delete process.env.CAMPUS_BUS_MODEL_OPERATIONS_ENABLED;
    const response = await GET(request("test-cron-secret"));
    expect(response.status).toBe(404);
    expect(rebuildMock).not.toHaveBeenCalled();
  });

  it("rejects requests without the deployment cron secret", async () => {
    const response = await GET(request());
    expect(response.status).toBe(401);
    expect(rebuildMock).not.toHaveBeenCalled();
  });

  it("runs one model revision for an authorized cron request", async () => {
    const response = await GET(request("test-cron-secret"));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      modelRevisionId: "revision-1",
      status: "insufficient",
    });
    expect(rebuildMock).toHaveBeenCalledOnce();
  });

  it("stores an eligible daily run as a candidate without promoting it", async () => {
    rebuildMock.mockResolvedValueOnce({
      adjustmentCount: 2,
      eventCount: 12,
      modelRevisionId: "revision-2",
      observationCount: 14,
      promoted: false,
      status: "candidate",
    });

    const response = await GET(request("test-cron-secret"));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      promoted: false,
      status: "candidate",
    });
  });
});
