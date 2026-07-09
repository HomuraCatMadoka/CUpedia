import { describe, it, expect } from "vitest";
import { parseMenuItemsJson } from "@/lib/canteen-types";

describe("parseMenuItemsJson", () => {
  it("parses a JSON array of menu items", () => {
    const rows = parseMenuItemsJson(`[
      { "name": "宫保鸡丁", "price": 28, "mealPeriod": "lunch" },
      { "name": "皮蛋瘦肉粥", "price": 12, "mealPeriod": "breakfast", "sortOrder": 1 }
    ]`);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      name: "宫保鸡丁",
      price: 28,
      mealPeriod: "lunch",
      sortOrder: 0,
      svgKey: "default",
    });
    expect(rows[1].mealPeriod).toBe("breakfast");
  });

  it("accepts wrapped { items: [...] } shape", () => {
    const rows = parseMenuItemsJson({
      items: [{ name: "演示菜品", price: 10, mealPeriod: "dinner" }],
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe("演示菜品");
  });

  it("rejects invalid JSON strings", () => {
    expect(() => parseMenuItemsJson("{bad json")).toThrow("INVALID_JSON");
  });

  it("rejects empty arrays", () => {
    expect(() => parseMenuItemsJson("[]")).toThrow("EMPTY_MENU_JSON");
  });

  it("rejects invalid meal period", () => {
    expect(() =>
      parseMenuItemsJson([{ name: "菜", mealPeriod: "brunch" }]),
    ).toThrow("INVALID_MEAL_PERIOD");
  });
});
