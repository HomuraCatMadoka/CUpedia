import { describe, expect, it } from "vitest";

import {
  campusMapMobilePanelHeight,
  campusMapNearestBrowseSheetSnap,
} from "@/lib/campus-map/card-layout";

describe("Campus Map card layout policy", () => {
  it("snaps a long card to summary, half and near-full heights", () => {
    expect(campusMapNearestBrowseSheetSnap(365, 1000, 240, 844)).toBe("peek");
    expect(campusMapNearestBrowseSheetSnap(470, 1000, 240, 844)).toBe("half");
    expect(campusMapNearestBrowseSheetSnap(750, 1000, 240, 844)).toBe("full");
  });
  it("keeps a short card at its content height and accommodates a taller header", () => {
    expect(campusMapNearestBrowseSheetSnap(250, 250, 150, 844)).toBe("peek");
    expect(campusMapNearestBrowseSheetSnap(420, 900, 420, 844)).toBe("peek");
  });
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
    [{ kind: "default" } as const, "var(--campus-map-peek-height)"],
  ])("projects the %s panel height", (layout, expected) => {
    expect(campusMapMobilePanelHeight(layout)).toBe(expected);
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
