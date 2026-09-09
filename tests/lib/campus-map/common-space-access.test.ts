import { describe, expect, it } from "vitest";

import {
  composeCampusMapCommonSpaceVisitNote,
  parseCampusMapCommonSpaceVisitNote,
  removeCampusMapCommonSpaceAccessFromVisitNote,
} from "@/lib/campus-map/common-space-access";

describe("Campus Map common-space access note", () => {
  it("combines a card requirement with a useful location hint", () => {
    expect(
      composeCampusMapCommonSpaceVisitNote("campus-card", "五楼东翼"),
    ).toBe("需要拍校园卡进入；五楼东翼");
    expect(
      parseCampusMapCommonSpaceVisitNote("需要拍校园卡进入；五楼东翼"),
    ).toEqual({ access: "campus-card", note: "五楼东翼" });
  });

  it("preserves an existing free-text location when no access is recorded", () => {
    expect(parseCampusMapCommonSpaceVisitNote("电梯旁")).toEqual({
      access: null,
      note: "电梯旁",
    });
    expect(composeCampusMapCommonSpaceVisitNote("no-card", "")).toBe(
      "无需拍校园卡",
    );
  });

  it("removes only the generated access phrase when the place type changes", () => {
    expect(
      removeCampusMapCommonSpaceAccessFromVisitNote(
        "需要拍校园卡进入；五楼东翼",
      ),
    ).toBe("五楼东翼");
    expect(removeCampusMapCommonSpaceAccessFromVisitNote("无需拍校园卡")).toBe(
      null,
    );
  });
});
