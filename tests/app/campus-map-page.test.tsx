import { isValidElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  loadProjection: vi.fn(),
  getFactSchema: vi.fn(),
  redirect: vi.fn(),
}));

vi.mock("@/lib/auth-guard", () => ({ requireAuth: mocks.requireAuth }));
vi.mock("@/lib/campus-map/browse-actions", () => ({
  loadCampusMapBrowseProjection: mocks.loadProjection,
}));
vi.mock("@/lib/campus-map/fact-store", () => ({
  getCampusMapFactSchema: mocks.getFactSchema,
}));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));

import CampusMapPage from "@/app/(main)/campus-map/page";
import CampusMapPrototypePage from "@/app/(main)/prototype/campus-map/page";
import { CampusMapRuntime } from "@/components/campus-map/campus-map-runtime";
import { EMPTY_CAMPUS_MAP_BROWSE_PROJECTION } from "@/lib/campus-map/browse-projection";

describe("formal Campus Map route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.loadProjection.mockResolvedValue(EMPTY_CAMPUS_MAP_BROWSE_PROJECTION);
    mocks.getFactSchema.mockResolvedValue(null);
  });

  it("authenticates and renders the canonical runtime at a refreshable URL", async () => {
    const element = await CampusMapPage({
      searchParams: Promise.resolve({
        v: "1",
        scene: "facility",
        id: "place-1",
        snap: "peek",
      }),
    });

    expect(mocks.requireAuth).toHaveBeenCalledWith(
      "/campus-map?v=1&scene=facility&id=place-1&snap=peek",
    );
    expect(isValidElement(element)).toBe(true);
    expect(element.type).toBe(CampusMapRuntime);
    expect(element.props.initialSearch).toBe(
      "v=1&scene=facility&id=place-1&snap=peek",
    );
  });

  it("does not disguise an initial projection failure as an empty map", async () => {
    mocks.loadProjection.mockRejectedValueOnce(
      new Error("CAMPUS_MAP_PROJECTION_UNAVAILABLE"),
    );

    await expect(
      CampusMapPage({ searchParams: Promise.resolve({ v: "1" }) }),
    ).rejects.toThrow("CAMPUS_MAP_PROJECTION_UNAVAILABLE");
  });

  it("does not disguise an initial fact-schema failure as an absent schema", async () => {
    mocks.getFactSchema.mockRejectedValueOnce(
      new Error("CAMPUS_MAP_SCHEMA_UNAVAILABLE"),
    );

    await expect(
      CampusMapPage({ searchParams: Promise.resolve({ v: "1" }) }),
    ).rejects.toThrow("CAMPUS_MAP_SCHEMA_UNAVAILABLE");
  });

  it("redirects the old product URL to the canonical runtime without owning state", async () => {
    await CampusMapPrototypePage({
      searchParams: Promise.resolve({ v: "1", scene: "building", id: "b-1" }),
    });

    expect(mocks.redirect).toHaveBeenCalledWith(
      "/campus-map?v=1&scene=building&id=b-1",
    );
    expect(mocks.requireAuth).not.toHaveBeenCalled();
    expect(mocks.loadProjection).not.toHaveBeenCalled();
  });
});
