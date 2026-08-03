import { readFileSync, writeFileSync } from "node:fs";
import { resolveMenuSectionKey } from "../src/lib/canteen-svg-keys";
import {
  ALLDAY_MEAL_PERIOD,
  primaryMealPeriodSortKey,
  type MealPeriod,
} from "../src/lib/canteen-types";

const STORE_ID = "112891";
const ENDPOINT = `https://aigensstoreapp.appspot.com/api/v1/menu/store/${STORE_ID}.json?locale=default&open=true&menu=prekiosk&groupId=1000&country=hk`;
const EXCLUDED_CATEGORIES = new Set(["零食", "外賣包裝"]);
const PERIOD_MAP: Record<string, MealPeriod | undefined> = {
  B: "breakfast",
  L: "lunch",
  T: "lunch",
  D: "dinner",
};

type AigensItem = {
  backendId?: string;
  id?: string;
  name?: string;
  price?: number;
  published?: boolean;
  archived?: boolean;
  modifier?: boolean;
};

type AigensGroup = { id?: string; items?: AigensItem[] };
type AigensCategory = {
  name?: string;
  periods?: string[];
  groupIds?: string[];
};

type MenuRow = {
  externalKey: string;
  name: string;
  mealPeriod: MealPeriod;
  sortOrder: number;
  svgKey: string;
  pricing: {
    options: Array<{
      label: null;
      amountMinor: number;
      currency: "HKD";
      sortOrder: number;
    }>;
  };
};

async function loadAigensMenu(): Promise<unknown> {
  const rawPath = process.argv.includes("--from-file")
    ? process.argv[process.argv.indexOf("--from-file") + 1]
    : undefined;
  if (rawPath) {
    return JSON.parse(readFileSync(rawPath, "utf8"));
  }
  const response = await fetch(ENDPOINT, {
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) {
    throw new Error(`Aigens menu request failed: ${response.status}`);
  }
  return response.json();
}

function buildCucafeMenu(input: unknown): {
  source: string;
  takeOverLegacyItems: true;
  items: MenuRow[];
} {
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
  const items = new Map<string, MenuRow>();

  for (const category of categories) {
    if (!category.name || EXCLUDED_CATEGORIES.has(category.name)) continue;
    const primaryGroup = category.groupIds?.[0]
      ? groupsById.get(category.groupIds[0])
      : undefined;
    if (!primaryGroup?.items) continue;

    const mappedPeriods = [
      ...new Set(
        (category.periods ?? [])
          .map((period) => PERIOD_MAP[period])
          .filter((period): period is MealPeriod => period !== undefined),
      ),
    ];
    const periods =
      mappedPeriods.length > 0 ? mappedPeriods : [ALLDAY_MEAL_PERIOD];

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
      if (
        typeof item.price !== "number" ||
        !Number.isFinite(item.price) ||
        item.price < 0
      ) {
        throw new Error("INVALID_AIGENS_PRICE");
      }
      const amountMinor = Math.round(item.price * 100);
      if (amountMinor > 999_900) throw new Error("INVALID_AIGENS_PRICE");

      for (const mealPeriod of periods) {
        const externalKey = `${backendId}:${mealPeriod}`;
        if (items.has(externalKey)) continue;
        items.set(externalKey, {
          externalKey,
          name,
          mealPeriod,
          sortOrder: 0,
          svgKey: resolveMenuSectionKey({
            categoryName: category.name,
            dishName: name,
          }),
          pricing: {
            options: [
              {
                label: null,
                amountMinor,
                currency: "HKD",
                sortOrder: 0,
              },
            ],
          },
        });
      }
    }
  }

  const sorted = [...items.values()].sort(
    (a, b) =>
      primaryMealPeriodSortKey([a.mealPeriod]) -
        primaryMealPeriodSortKey([b.mealPeriod]) ||
      a.name.localeCompare(b.name, "zh-HK"),
  );
  sorted.forEach((item, index) => {
    item.sortOrder = index;
  });

  return {
    source: `aigens:${STORE_ID}`,
    takeOverLegacyItems: true,
    items: sorted,
  };
}

async function main() {
  const payload = buildCucafeMenu(await loadAigensMenu());
  const json = `${JSON.stringify(payload, null, 2)}\n`;
  const outputIndex = process.argv.indexOf("--output");
  if (outputIndex === -1) {
    process.stdout.write(json);
    return;
  }
  const output = process.argv[outputIndex + 1];
  if (!output) throw new Error("--output requires a path");
  writeFileSync(output, json, "utf8");
  process.stdout.write(`Wrote ${payload.items.length} items to ${output}\n`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
