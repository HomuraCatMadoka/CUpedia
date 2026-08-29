import { describe, expect, it } from "vitest";

import {
  CAMPUS_MAP_CATEGORY_PEEK_RESULT_LIMIT,
  campusMapMobilePanelHeight,
} from "@/lib/campus-map/card-layout";

describe("Campus Map card layout policy", () => {
  it.each([
    [{ kind: "placing" } as const, "min(336px, 48dvh)"],
    [{ kind: "edit" } as const, "var(--campus-map-edit-sheet-height)"],
    [{ kind: "expanded" } as const, "72dvh"],
    [{ kind: "provider-error" } as const, "var(--campus-map-peek-height)"],
    [{ kind: "provider-poi" } as const, "120px"],
    [{ kind: "empty-building" } as const, "136px"],
    [{ kind: "facility" } as const, "min(300px, 40dvh)"],
    [{ kind: "building" } as const, "min(340px, 42dvh)"],
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
        resultCount: CAMPUS_MAP_CATEGORY_PEEK_RESULT_LIMIT - 1,
      }),
    ).toBe("min(236px, 44dvh)");
  });

  it("caps a category preview that has more results than the visible limit", () => {
    expect(
      campusMapMobilePanelHeight({
        kind: "category",
        resultCount: CAMPUS_MAP_CATEGORY_PEEK_RESULT_LIMIT + 1,
      }),
    ).toBe("min(352px, 44dvh)");
  });
});
