import { describe, it, expect } from "vitest";
import { parseOcrTextToDraftItems } from "@/lib/canteen-menu-parser";

describe("parseOcrTextToDraftItems", () => {
  it("parses lines with trailing yuan price", () => {
    const items = parseOcrTextToDraftItems(
      "宫保鸡丁 28元\n麻婆豆腐 22\n红烧肉 HK$35",
    );
    expect(items).toHaveLength(3);
    expect(items[0]).toMatchObject({ name: "宫保鸡丁", price: 28, sortOrder: 0 });
    expect(items[1]).toMatchObject({ name: "麻婆豆腐", price: 22, sortOrder: 1 });
    expect(items[2]).toMatchObject({ name: "红烧肉", price: 35, sortOrder: 2 });
    expect(items[0].mealPeriod).toBe("lunch");
    expect(items[0].tempId).toBeTruthy();
  });

  it("keeps name-only lines with null price for manual fill", () => {
    const items = parseOcrTextToDraftItems("清蒸鱼\n时蔬");
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({ name: "清蒸鱼", price: null });
    expect(items[1]).toMatchObject({ name: "时蔬", price: null });
  });

  it("skips blank lines and overlong names", () => {
    const long = "菜".repeat(201);
    const items = parseOcrTextToDraftItems(`\n\n演示菜品 10元\n${long} 5元\n`);
    expect(items).toHaveLength(1);
    expect(items[0].name).toBe("演示菜品");
  });

  it("returns empty array for empty OCR text", () => {
    expect(parseOcrTextToDraftItems("")).toEqual([]);
    expect(parseOcrTextToDraftItems("   \n  ")).toEqual([]);
  });
});
