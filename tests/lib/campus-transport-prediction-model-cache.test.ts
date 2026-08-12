import { afterEach, describe, expect, it, vi } from "vitest";

const { readChampionCampusBusRoutes } = vi.hoisted(() => ({
  readChampionCampusBusRoutes: vi.fn(),
}));

vi.mock("next/cache", () => ({
  unstable_cache: (reader: () => unknown) => reader,
}));

vi.mock("@/lib/campus-transport/prediction-model-store", () => ({
  getChampionCampusBusRoutes: readChampionCampusBusRoutes,
}));

import { getChampionCampusBusRoutes } from "@/lib/campus-transport/prediction-model-cache";
import { campusBusRoutes } from "@/lib/campus-transport/routes-data";

describe("campus bus passenger model rollout", () => {
  const originalFlag = process.env.CAMPUS_BUS_MODEL_OPERATIONS_ENABLED;

  afterEach(() => {
    if (originalFlag === undefined) {
      delete process.env.CAMPUS_BUS_MODEL_OPERATIONS_ENABLED;
    } else {
      process.env.CAMPUS_BUS_MODEL_OPERATIONS_ENABLED = originalFlag;
    }
    readChampionCampusBusRoutes.mockReset();
  });

  it("forces cold-start predictions while model operations are disabled", async () => {
    delete process.env.CAMPUS_BUS_MODEL_OPERATIONS_ENABLED;

    await expect(getChampionCampusBusRoutes()).resolves.toBe(campusBusRoutes);
    expect(readChampionCampusBusRoutes).not.toHaveBeenCalled();
  });

  it("reads the reviewed champion only after model operations are enabled", async () => {
    process.env.CAMPUS_BUS_MODEL_OPERATIONS_ENABLED = "true";
    const championRoutes = [campusBusRoutes[0]];
    readChampionCampusBusRoutes.mockResolvedValue(championRoutes);

    await expect(getChampionCampusBusRoutes()).resolves.toBe(championRoutes);
    expect(readChampionCampusBusRoutes).toHaveBeenCalledOnce();
  });
});
