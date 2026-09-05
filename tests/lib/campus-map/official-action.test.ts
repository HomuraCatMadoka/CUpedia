import { describe, expect, it } from "vitest";

import { campusMapOfficialActionError } from "@/lib/campus-map/official-action";

describe("Campus Map official actions", () => {
  it.each(["\ud800", "x\ud800", "\ud800x", "\udc00"])(
    "rejects malformed Unicode %j in labels and URLs",
    (text) => {
      expect(
        campusMapOfficialActionError({
          label: text,
          url: "https://example.com",
        }),
      ).toBe("invalid-label");
      expect(
        campusMapOfficialActionError({
          label: "官网",
          url: `https://example.com/${text}`,
        }),
      ).toBe("invalid-url");
    },
  );

  it("accepts complete surrogate pairs", () => {
    expect(
      campusMapOfficialActionError({
        label: "官网 🏊",
        url: "https://example.com/🏊",
      }),
    ).toBeNull();
  });

  it.each([
    "https://www.cuhk.edu.hk/path",
    "tel:+85239437000",
    "mailto:help@example.edu.hk",
  ] as const)("accepts canonical %s destinations", (url) => {
    expect(campusMapOfficialActionError({ label: "官方入口", url })).toBeNull();
  });

  it("rejects surrounding whitespace before the database sees the URL", () => {
    expect(
      campusMapOfficialActionError({
        label: "官网",
        url: " https://www.cuhk.edu.hk/path ",
      }),
    ).toBe("invalid-url");
  });
});
