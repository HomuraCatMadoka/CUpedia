/**
 * Build MenuSync JSON from Pin Me product-menus dumps.
 * Preserves Pin Me group names as svgKey (section).
 * Reuses existing DB external_key when product id already synced.
 *
 * Usage:
 *   node --env-file=.env.local --import tsx scripts/generate-pinme-menu-sync.ts
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { Pool } from "pg";
import { resolveMenuSectionKey } from "../src/lib/canteen-svg-keys";
import type { MealPeriodAssignment } from "../src/lib/canteen-types";

type PinMeProduct = {
  product_id?: string;
  status?: string;
  local_name?: string;
  en_name?: string;
  price?: string | number;
  pos_sort?: string | number;
  prices?: Array<{ price?: string | number; status?: string }>;
};

type PinMeGroup = {
  group_id?: string;
  local_name?: string;
  en_name?: string;
  start_time?: string;
  end_time?: string;
  display_order?: string | number;
  products?: PinMeProduct[];
};

type PinMeMenuGroup = {
  local_name?: string;
  display_order?: string | number;
  groups?: Array<{ ref?: string; group_id?: string } | string>;
};

type PinMeRaw = {
  data?: {
    group?: PinMeGroup[];
    menu_group?: PinMeMenuGroup[];
  };
};

type SyncItem = {
  externalKey: string;
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

const TARGETS: Array<{
  canteenName: string;
  storeIds: number[];
  /** Primary source used by existing rows; extras get their own source files. */
  primarySource: string;
}> = [
  { canteenName: "ws-can", storeIds: [4898], primarySource: "pinme:4898" },
  {
    canteenName: "uc-can",
    storeIds: [5198, 5203],
    primarySource: "pinme:5198",
  },
  { canteenName: "na-can", storeIds: [5500], primarySource: "pinme:5500" },
  {
    canteenName: "Cafe Tolo",
    storeIds: [4899],
    primarySource: "pinme:4899",
  },
  {
    canteenName: "The Green",
    storeIds: [5581],
    primarySource: "pinme:5581",
  },
];

function minutes(hhmm: string | undefined): number | null {
  if (!hhmm || !/^\d{2}:\d{2}$/.test(hhmm)) return null;
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

function inferPeriods(
  categoryName: string,
  start: string | undefined,
  end: string | undefined,
): MealPeriodAssignment[] {
  const cat = categoryName.replace(/\s+/g, "");
  if (/早餐|早晨|早\./u.test(cat)) return ["breakfast"];
  if (/晚市|夜|晚餐/u.test(cat) && !/(午餐|午市)/u.test(cat)) {
    return ["dinner"];
  }

  const s = minutes(start);
  const e = minutes(end);
  if (s == null || e == null) return ["lunch", "dinner"];

  // Full-day / near full-day windows
  if ((s === 0 && e >= 23 * 60) || (s === 0 && e === 0)) {
    if (/飲品|茶|奶|咖啡|梳打|沙冰|原茶|推介款式/u.test(cat)) {
      return ["breakfast", "lunch", "dinner"];
    }
    return ["lunch", "dinner"];
  }

  // Morning-only-ish
  if (e <= 11 * 60) return ["breakfast"];

  // Afternoon / evening session (ws-can 15:15–19:55 etc.)
  if (s >= 15 * 60) return ["dinner"];

  // Classic lunch window (ends mid-afternoon, starts mid-morning)
  if (s >= 9 * 60 && e <= 15 * 60) return ["lunch"];

  // Afternoon snack window straddling lunch/dinner
  if (s >= 13 * 60 && e <= 18 * 60) return ["lunch", "dinner"];

  return ["lunch", "dinner"];
}

function externalKeyFor(
  productId: string,
  periods: MealPeriodAssignment[],
  existingByProductId: Map<string, string>,
): string {
  const existing = existingByProductId.get(productId);
  if (existing) return existing;
  if (periods.length === 1) return `${productId}:${periods[0]}`;
  return productId;
}

function parsePriceMinor(product: PinMeProduct): number | null {
  const candidates = [
    product.price,
    ...(product.prices ?? []).map((p) => p.price),
  ];
  for (const raw of candidates) {
    const n = typeof raw === "number" ? raw : Number(raw);
    if (Number.isFinite(n) && n >= 0) {
      const minor = Math.round(n * 100);
      if (minor <= 999_900) return minor;
    }
  }
  return null;
}

function displayOrderValue(value: string | number | undefined): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : Number.MAX_SAFE_INTEGER;
}

