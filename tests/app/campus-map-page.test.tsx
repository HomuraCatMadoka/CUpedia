import { isValidElement } from "react";
import { renderToString } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  loadProjection: vi.fn(),
  loadProviderPoiCard: vi.fn(),
  getFactSchema: vi.fn(),
  redirect: vi.fn(),
}));

vi.mock("@/lib/auth-guard", () => ({ requireAuth: mocks.requireAuth }));
vi.mock("@/lib/campus-map/browse-actions", () => ({
  loadCampusMapBrowseProjection: mocks.loadProjection,
  loadCampusMapAmapPoiCard: mocks.loadProviderPoiCard,
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

  it("requires authentication before rendering the provider-backed canonical runtime", async () => {
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

  it("does not render the server-only AMap security code into HTML", async () => {
    const previous = process.env.AMAP_SECURITY_JS_CODE;
    process.env.AMAP_SECURITY_JS_CODE = "server-only-html-leak-sentinel";
    try {
      const element = await CampusMapPage({
        searchParams: Promise.resolve({ v: "1" }),
      });
      const html = renderToString(element);

      expect(html).not.toContain("server-only-html-leak-sentinel");
      expect(html).not.toContain("securityJsCode");
    } finally {
      if (previous === undefined) delete process.env.AMAP_SECURITY_JS_CODE;
      else process.env.AMAP_SECURITY_JS_CODE = previous;
    }
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
