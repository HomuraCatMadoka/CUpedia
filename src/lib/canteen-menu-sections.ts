import { resolveDishSvgKey, type DishSvgKey } from "@/lib/canteen-svg-keys";
import type { CanteenMenuItem } from "@/lib/canteen-types";

/** Display order for menu sections (mains → sides → drinks). */
const MENU_SECTION_RANK = {
  rice: 0,
  noodle: 1,
  bowl: 2,
  default: 3,
  dessert: 4,
  drink: 5,
} as const satisfies Record<DishSvgKey, number>;

export const MENU_SECTION_ORDER: readonly DishSvgKey[] = (
  Object.entries(MENU_SECTION_RANK) as [DishSvgKey, number][]
)
  .sort((a, b) => a[1] - b[1])
  .map(([key]) => key);

const SECTION_LABELS: Record<DishSvgKey, string> = {
  rice: "饭类",
  noodle: "粉面",
  bowl: "煲汤",
  default: "小吃",
  dessert: "甜品",
  drink: "饮品",
};

export type MenuSection = {
  svgKey: DishSvgKey;
  label: string;
  items: CanteenMenuItem[];
};

export function menuSectionLabel(svgKey: string): string {
  return SECTION_LABELS[resolveDishSvgKey(svgKey)];
}

/** Group period items by svgKey; unknown keys fold into `default`. */
export function groupMenuItemsBySvgKey(
  items: CanteenMenuItem[],
): MenuSection[] {
  const buckets = new Map<DishSvgKey, CanteenMenuItem[]>();
  for (const item of items) {
    const key = resolveDishSvgKey(item.svgKey);
    const list = buckets.get(key);
    if (list) list.push(item);
    else buckets.set(key, [item]);
  }

  const sections: MenuSection[] = [];
  for (const svgKey of MENU_SECTION_ORDER) {
    const group = buckets.get(svgKey);
    if (!group?.length) continue;
    sections.push({
      svgKey,
      label: SECTION_LABELS[svgKey],
      items: [...group].sort(
        (a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "zh-HK"),
      ),
    });
  }
  return sections;
}
