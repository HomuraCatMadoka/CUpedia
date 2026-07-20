import { inferDishSvgKeyFromName } from "@/lib/canteen-svg-keys";
import {
  compareMealPeriods,
  type MealPeriod,
  type MenuSyncInput,
} from "./canteen-types";

type AigensItem = {
  backendId?: string;
  id?: string;
  name?: string;
  price?: number;
  published?: boolean;
  archived?: boolean;
  modifier?: boolean;
};

type AigensGroup = {
  id?: string;
  items?: AigensItem[];
};

type AigensCategory = {
  name?: string;
  periods?: string[];
  groupIds?: string[];
};

const EXCLUDED_CATEGORIES = new Set(["飲品", "零食", "外賣包裝"]);

const PERIOD_MAP: Record<string, MealPeriod | undefined> = {
  B: "breakfast",
  L: "lunch",
  T: "lunch",
  D: "dinner",
};

export function buildShhoMenuSyncPayload(input: unknown): MenuSyncInput {
  const root = input as {
    data?: { menu?: { categories?: AigensCategory[]; groups?: AigensGroup[] } };
  };
  const categories = root?.data?.menu?.categories;
  const groups = root?.data?.menu?.groups;
  if (!Array.isArray(categories) || !Array.isArray(groups)) {
    throw new Error("INVALID_AIGENS_MENU");
  }

  const groupsById = new Map(
    groups.filter((group) => group.id).map((group) => [group.id!, group]),
  );
  const items = new Map<string, MenuSyncInput["items"][number]>();
  for (const category of categories) {
    if (!category.name || EXCLUDED_CATEGORIES.has(category.name)) continue;
    const primaryGroup = category.groupIds?.[0]
      ? groupsById.get(category.groupIds[0])
      : undefined;
    if (!primaryGroup?.items) continue;
    const periods = [
      ...new Set(
        (category.periods ?? [])
          .map((period) => PERIOD_MAP[period])
          .filter((period): period is MealPeriod => period !== undefined),
      ),
    ];
    for (const item of primaryGroup.items) {
      if (
        item.published === false ||
        item.archived === true ||
        item.modifier === true ||
        !item.name
      ) {
        continue;
      }
      const backendId = String(item.backendId ?? item.id ?? "").trim();
      if (!backendId) continue;
      const name = item.name.trim().replace(/\s+/g, " ");
      const amountMinor = parseAigensPrice(item.price);
      for (const mealPeriod of periods) {
        const externalKey = `${backendId}:${mealPeriod}`;
        if (items.has(externalKey)) continue;
        items.set(externalKey, {
          externalKey,
          name,
          priceOptions: [
            { label: null, amountMinor, currency: "HKD", sortOrder: 0 },
          ],
          mealPeriod,
          sortOrder: 0,
          svgKey: inferDishSvgKeyFromName(name),
        });
      }
    }
  }

  const sortedItems = [...items.values()].sort(
    (a, b) =>
      compareMealPeriods(a.mealPeriod, b.mealPeriod) ||
      a.name.localeCompare(b.name, "zh-HK"),
  );
  sortedItems.forEach((item, index) => {
    item.sortOrder = index;
  });
  return {
    source: "aigens:102830",
    takeOverLegacyItems: true,
    items: sortedItems,
  };
}

function parseAigensPrice(price: unknown): number {
  if (typeof price !== "number" || !Number.isFinite(price) || price < 0) {
    throw new Error("INVALID_AIGENS_PRICE");
  }
  const amountMinor = Math.round(price * 100);
  if (amountMinor > 999_900) throw new Error("INVALID_AIGENS_PRICE");
  return amountMinor;
}

