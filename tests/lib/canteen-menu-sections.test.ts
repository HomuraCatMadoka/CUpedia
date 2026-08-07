import { describe, expect, it } from "vitest";
import type { CanteenMenuItem } from "@/lib/canteen-types";
import {
  groupMenuItemsBySvgKey,
  menuSectionLabel,
} from "@/lib/canteen-menu-sections";

function item(
  id: string,
  name: string,
  svgKey: string,
  sortOrder = 0,
): CanteenMenuItem {
  const t = new Date();
  return {
    id,
    canteenId: "c1",
    name,
    pricing: null,
    mealPeriods: ["lunch"],
    sortOrder,
    svgKey,
    createdAt: t,
    updatedAt: t,
  };
}

describe("groupMenuItemsBySvgKey", () => {
  it("groups items into labelled sections in stable category order", () => {
    const sections = groupMenuItemsBySvgKey([
      item("d1", "奶茶", "drink", 2),
      item("r1", "叉烧饭", "rice", 1),
      item("n1", "牛肉面", "noodle", 0),
      item("r2", "鸡饭", "rice", 0),
    ]);

    expect(sections.map((s) => s.svgKey)).toEqual(["rice", "noodle", "drink"]);
    expect(sections[0]?.label).toBe("饭类");
    expect(sections[0]?.items.map((i) => i.name)).toEqual(["鸡饭", "叉烧饭"]);
    expect(sections[1]?.items.map((i) => i.name)).toEqual(["牛肉面"]);
    expect(sections[2]?.label).toBe("饮品");
  });

  it("keeps freeform store categories as their own sections", () => {
    const sections = groupMenuItemsBySvgKey([
      item("x1", "神秘菜", "每日精选"),
      item("d1", "杂项", "default"),
      item("r1", "鸡饭", "飯類"),
    ]);
    expect(sections.map((s) => s.svgKey)).toEqual([
      "default",
      "每日精选",
      "飯類",
    ]);
    expect(sections[0]?.label).toBe(menuSectionLabel("default"));
    expect(sections[1]?.label).toBe("每日精选");
    expect(sections[2]?.label).toBe("飯類");
    expect(sections[1]?.items.map((i) => i.name)).toEqual(["神秘菜"]);
  });

  it("omits empty categories", () => {
    expect(groupMenuItemsBySvgKey([])).toEqual([]);
  });

  it("orders store categories by min sortOrder, not encounter order", () => {
    // All-day drinks are often listed first after primary-period sorting;
    // section order must still follow sync/Pin Me sortOrder.
    const sections = groupMenuItemsBySvgKey([
      item("d1", "demo-item-1", "demo-section-d", 90),
      item("d2", "demo-item-2", "demo-section-d", 91),
      item("t1", "demo-item-3", "demo-section-a", 0),
      item("c1", "demo-item-4", "demo-section-b", 10),
      item("s1", "demo-item-5", "demo-section-c", 50),
    ]);
    expect(sections.map((s) => s.svgKey)).toEqual([
      "demo-section-a",
      "demo-section-b",
      "demo-section-c",
      "demo-section-d",
    ]);
  });

  it("ignores non-finite sortOrder when computing section min", () => {
    const sections = groupMenuItemsBySvgKey([
      item("a1", "demo-item-a1", "demo-section-late", Number.NEGATIVE_INFINITY),
      item("a2", "demo-item-a2", "demo-section-late", 10),
      item("b1", "demo-item-b1", "demo-section-early", 5),
    ]);
    expect(sections.map((s) => s.svgKey)).toEqual([
      "demo-section-early",
      "demo-section-late",
    ]);
  });
});
