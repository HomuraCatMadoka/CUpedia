import { describe, it, expect } from "vitest";
import { DISH_SVG_KEYS, resolveDishSvgKey } from "@/lib/canteen-svg-keys";
import { validateSvgKey } from "@/lib/canteen-types";

describe("dish svg keys", () => {
  it("exposes category keys for menu list icons", () => {
    expect(DISH_SVG_KEYS).toEqual(
      expect.arrayContaining(["default", "rice", "bowl", "spicy", "noodle", "drink", "dessert"]),
    );
  });

  it("validateSvgKey accepts known keys and falls back for unknown", () => {
    expect(validateSvgKey("rice")).toBe("rice");
    expect(validateSvgKey("noodle")).toBe("noodle");
    expect(validateSvgKey("unknown-category")).toBe("default");
    expect(validateSvgKey("")).toBe("default");
  });

  it("resolveDishSvgKey maps unknown keys to default path key", () => {
    expect(resolveDishSvgKey("spicy")).toBe("spicy");
    expect(resolveDishSvgKey("not-a-key")).toBe("default");
  });
});
