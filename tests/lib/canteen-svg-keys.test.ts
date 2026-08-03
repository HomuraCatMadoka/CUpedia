import { describe, it, expect } from "vitest";
import {
  DISH_SVG_KEYS,
  collapseSectionKeyWhitespace,
  inferDishSvgKeyFromName,
  resolveDishIconKey,
  resolveDishSvgKey,
  resolveMenuSectionKey,
  resolveStoredSectionKey,
  SVG_KEY_MAX_LENGTH,
} from "@/lib/canteen-svg-keys";
import { validateSvgKey } from "@/lib/canteen-types";

describe("dish svg keys", () => {
  it("exposes category keys for menu list icons", () => {
    expect(DISH_SVG_KEYS).toEqual(
      expect.arrayContaining([
        "default",
        "rice",
        "bowl",
        "noodle",
        "drink",
        "dessert",
      ]),
    );
    expect(DISH_SVG_KEYS).not.toContain("spicy");
  });

  it("validateSvgKey keeps freeform section keys and rejects empty/overlong", () => {
    expect(validateSvgKey("rice")).toBe("rice");
    expect(validateSvgKey("noodle")).toBe("noodle");
    expect(validateSvgKey("飯類")).toBe("飯類");
    expect(validateSvgKey("  每日精选  ")).toBe("每日精选");
    expect(validateSvgKey("unknown-category")).toBe("unknown-category");
    expect(validateSvgKey("")).toBe("default");
    expect(validateSvgKey("x".repeat(SVG_KEY_MAX_LENGTH + 1))).toBe("default");
  });

  it("shares whitespace collapse between validateSvgKey and normalize helpers", () => {
    expect(collapseSectionKeyWhitespace("  a   b  ")).toBe("a b");
    expect(resolveStoredSectionKey("   ")).toBe("default");
    expect(resolveStoredSectionKey("  飯類  ")).toBe("飯類");
    expect(validateSvgKey("  a   b  ")).toBe("a b");
  });

  it("resolveMenuSectionKey prefers store category over name inference", () => {
    expect(
      resolveMenuSectionKey({ categoryName: "飯類", dishName: "可樂" }),
    ).toBe("飯類");
    expect(
      resolveMenuSectionKey({ categoryName: "  粉麵  ", dishName: "鸡饭" }),
    ).toBe("粉麵");
    expect(
      resolveMenuSectionKey({ categoryName: null, dishName: "演示奶茶" }),
    ).toBe("drink");
    expect(resolveMenuSectionKey({ dishName: "演示菜品" })).toBe("default");
  });

  it("resolveDishIconKey maps known English and Chinese category names", () => {
    expect(resolveDishIconKey("bowl")).toBe("bowl");
    expect(resolveDishIconKey("飯類")).toBe("rice");
    expect(resolveDishIconKey("飲品")).toBe("drink");
    expect(resolveDishIconKey("每日精选")).toBe("default");
    expect(resolveDishSvgKey("spicy")).toBe("default");
  });

  it("inferDishSvgKeyFromName classifies by dish name keywords", () => {
    expect(inferDishSvgKeyFromName("演示飯類")).toBe("rice");
    expect(inferDishSvgKeyFromName("演示菜品")).toBe("default");
    expect(inferDishSvgKeyFromName("演示麵類")).toBe("noodle");
    expect(inferDishSvgKeyFromName("演示奶茶")).toBe("drink");
    expect(inferDishSvgKeyFromName("演示咖啡")).toBe("drink");
  });
});