function loadRawPayload(storeId: number): PinMeRaw {
  const file = path.join(
    process.cwd(),
    "docs/canteen/data",
    `pinme-${storeId}-raw.json`,
  );
  return JSON.parse(readFileSync(file, "utf8")) as PinMeRaw;
}

/** Walk Pin Me menu_group refs first, then leftover groups by display_order. */
function orderedGroups(raw: PinMeRaw): PinMeGroup[] {
  const groups = raw.data?.group ?? [];
  const byId = new Map(
    groups
      .filter((group) => group.group_id != null)
      .map((group) => [String(group.group_id), group]),
  );
  const seen = new Set<string>();
  const ordered: PinMeGroup[] = [];

  const menuGroups = [...(raw.data?.menu_group ?? [])].sort(
    (a, b) =>
      displayOrderValue(a.display_order) - displayOrderValue(b.display_order),
  );
  for (const menu of menuGroups) {
    const refs = [...(menu.groups ?? [])]
      .map((ref) => {
        const groupId =
          typeof ref === "string"
            ? ref
            : String(ref.ref ?? ref.group_id ?? "");
        return groupId ? byId.get(groupId) : undefined;
      })
      .filter((group): group is PinMeGroup => group != null)
      .sort(
        (a, b) =>
          displayOrderValue(a.display_order) -
          displayOrderValue(b.display_order),
      );
    for (const group of refs) {
      const groupId = String(group.group_id ?? "");
      if (!groupId || seen.has(groupId)) continue;
      seen.add(groupId);
      ordered.push(group);
    }
  }

  const leftovers = groups
    .filter((group) => {
      const id = group.group_id != null ? String(group.group_id) : "";
      return id ? !seen.has(id) : true;
    })
    .sort(
      (a, b) =>
        displayOrderValue(a.display_order) - displayOrderValue(b.display_order),
    );
  ordered.push(...leftovers);
  return ordered;
}

function orderedProducts(products: PinMeProduct[]): PinMeProduct[] {
  return [...products].sort((a, b) => {
    const aPos = displayOrderValue(a.pos_sort);
    const bPos = displayOrderValue(b.pos_sort);
    if (aPos !== bPos) return aPos - bPos;
    return 0;
  });
}

/** Pin Me guest/kiosk price lists — duplicates of student/regular items. */
function isKtCategory(categoryName: string): boolean {
  return /(?:^|[(\s])KT\)?$/u.test(categoryName.trim()) || /KT$/u.test(categoryName.trim());
}

function normalizeDishName(name: string): string {
  return name
    .replace(/[（(]\s*KT\s*[）)]/giu, "")
    .replace(/\s*KT\s*$/giu, "")
    .replace(/\s+/gu, " ")
    .trim();
}

function buildItems(
  storeId: number,
  existingByProductId: Map<string, string>,
  excludedCategories: Set<string>,
): SyncItem[] {
  const raw = loadRawPayload(storeId);
  const groups = orderedGroups(raw);
  const items: SyncItem[] = [];
  let sortOrder = 0;
  // Prefer non-KT / cheaper when the same dish appears twice.
  const bestByName = new Map<string, SyncItem>();

  for (const group of groups) {
    const categoryName = (group.local_name || group.en_name || "")
      .replace(/\t/g, "")
      .trim();
    if (!categoryName) continue;
    if (excludedCategories.has(categoryName)) continue;
    if (isKtCategory(categoryName)) continue;

    for (const product of orderedProducts(group.products ?? [])) {
      if (String(product.status) !== "1") continue;
      const rawName = (product.local_name || product.en_name || "").trim();
      if (!rawName) continue;
      if (/\bKT\b/iu.test(rawName) || /[（(]\s*KT\s*[）)]/u.test(rawName)) {
        continue;
      }
      const name = normalizeDishName(rawName);
      if (!name) continue;
      const productId = String(product.product_id ?? "");
      if (!productId) continue;
      const amountMinor = parsePriceMinor(product);
      if (amountMinor == null) continue;

      const mealPeriods = inferPeriods(
        categoryName,
        group.start_time,
        group.end_time,
      );
      const svgKey = resolveMenuSectionKey({ categoryName, dishName: name });
      const item: SyncItem = {
        externalKey: externalKeyFor(productId, mealPeriods, existingByProductId),
        name,
        mealPeriods,
        sortOrder: sortOrder++,
        svgKey,
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
      };

      const prev = bestByName.get(name);
      if (!prev) {
        bestByName.set(name, item);
        continue;
      }
      const prevPrice = prev.pricing.options[0]?.amountMinor ?? Number.MAX_SAFE_INTEGER;
      const mergedPeriods = [
        ...new Set([...prev.mealPeriods, ...mealPeriods]),
      ] as MealPeriodAssignment[];
      if (amountMinor < prevPrice) {
        bestByName.set(name, {
          ...item,
          mealPeriods: mergedPeriods,
          sortOrder: prev.sortOrder,
        });
      } else {
        bestByName.set(name, { ...prev, mealPeriods: mergedPeriods });
      }
    }
  }

  return [...bestByName.values()]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((item, index) => ({ ...item, sortOrder: index }));
}

