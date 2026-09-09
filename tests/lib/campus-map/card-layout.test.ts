import { describe, expect, it } from "vitest";

import { campusMapMobilePanelHeight } from "@/lib/campus-map/card-layout";

describe("Campus Map card layout policy", () => {
  it.each([
    [
      { kind: "location-selection" } as const,
      "min(420px, calc(100dvh - 100px))",
    ],
    [{ kind: "placing" } as const, "min(336px, 48dvh)"],
    [{ kind: "edit" } as const, "100dvh"],
    [{ kind: "add" } as const, "min(640px, 82dvh)"],
    [{ kind: "feedback" } as const, "min(480px, 68dvh)"],
    [{ kind: "transient-hotspot" } as const, "min(184px, calc(100dvh - 80px))"],
    [{ kind: "empty-building" } as const, "208px"],
    [
      { kind: "empty-building", hasFloors: true } as const,
      "min(288px, calc(100dvh - 80px))",
    ],
    [{ kind: "place" } as const, "min(184px, 35dvh)"],
    [{ kind: "building" } as const, "min(352px, 53dvh)"],
    [{ kind: "default" } as const, "var(--campus-map-peek-height)"],
  ])("projects the %s panel height", (layout, expected) => {
    expect(campusMapMobilePanelHeight(layout)).toBe(expected);
  });

  it("grows a Place card only for content that is actually shown", () => {
    expect(
      campusMapMobilePanelHeight({ kind: "place", hasSummary: true }),
    ).toBe("min(252px, 35dvh)");
    expect(
      campusMapMobilePanelHeight({
        kind: "place",
        hasSummary: true,
        hasOfficialActions: true,
      }),
    ).toBe("min(308px, 35dvh)");
  });

  it("grows a short category preview with its visible rows", () => {
    expect(
      campusMapMobilePanelHeight({ kind: "category", resultCount: 0 }),
    ).toBe("min(208px, 44dvh)");
    expect(
      campusMapMobilePanelHeight({
        kind: "category",
        resultCount: 2,
      }),
    ).toBe("min(236px, 44dvh)");
  });

  it("caps a long category list so all rows remain scrollable", () => {
    expect(
      campusMapMobilePanelHeight({
        kind: "category",
        resultCount: 7,
      }),
    ).toBe("min(352px, 44dvh)");
  });
});
