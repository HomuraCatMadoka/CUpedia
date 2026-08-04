import {
  DISH_SVG_KEYS,
  resolveStoredSectionKey,
  type DishSvgKey,
} from "@/lib/canteen-svg-keys";
import type { CanteenMenuItem } from "@/lib/canteen-types";

/** Display order for known legacy section keys (mains → sides → drinks). */
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
  default: "小食",
  dessert: "甜品",
  drink: "饮品",
};

const KNOWN_SECTION_KEYS = new Set<string>(DISH_SVG_KEYS);

export type MenuSection = {
  /** Stored section key (store category or legacy svg key). */
  svgKey: string;
  label: string;
  items: CanteenMenuItem[];
};

export function menuSectionLabel(svgKey: string): string {
  const key = resolveStoredSectionKey(svgKey);
  if ((DISH_SVG_KEYS as readonly string[]).includes(key)) {
    return SECTION_LABELS[key as DishSvgKey];
  }
  return key;
}

/** Group period items by stored section key; known keys keep legacy order. */
export function groupMenuItemsBySvgKey(
  items: CanteenMenuItem[],
): MenuSection[] {
  const buckets = new Map<string, CanteenMenuItem[]>();
  const firstSeen: string[] = [];
  for (const item of items) {
    const key = resolveStoredSectionKey(item.svgKey);
    const list = buckets.get(key);
    if (list) list.push(item);
    else {
      buckets.set(key, [item]);
      firstSeen.push(key);
    }
  }

  const knownKeys = MENU_SECTION_ORDER.filter((key) => buckets.has(key));
  const customKeys = firstSeen.filter((key) => !KNOWN_SECTION_KEYS.has(key));

  const sections: MenuSection[] = [];
  for (const svgKey of [...knownKeys, ...customKeys]) {
    const group = buckets.get(svgKey);
    if (!group?.length) continue;
    sections.push({
      svgKey,
      label: menuSectionLabel(svgKey),
      items: [...group].sort(
        (a, b) =>
          a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "zh-HK"),
      ),
    });
  }
  return sections;
}
