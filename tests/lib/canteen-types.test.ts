import { describe, it, expect } from "vitest";
import {
  MEAL_PERIODS,
  compareMealPeriods,
  parseMealPeriod,
  validateCanteenName,
  validateLocation,
  validateMenuItemName,
  validatePrice,
  validatePricingInput,
  parseMenuItemsJson,
  validateSortOrder,
  parseVote,
  validateMenuImportDraftItems,
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

  it("maps a legacy whole-dollar price to one HKD option", () => {
    expect(validatePricingInput(undefined, 13)).toEqual([
      {
        label: null,
        amountMinor: 1300,
        currency: "HKD",
        sortOrder: 0,
      },
    ]);
  });

  it("validates labelled price options without knowing their labels", () => {
    expect(
      validatePricingInput({
        options: [
          { label: "熱 8oz", amountMinor: 2100, currency: "hkd" },
          { label: "凍 12oz", amountMinor: 2700, currency: "HKD" },
        ],
      }),
    ).toEqual([
      {
        label: "熱 8oz",
        amountMinor: 2100,
        currency: "HKD",
        sortOrder: 0,
      },
      {
        label: "凍 12oz",
        amountMinor: 2700,
        currency: "HKD",
        sortOrder: 1,
      },
    ]);
  });

  it("rejects fractional minor units and malformed currencies", () => {
    expect(() =>
      validatePricingInput({ options: [{ amountMinor: 12.5 }] }),
    ).toThrow("INVALID_PRICE_AMOUNT");
    expect(() =>
      validatePricingInput({ options: [{ amountMinor: "" }] }),
    ).toThrow("INVALID_PRICE_AMOUNT");
    expect(() =>
      validatePricingInput({
        options: [{ amountMinor: 1200, currency: "HKDollars" }],
      }),
    ).toThrow("INVALID_CURRENCY");
  });

  it("parses a SHHO-style hot and iced menu item", () => {
    const [item] = parseMenuItemsJson([
      {
        name: "美式咖啡",
        pricing: {
          options: [
            { label: "熱 8oz", amountMinor: 2100 },
            { label: "熱 12oz", amountMinor: 2700 },
            { label: "凍 12oz", amountMinor: 2700 },
            { label: "凍 16oz", amountMinor: 2900 },
          ],
        },
        mealPeriod: "lunch",
      },
    ]);
    expect(
      item.priceOptions.map(({ label, amountMinor }) => [label, amountMinor]),
    ).toEqual([
      ["熱 8oz", 2100],
      ["熱 12oz", 2700],
      ["凍 12oz", 2700],
      ["凍 16oz", 2900],
    ]);
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

  it("validateMenuImportDraftItems rejects invalid shapes", () => {
    expect(() => validateMenuImportDraftItems(null)).toThrow(
      "INVALID_DRAFT_ITEMS",
    );
    expect(() => validateMenuImportDraftItems([{ name: "" }])).toThrow(
      "INVALID_NAME",
    );
    expect(() =>
      validateMenuImportDraftItems([
        {
          tempId: "a",
          name: "饭",
          price: -1,
          mealPeriod: "lunch",
          sortOrder: 0,
        },
      ]),
    ).toThrow("INVALID_PRICE");
    expect(() =>
      validateMenuImportDraftItems([
        {
          tempId: "a",
          name: "饭",
          price: 10,
          mealPeriod: "snack",
          sortOrder: 0,
        },
      ]),
    ).toThrow("INVALID_MEAL_PERIOD");
    expect(() =>
      validateMenuImportDraftItems([
        {
          tempId: "a",
          name: "饭",
          price: 10,
          mealPeriod: "lunch",
          sortOrder: -1,
        },
      ]),
    ).toThrow("INVALID_SORT_ORDER");
  });

  it("validateMenuImportDraftItems normalizes rows", () => {
    const items = validateMenuImportDraftItems([
      { name: "  叉烧饭  ", price: 18, mealPeriod: "dinner" },
    ]);
    expect(items).toHaveLength(1);
    expect(items[0].name).toBe("叉烧饭");
    expect(items[0].mealPeriod).toBe("dinner");
    expect(items[0].tempId).toBe("draft-0");
  });
});
