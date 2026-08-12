import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  assignMealPeriodSortOrder,
  parseAigensMenuProducts,
} from "../src/lib/canteen-aigens-parse";
import type { MenuSyncInput } from "../src/lib/canteen-types";

const STORE_ID = "112891";
const ENDPOINT = `https://aigensstoreapp.appspot.com/api/v1/menu/store/${STORE_ID}.json?locale=default&open=true&menu=prekiosk&groupId=1000&country=hk`;
const EXCLUDED_CATEGORIES = new Set(["零食", "外賣包裝"]);

function stamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-` +
    `${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
  );
}

async function loadAigensMenu(): Promise<unknown> {
  const fromFileIndex = process.argv.indexOf("--from-file");
  if (fromFileIndex !== -1) {
    const { readFileSync } = await import("node:fs");
    const rawPath = process.argv[fromFileIndex + 1];
    if (!rawPath) throw new Error("--from-file requires a path");
    return JSON.parse(readFileSync(rawPath, "utf8"));
  }
  const response = await fetch(ENDPOINT, {
    signal: AbortSignal.timeout(30_000),
    headers: {
      Accept: "application/json",
      "User-Agent": "Mozilla/5.0 CUpedia-aigens-crawler",
      Referer: `https://csd.order.place/home/store/${STORE_ID}`,
    },
  });
  if (!response.ok) {
    throw new Error(`Aigens menu request failed: ${response.status}`);
  }
  return response.json();
}

export function buildCucafeMenu(input: unknown): MenuSyncInput {
  const products = parseAigensMenuProducts(input, {
    excludedCategories: EXCLUDED_CATEGORIES,
  });

  const items = assignMealPeriodSortOrder(
    products.map((product) => ({
      externalKey: `${product.backendId}:${product.periods[0]}`,
      name: product.name,
      priceOptions: [
        {
          label: null,
          amountMinor: product.amountMinor,
          currency: "HKD" as const,
          sortOrder: 0,
        },
      ],
      mealPeriods: product.periods,
      sortOrder: 0,
      svgKey: product.svgKey,
    })),
    (item) => item.mealPeriods,
  );

  return {
    source: `aigens:${STORE_ID}`,
    takeOverLegacyItems: true,
    items,
  };
}

/** Admin sync JSON keeps `pricing` wrapper used by parseMenuItemsJson. */
function toAdminSyncJson(payload: MenuSyncInput) {
  return {
    source: payload.source,
    takeOverLegacyItems: payload.takeOverLegacyItems,
    items: payload.items.map((item) => ({
      externalKey: item.externalKey,
      name: item.name,
      mealPeriods: item.mealPeriods,
      sortOrder: item.sortOrder,
      svgKey: item.svgKey,
      pricing: {
        options: item.priceOptions,
      },
    })),
  };
}

async function main() {
  const raw = await loadAigensMenu();
  const snapshotDir = path.join(
    process.cwd(),
    "docs/canteen/data/aigens-snapshots",
    STORE_ID,
  );
  mkdirSync(snapshotDir, { recursive: true });
  const snapshotPath = path.join(snapshotDir, `live-${stamp()}.json`);
  writeFileSync(snapshotPath, JSON.stringify(raw), "utf8");

  const payload = toAdminSyncJson(buildCucafeMenu(raw));
  const defaultOut = path.join(
    process.cwd(),
    "docs/canteen/data/cucafe-menu.json",
  );
  const namedOut = path.join(
    process.cwd(),
    "docs/canteen/data/CU CAFE-aigens-menu-sync.json",
  );
  const outputIndex = process.argv.indexOf("--output");
  const outputs =
    outputIndex === -1
      ? [defaultOut, namedOut]
      : [process.argv[outputIndex + 1]].filter(Boolean);
  if (outputs.length === 0) throw new Error("--output requires a path");

  const json = `${JSON.stringify(payload, null, 2)}\n`;
  for (const output of outputs) {
    writeFileSync(output!, json, "utf8");
    process.stdout.write(`Wrote ${payload.items.length} items to ${output}\n`);
  }
  process.stdout.write(`Raw snapshot: ${snapshotPath}\n`);

  const byPeriod = new Map<string, number>();
  const bySection = new Map<string, number>();
  for (const item of payload.items) {
    for (const period of item.mealPeriods) {
      byPeriod.set(period, (byPeriod.get(period) ?? 0) + 1);
    }
    bySection.set(item.svgKey, (bySection.get(item.svgKey) ?? 0) + 1);
  }
  process.stdout.write(
    `periods: ${[...byPeriod.entries()].map(([k, n]) => `${k}=${n}`).join(", ")}\n`,
  );
  process.stdout.write(
    `sections: ${[...bySection.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([k, n]) => `${k}(${n})`)
      .join(", ")}\n`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
