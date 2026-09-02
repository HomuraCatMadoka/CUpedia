import { afterEach, describe, expect, it, vi } from "vitest";

const { cacheState, readChampionCampusBusRoutes } = vi.hoisted(() => ({
  cacheState: { legacyEntry: undefined as unknown },
  readChampionCampusBusRoutes: vi.fn(),
}));

vi.mock("next/cache", () => ({
  unstable_cache: (reader: () => unknown, keyParts?: string[]) => async () => {
    if (
      keyParts?.includes("campus-bus-champion-routes-v1") &&
      cacheState.legacyEntry
    ) {
      return cacheState.legacyEntry;
    }
    return reader();
  },
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
    cacheState.legacyEntry = undefined;
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

  it("does not reuse routes cached before the passenger shape changed", async () => {
    process.env.CAMPUS_BUS_MODEL_OPERATIONS_ENABLED = "true";
    const championRoutes = [campusBusRoutes[0]];
    cacheState.legacyEntry = [
      {
        ...campusBusRoutes[0],
        map: {
          attribution: "legacy route data",
          sourceUrl: "https://old.example/route",
        },
      },
    ];
    readChampionCampusBusRoutes.mockResolvedValue(championRoutes);

    await expect(getChampionCampusBusRoutes()).resolves.toBe(championRoutes);
    expect(readChampionCampusBusRoutes).toHaveBeenCalledOnce();
  });
});
