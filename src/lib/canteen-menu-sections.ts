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

function sectionMinSortOrder(items: CanteenMenuItem[]): number {
  let min = Number.POSITIVE_INFINITY;
  for (const item of items) {
    if (item.sortOrder < min) min = item.sortOrder;
  }
  return Number.isFinite(min) ? min : 0;
}

/**
 * Group period items by stored section key.
 * Order follows min(item.sortOrder) so Pin Me / sync order wins; on ties,
 * legacy icon keys keep their fixed rank, then first-seen order.
 */
export function groupMenuItemsBySvgKey(
  items: CanteenMenuItem[],
): MenuSection[] {
  const buckets = new Map<string, CanteenMenuItem[]>();
  const firstSeen = new Map<string, number>();
  for (const item of items) {
    const key = resolveStoredSectionKey(item.svgKey);
    const list = buckets.get(key);
    if (list) list.push(item);
    else {
      buckets.set(key, [item]);
      firstSeen.set(key, firstSeen.size);
    }
  }

  const orderedKeys = [...buckets.keys()].sort((a, b) => {
    const aItems = buckets.get(a)!;
    const bItems = buckets.get(b)!;
    const bySort =
      sectionMinSortOrder(aItems) - sectionMinSortOrder(bItems);
    if (bySort !== 0) return bySort;

    const aKnown = KNOWN_SECTION_KEYS.has(a);
    const bKnown = KNOWN_SECTION_KEYS.has(b);
    if (aKnown && bKnown) {
      return (
        MENU_SECTION_RANK[a as DishSvgKey] -
        MENU_SECTION_RANK[b as DishSvgKey]
      );
    }
    if (aKnown !== bKnown) return aKnown ? -1 : 1;

    return (firstSeen.get(a) ?? 0) - (firstSeen.get(b) ?? 0);
  });

  const sections: MenuSection[] = [];
  for (const svgKey of orderedKeys) {
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
