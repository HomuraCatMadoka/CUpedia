import { describe, expect, it } from "vitest";

import { normalizeWikiIcon } from "@/lib/wiki-icon";

describe("normalizeWikiIcon", () => {
  it.each(["🐈", "🧑🏽‍💻", "👨‍👩‍👧‍👦", "🇭🇰", "1️⃣"])(
    "accepts one emoji grapheme: %s",
    (icon) => {
      expect(normalizeWikiIcon(icon)).toBe(icon);
    },
  );

  it("normalizes an empty value to no icon", () => {
    expect(normalizeWikiIcon(undefined)).toBeNull();
    expect(normalizeWikiIcon(null)).toBeNull();
    expect(normalizeWikiIcon("  ")).toBeNull();
  });

  it.each(["cat", "<img>", "🐈🐕", "A🐈", "a\u0301"])(
    "rejects non-emoji and multi-grapheme values: %s",
    (icon) => {
      expect(() => normalizeWikiIcon(icon)).toThrow("Invalid page icon");
    },
  );

  it("rejects unexpectedly long values", () => {
    expect(() => normalizeWikiIcon(`🐈${"\u200d".repeat(40)}`)).toThrow(
      "Invalid page icon",
    );
  });
});
