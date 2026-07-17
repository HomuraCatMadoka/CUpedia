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
    mealPeriod: "lunch",
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

  it("maps unknown svg keys into the default section", () => {
    const sections = groupMenuItemsBySvgKey([
      item("x1", "神秘菜", "unknown"),
      item("d1", "杂项", "default"),
    ]);
    expect(sections).toHaveLength(1);
    expect(sections[0]?.svgKey).toBe("default");
    expect(sections[0]?.label).toBe(menuSectionLabel("default"));
    expect(sections[0]?.items.map((i) => i.name)).toEqual(["杂项", "神秘菜"]);
  });

  it("omits empty categories", () => {
    expect(groupMenuItemsBySvgKey([])).toEqual([]);
  });
});
