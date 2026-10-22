import { describe, expect, it } from "vitest";
import { campusMapPlaceName } from "@/lib/campus-map/place-name";

describe("campus map display names", () => {
  it.each([
    [
      "PSC 303 Multi-purpose Room（多用途室）",
      "PSC 303 多用途室",
      "PSC 303 Multi-purpose Room",
    ],
    [
      "BFC G/F Exhibition Area (Areas A–B)（展览区（A–B 区））",
      "BFC G/F 展览区（A–B 区）",
      "BFC G/F Exhibition Area (Areas A–B)",
    ],
    [
      "BFC LG13A/LG13B Conference Hall / Rehearsal Room（会议厅／排练室）",
      "BFC LG13A/LG13B 会议厅／排练室",
      "BFC LG13A/LG13B Conference Hall / Rehearsal Room",
    ],
    ["i-LOUNGE（休闲空间）", "i-LOUNGE 休闲空间", "i-LOUNGE"],
  ])(
    "keeps location identifiers while separating the translation of %s",
    (name, primary, secondary) => {
      expect(campusMapPlaceName(name)).toEqual({ primary, secondary });
    },
  );

  it.each([
    "YIA 201",
    "门诊（Outpatient Service）",
    "图书馆（入口）",
    "Science Centre",
    "PSC 303（维修中",
  ])("preserves names without a recognized bilingual suffix: %s", (name) => {
    expect(campusMapPlaceName(name)).toEqual({
      primary: name,
      secondary: null,
    });
  });
});
