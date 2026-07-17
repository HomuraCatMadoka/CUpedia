import { describe, it, expect } from "vitest";
import { DISH_SVG_KEYS, inferDishSvgKeyFromName, resolveDishSvgKey } from "@/lib/canteen-svg-keys";
import { validateSvgKey } from "@/lib/canteen-types";

describe("dish svg keys", () => {
  it("exposes category keys for menu list icons", () => {
    expect(DISH_SVG_KEYS).toEqual(
      expect.arrayContaining(["default", "rice", "bowl", "noodle", "drink", "dessert"]),
    );
    expect(DISH_SVG_KEYS).not.toContain("spicy");
  });

  it("validateSvgKey accepts known keys and falls back for unknown", () => {
    expect(validateSvgKey("rice")).toBe("rice");
    expect(validateSvgKey("noodle")).toBe("noodle");
    expect(validateSvgKey("unknown-category")).toBe("default");
    expect(validateSvgKey("")).toBe("default");
  });

  it("resolveDishSvgKey maps unknown keys to default path key", () => {
    expect(resolveDishSvgKey("bowl")).toBe("bowl");
    expect(resolveDishSvgKey("spicy")).toBe("default");
    expect(resolveDishSvgKey("not-a-key")).toBe("default");
  });

  it("inferDishSvgKeyFromName classifies by dish name keywords", () => {
    expect(inferDishSvgKeyFromName("麻辣雞飯")).toBe("rice");
    expect(inferDishSvgKeyFromName("咖喱魚蛋")).toBe("default");
    expect(inferDishSvgKeyFromName("牛肉麵")).toBe("noodle");
  });
});
