import { describe, it, expect } from "vitest";
import type { CanteenMenuItem, MenuItemVoteCounts } from "@/lib/canteen-types";
import {
  filterItemsByMealPeriod,
  rankAvoidDishes,
  rankRecommendDishes,
} from "@/lib/canteen-rankings";

function item(
  id: string,
  mealPeriod: CanteenMenuItem["mealPeriod"],
  name = id,
): CanteenMenuItem {
  const t = new Date();
  return {
    id,
    canteenId: "c1",
    name,
    pricing: null,
    mealPeriod,
    sortOrder: 0,
    svgKey: "default",
    createdAt: t,
    updatedAt: t,
  };
}

describe("filterItemsByMealPeriod", () => {
  const items = [
    item("a", "breakfast"),
    item("b", "lunch"),
    item("c", "dinner"),
    item("d", "lunch"),
  ];

  it("returns only items matching the selected period", () => {
    expect(filterItemsByMealPeriod(items, "lunch").map((i) => i.id)).toEqual([
      "b",
      "d",
    ]);
  });
});

describe("rankRecommendDishes", () => {
  const lunchItems = [
    item("low", "lunch"),
    item("top", "lunch"),
    item("tie-a", "lunch"),
    item("tie-b", "lunch"),
  ];
  const counts: Record<string, MenuItemVoteCounts> = {
    low: { likes: 1, dislikes: 0 },
    top: { likes: 5, dislikes: 1 },
    "tie-a": { likes: 3, dislikes: 1 },
    "tie-b": { likes: 3, dislikes: 3 },
  };

  it("sorts by likes desc, then like-minus-dislike desc", () => {
    const ranked = rankRecommendDishes(lunchItems, counts);
    expect(ranked.map((r) => r.item.id)).toEqual([
      "top",
      "tie-a",
      "tie-b",
      "low",
    ]);
  });

  it("treats missing counts as zero votes", () => {
    const ranked = rankRecommendDishes([item("x", "lunch")], {});
    expect(ranked[0].counts).toEqual({ likes: 0, dislikes: 0 });
  });
});

describe("rankAvoidDishes", () => {
  const lunchItems = [
    item("mild", "lunch"),
    item("worst", "lunch"),
    item("tie-a", "lunch"),
    item("tie-b", "lunch"),
  ];
  const counts: Record<string, MenuItemVoteCounts> = {
    mild: { likes: 2, dislikes: 1 },
    worst: { likes: 0, dislikes: 6 },
    "tie-a": { likes: 1, dislikes: 4 },
    "tie-b": { likes: 3, dislikes: 4 },
  };

  it("sorts by dislikes desc, then dislike-minus-like desc", () => {
    const ranked = rankAvoidDishes(lunchItems, counts);
    expect(ranked.map((r) => r.item.id)).toEqual([
      "worst",
      "tie-a",
      "tie-b",
      "mild",
    ]);
  });
});
