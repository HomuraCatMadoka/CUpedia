import { describe, expect, it } from "vitest";
import {
  canonicalizeProviderOfferings,
  normalizeCanonicalDishName,
} from "@/lib/canteen-menu-canonicalization";
import type { MenuSyncItemInput } from "@/lib/canteen-types";

function offering(
  externalProductId: string,
  name: string,
  overrides: Partial<MenuSyncItemInput> = {},
): MenuSyncItemInput {
  return {
    externalProductId,
    name,
    priceOptions: [],
    mealPeriods: ["lunch"],
    sortOrder: 0,
    svgKey: "default",
    ...overrides,
  };
}

describe("canonical canteen dishes", () => {
  it("normalizes only width, outer/duplicate whitespace, and English case", () => {
    expect(normalizeCanonicalDishName("  ＡＢＣ   飯  ")).toBe("abc 飯");
    expect(normalizeCanonicalDishName("凍奶茶")).not.toBe(
      normalizeCanonicalDishName("熱奶茶"),
    );
    expect(normalizeCanonicalDishName("自選粉麵")).not.toBe(
      normalizeCanonicalDishName("自選粉麵（學生九折）"),
    );
    expect(normalizeCanonicalDishName("套餐-A")).not.toBe(
      normalizeCanonicalDishName("套餐 A"),
    );
    expect(normalizeCanonicalDishName("①號餐")).not.toBe(
      normalizeCanonicalDishName("1號餐"),
    );
    expect(normalizeCanonicalDishName("Α餐")).not.toBe(
      normalizeCanonicalDishName("α餐"),
    );
  });

  it("groups same-canteen provider IDs by normalized name regardless of price", () => {
    const [dish] = canonicalizeProviderOfferings([
      offering("pinme-1", " 芝士奶蓋可可 ", {
        mealPeriods: ["breakfast"],
        sortOrder: 4,
        svgKey: "早餐飲品",
        priceOptions: [
          { label: null, amountMinor: 2600, currency: "HKD", sortOrder: 0 },
        ],
      }),
      offering("pinme-2", "芝士奶蓋可可", {
        mealPeriods: ["dinner"],
        sortOrder: 9,
        svgKey: "晚市飲品",
        priceOptions: [
          { label: null, amountMinor: 2800, currency: "HKD", sortOrder: 0 },
        ],
      }),
    ]);

    expect(dish).toMatchObject({
      name: "芝士奶蓋可可",
      normalizedName: "芝士奶蓋可可",
      mealPeriods: ["breakfast", "dinner"],
      sortOrder: 4,
      svgKey: "早餐飲品",
    });
    expect(dish.offerings.map((item) => item.externalProductId)).toEqual([
      "pinme-1",
      "pinme-2",
    ]);
    expect(dish.priceOptions.map((price) => price.amountMinor)).toEqual([
      2600, 2800,
    ]);
  });

  it("deduplicates labelled prices but preserves labels and distinct unlabeled amounts", () => {
    const [dish] = canonicalizeProviderOfferings([
      offering("a", "奶茶", {
        priceOptions: [
          { label: "熱", amountMinor: 1200, currency: "HKD", sortOrder: 2 },
          { label: null, amountMinor: 1300, currency: "HKD", sortOrder: 0 },
        ],
      }),
      offering("b", "奶茶", {
        priceOptions: [
          { label: "熱", amountMinor: 1200, currency: "HKD", sortOrder: 0 },
          { label: null, amountMinor: 1400, currency: "HKD", sortOrder: 1 },
        ],
      }),
    ]);

    expect(dish.priceOptions).toEqual([
      { label: null, amountMinor: 1300, currency: "HKD", sortOrder: 0 },
      { label: null, amountMinor: 1400, currency: "HKD", sortOrder: 1 },
      { label: "熱", amountMinor: 1200, currency: "HKD", sortOrder: 2 },
    ]);
  });

  it("uses the earliest current provider occurrence for primary presentation", () => {
    const [dish] = canonicalizeProviderOfferings([
      offering("same-offering", "abc", {
        sortOrder: 99,
        svgKey: "aggregate",
        priceOptions: [],
        occurrences: [
          {
            mealPeriod: "dinner",
            categoryKey: "later",
            sortOrder: 8,
            priceOptions: [
              {
                label: null,
                amountMinor: 2800,
                currency: "HKD",
                sortOrder: 0,
              },
            ],
          },
          {
            mealPeriod: "lunch",
            categoryKey: "earlier",
            sortOrder: 1,
            priceOptions: [
              {
                label: null,
                amountMinor: 2500,
                currency: "HKD",
                sortOrder: 0,
              },
            ],
          },
        ],
      }),
    ]);

    expect(dish.name).toBe("abc");
    expect(dish.sortOrder).toBe(1);
    expect(dish.svgKey).toBe("earlier");
    expect(dish.priceOptions.map((option) => option.amountMinor)).toEqual([
      2500, 2800,
    ]);
  });

  it("collapses the observed PINME 5203 and mc-can exact-name pairs only", () => {
    const dishes = canonicalizeProviderOfferings([
      offering("5203-cocoa-a", "芝士奶蓋可可"),
      offering("5203-cocoa-b", "芝士奶蓋可可", {
        priceOptions: [
          { label: null, amountMinor: 3200, currency: "HKD", sortOrder: 0 },
        ],
      }),
      offering("5203-tea-a", "阿拉丁之茶"),
      offering("5203-tea-b", "阿拉丁之茶"),
      offering("mc-noodle-a", "自選粉麵"),
      offering("mc-noodle-b", "自選粉麵"),
      offering("mc-discount-a", "自選粉麵(所有學生/職員九折)"),
      offering("mc-discount-b", "自選粉麵(所有學生/職員九折)"),
    ]);

    expect(dishes).toHaveLength(4);
    expect(dishes.map((dish) => [dish.name, dish.offerings.length])).toEqual(
      expect.arrayContaining([
        ["芝士奶蓋可可", 2],
        ["阿拉丁之茶", 2],
        ["自選粉麵", 2],
        ["自選粉麵(所有學生/職員九折)", 2],
      ]),
    );
  });
});
