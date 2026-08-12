import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { rebuildMock } = vi.hoisted(() => ({ rebuildMock: vi.fn() }));

const { revalidateTagMock } = vi.hoisted(() => ({
  revalidateTagMock: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidateTag: revalidateTagMock }));

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

  beforeEach(() => {
    process.env.CRON_SECRET = "test-cron-secret";
    rebuildMock.mockReset();
    revalidateTagMock.mockReset();
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
    process.env.CRON_SECRET = previousSecret;
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

  it("expires the passenger cache after promoting a champion", async () => {
    rebuildMock.mockResolvedValueOnce({
      adjustmentCount: 2,
      eventCount: 12,
      modelRevisionId: "revision-2",
      observationCount: 14,
      promoted: true,
      status: "champion",
    });

    const response = await GET(request("test-cron-secret"));
    expect(response.status).toBe(200);
    expect(revalidateTagMock).toHaveBeenCalledWith("campus-bus-model", {
      expire: 0,
    });
  });
});