async function loadExistingKeys(
  pool: Pool,
  canteenName: string,
  source: string,
): Promise<Map<string, string>> {
  const { rows } = await pool.query<{ external_key: string }>(
    `select m.external_key
     from canteen_menu_items m
     join canteens c on c.id = m.canteen_id
     where c.name = $1 and m.external_source = $2 and m.external_key is not null`,
    [canteenName, source],
  );
  const map = new Map<string, string>();
  for (const row of rows) {
    const productId = row.external_key.split(":")[0]!;
    if (!map.has(productId)) map.set(productId, row.external_key);
  }
  return map;
}

async function main() {
  const onlyArg = process.argv.find((arg) => arg.startsWith("--only="));
  const onlyName = onlyArg?.slice("--only=".length);
  const targets = onlyName
    ? TARGETS.filter((target) => target.canteenName === onlyName)
    : TARGETS;
  if (targets.length === 0) {
    throw new Error(
      onlyName
        ? `No TARGETS match --only=${onlyName}`
        : "No TARGETS configured",
    );
  }

  const url = process.env.DATABASE_URL;
  const pool = url
    ? new Pool({
        connectionString: url,
        max: 1,
        ssl: { rejectUnauthorized: false },
      })
    : null;
  if (!pool) {
    console.warn(
      "DATABASE_URL missing — generating sync JSON without existing external_key reuse",
    );
  }

  const outDir = path.join(process.cwd(), "docs/canteen/data");
  const report: string[] = [];

  try {
    for (const target of targets) {
      let existing = new Map<string, string>();
      if (pool) {
        try {
          existing = await loadExistingKeys(
            pool,
            target.canteenName,
            target.primarySource,
          );
          for (const storeId of target.storeIds) {
            const source = `pinme:${storeId}`;
            if (source === target.primarySource) continue;
            const sibling = await loadExistingKeys(
              pool,
              target.canteenName,
              source,
            );
            for (const [id, key] of sibling) {
              if (!existing.has(id)) existing.set(id, key);
            }
          }
        } catch (error) {
          console.warn(
            `${target.canteenName}: DB lookup failed (${error instanceof Error ? error.message : error}); continuing with empty key map`,
          );
          existing = new Map();
        }
      }

      const excluded = new Set([
        "外賣配套",
        "其他分項",
        "外賣自取飲品打包費",
      ]);
      const items: SyncItem[] = [];
      const seenProductIds = new Set<string>();
      for (const storeId of target.storeIds) {
        for (const item of buildItems(storeId, existing, excluded)) {
          const productId = item.externalKey.split(":")[0]!;
          if (seenProductIds.has(productId)) continue;
          seenProductIds.add(productId);
          items.push({ ...item, sortOrder: items.length });
        }
      }

      const payload = {
        source: target.primarySource,
        takeOverLegacyItems: true,
        items,
      };
      const outPath = path.join(
        outDir,
        `${target.canteenName}-pinme-menu-sync.json`,
      );
      writeFileSync(outPath, JSON.stringify(payload, null, 2), "utf8");

      const sections = new Map<string, number>();
      for (const item of items) {
        sections.set(item.svgKey, (sections.get(item.svgKey) ?? 0) + 1);
      }
      const reused = items.filter((item) => {
        const id = item.externalKey.split(":")[0]!;
        return existing.get(id) === item.externalKey;
      }).length;
      report.push(
        [
          `## ${target.canteenName} ← ${target.primarySource} (stores ${target.storeIds.join("+")})`,
          `items=${items.length}`,
          `reusedKeys=${reused}`,
          `sections=${[...sections.entries()]
            .sort((a, b) => b[1] - a[1])
            .map(([k, n]) => `${k}(${n})`)
            .join(", ")}`,
          `file=${path.relative(process.cwd(), outPath)}`,
        ].join("\n"),
      );
    }
  } finally {
    if (pool) await pool.end();
  }

  const reportPath = path.join(outDir, "pinme-menu-sync-report.md");
  writeFileSync(reportPath, report.join("\n\n") + "\n", "utf8");
  console.log(report.join("\n\n"));
  console.log(`\nWrote ${reportPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
