import { describe, it, expect } from "vitest";
import {
  MEAL_PERIODS,
  compareMealPeriods,
  parseMealPeriod,
  validateCanteenName,
  validateLocation,
  validateMenuItemName,
  validatePrice,
  validateSortOrder,
  parseVote,
} from "@/lib/canteen-types";

describe("canteen-types", () => {
  it("re-exports MEAL_PERIODS for UI consumers", () => {
    expect(MEAL_PERIODS).toEqual(["breakfast", "lunch", "dinner"]);
  });

  it("compareMealPeriods orders breakfast before lunch before dinner", () => {
    expect(compareMealPeriods("breakfast", "lunch")).toBeLessThan(0);
    expect(compareMealPeriods("lunch", "dinner")).toBeLessThan(0);
    expect(compareMealPeriods("breakfast", "dinner")).toBeLessThan(0);
  });

  it("parseMealPeriod accepts valid periods", () => {
    expect(parseMealPeriod("breakfast")).toBe("breakfast");
    expect(parseMealPeriod("lunch")).toBe("lunch");
    expect(parseMealPeriod("dinner")).toBe("dinner");
    expect(parseMealPeriod("snack")).toBeNull();
  });

  it("validateCanteenName trims and rejects empty", () => {
    expect(validateCanteenName("  Union  ")).toBe("Union");
    expect(() => validateCanteenName("   ")).toThrow("INVALID_NAME");
  });

  it("validateLocation allows null", () => {
    expect(validateLocation(null)).toBeNull();
    expect(validateLocation("  SHB  ")).toBe("SHB");
  });

  it("validatePrice allows null and rejects negative", () => {
    expect(validatePrice(null)).toBeNull();
    expect(validatePrice(15)).toBe(15);
    expect(() => validatePrice(-1)).toThrow("INVALID_PRICE");
  });

  it("validateSortOrder defaults and bounds", () => {
    expect(validateSortOrder(undefined)).toBe(0);
    expect(validateSortOrder(10)).toBe(10);
    expect(() => validateSortOrder(-1)).toThrow("INVALID_SORT_ORDER");
  });

  it("validateMenuItemName delegates to canteen name", () => {
    expect(validateMenuItemName("叉烧饭")).toBe("叉烧饭");
  });

  it("parseVote accepts like, dislike, and cancel", () => {
    expect(parseVote("like")).toBe("like");
    expect(parseVote("dislike")).toBe("dislike");
    expect(parseVote(null)).toBeNull();
    expect(parseVote("")).toBeNull();
    expect(() => parseVote("maybe")).toThrow("INVALID_VOTE");
  });
});
