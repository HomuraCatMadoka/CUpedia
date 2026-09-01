import { describe, expect, it } from "vitest";

import {
  CAMPUS_MAP_CATEGORY_PEEK_RESULT_LIMIT,
  campusMapMobilePanelHeight,
} from "@/lib/campus-map/card-layout";

describe("Campus Map card layout policy", () => {
  it.each([
    [{ kind: "placing" } as const, "min(336px, 48dvh)"],
    [{ kind: "edit" } as const, "100dvh"],
    [{ kind: "provider-error" } as const, "var(--campus-map-peek-height)"],
    [{ kind: "provider-poi" } as const, "120px"],
    [{ kind: "empty-building" } as const, "208px"],
    [{ kind: "place" } as const, "min(264px, 35dvh)"],
    [{ kind: "building" } as const, "min(352px, 44dvh)"],
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

  it("derives a full Building sheet from its projected rows and groups", () => {
    expect(
      campusMapMobilePanelHeight({
        kind: "expanded",
        content: "building",
        resultCount: 2,
        groupCount: 2,
      }),
    ).toBe("min(460px, 62dvh)");
  });

  it("derives a full category sheet from its projected rows", () => {
    expect(
      campusMapMobilePanelHeight({
        kind: "expanded",
        content: "category",
        resultCount: 7,
      }),
    ).toBe("min(532px, 62dvh)");
  });
});
