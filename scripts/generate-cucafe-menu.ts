import { readFileSync, writeFileSync } from "node:fs";
import {
  assignMealPeriodSortOrder,
  parseAigensMenuProducts,
} from "../src/lib/canteen-aigens-parse";
import type { MealPeriodAssignment } from "../src/lib/canteen-types";

const STORE_ID = "112891";
const ENDPOINT = `https://aigensstoreapp.appspot.com/api/v1/menu/store/${STORE_ID}.json?locale=default&open=true&menu=prekiosk&groupId=1000&country=hk`;
const EXCLUDED_CATEGORIES = new Set(["零食", "外賣包裝"]);

type MenuRow = {
  externalProductId: string;
  name: string;
  mealPeriods: MealPeriodAssignment[];
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
  const fromFileIndex = process.argv.indexOf("--from-file");
  if (fromFileIndex !== -1) {
    const rawPath = process.argv[fromFileIndex + 1];
    if (!rawPath) throw new Error("--from-file requires a path");
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

export function buildCucafeMenu(input: unknown): {
  takeOverLegacyItems: true;
  items: MenuRow[];
} {
  const products = parseAigensMenuProducts(input, {
    excludedCategories: EXCLUDED_CATEGORIES,
  });

  const items = assignMealPeriodSortOrder(
    products.map((product) => ({
      externalProductId: product.backendId,
      name: product.name,
      mealPeriods: product.periods,
      sortOrder: 0,
      svgKey: product.svgKey,
      pricing: {
        options: [
          {
            label: null,
            amountMinor: product.amountMinor,
            currency: "HKD" as const,
            sortOrder: 0,
          },
        ],
      },
    })),
    (item) => item.mealPeriods,
  );

  return {
    takeOverLegacyItems: true,
    items,
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
