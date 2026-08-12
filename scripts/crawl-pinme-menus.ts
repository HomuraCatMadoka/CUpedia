/**
 * Crawl Pin Me product-menus and merge time-window snapshots.
 *
 * Pin Me filters groups by current server time, so a single fetch only
 * covers the active business session. Store snapshots under
 * docs/canteen/data/pinme-snapshots/{storeId}/ and merge into
 * docs/canteen/data/pinme-{storeId}-raw.json.
 *
 * Usage:
 *   node --import tsx scripts/crawl-pinme-menus.ts
 *   node --import tsx scripts/crawl-pinme-menus.ts --store 4898 --merge-only
 */
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const STORE_IDS = [4898, 5198, 5203, 5500] as const;
const API =
  "https://meal.pin2eat.com/api/home/product-menus?store_id={id}&table_name=1&takeout=0&order_sub_type=0";

type PinMeProduct = {
  product_id?: string;
  date_modified?: string;
  [key: string]: unknown;
};

type PinMeGroup = {
  group_id?: string;
  local_name?: string;
  start_time?: string;
  end_time?: string;
  products?: PinMeProduct[];
  [key: string]: unknown;
};

type PinMeMenuGroup = {
  menu_id?: string;
  groups?: unknown[];
  [key: string]: unknown;
};

type PinMePayload = {
  code?: number;
  msg?: string;
  data?: {
    group?: PinMeGroup[];
    menu_group?: PinMeMenuGroup[];
    [key: string]: unknown;
  };
};

function dataDir(...parts: string[]): string {
  return path.join(process.cwd(), "docs/canteen/data", ...parts);
}

function snapshotDir(storeId: number): string {
  return dataDir("pinme-snapshots", String(storeId));
}

function stamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-` +
    `${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
  );
}

async function fetchMenus(storeId: number): Promise<PinMePayload> {
  const url = API.replace("{id}", String(storeId));
  const res = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": "Mozilla/5.0 CUpedia-pinme-crawler",
    },
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} for store ${storeId}`);
  }
  return (await res.json()) as PinMePayload;
}

function productNewer(a: PinMeProduct, b: PinMeProduct): PinMeProduct {
  const am = String(a.date_modified ?? "");
  const bm = String(b.date_modified ?? "");
  if (am && bm) return am >= bm ? a : b;
  if (bm && !am) return b;
  return a;
}

function parseHhMm(value: unknown): number | null {
  if (typeof value !== "string" || !/^\d{2}:\d{2}$/.test(value)) return null;
  const [h, m] = value.split(":").map(Number);
  return h * 60 + m;
}

/** Keep the widest service window across lunch/dinner snapshots. */
function mergeServiceWindow(
  existing: PinMeGroup,
  incoming: PinMeGroup,
): { start_time?: string; end_time?: string } {
  const starts = [existing.start_time, incoming.start_time]
    .map(parseHhMm)
    .filter((n): n is number => n != null);
  const ends = [existing.end_time, incoming.end_time]
    .map(parseHhMm)
    .filter((n): n is number => n != null);
  const fmt = (mins: number) =>
    `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;
  return {
    start_time:
      starts.length > 0
        ? fmt(Math.min(...starts))
        : (incoming.start_time ?? existing.start_time),
    end_time:
      ends.length > 0
        ? fmt(Math.max(...ends))
        : (incoming.end_time ?? existing.end_time),
  };
}

function mergePayloads(payloads: PinMePayload[]): PinMePayload {
  const groupsById = new Map<string, PinMeGroup>();
  const menuById = new Map<string, PinMeMenuGroup>();
  let template: PinMePayload["data"] = {};

  for (const payload of payloads) {
    const data = payload.data;
    if (!data) continue;
    template = { ...template, ...data };

    for (const group of data.group ?? []) {
      const gid = String(group.group_id ?? "");
      if (!gid) continue;
      const existing = groupsById.get(gid);
      if (!existing) {
        groupsById.set(gid, {
          ...group,
          products: [...(group.products ?? [])],
        });
        continue;
      }
      const byProduct = new Map<string, PinMeProduct>();
      for (const product of existing.products ?? []) {
        const pid = String(product.product_id ?? "");
        if (pid) byProduct.set(pid, product);
      }
      for (const product of group.products ?? []) {
        const pid = String(product.product_id ?? "");
        if (!pid) continue;
        const prev = byProduct.get(pid);
        byProduct.set(pid, prev ? productNewer(prev, product) : product);
      }
      const window = mergeServiceWindow(existing, group);
      groupsById.set(gid, {
        ...existing,
        ...group,
        ...window,
        products: [...byProduct.values()],
      });
    }

    for (const menu of data.menu_group ?? []) {
      const mid = String(menu.menu_id ?? menu.local_name ?? "");
      if (!mid) continue;
      const existing = menuById.get(mid);
      if (!existing) {
        menuById.set(mid, {
          ...menu,
          groups: [...(menu.groups ?? [])],
        });
        continue;
      }
      const refs = new Set<string>();
      const mergedRefs: unknown[] = [];
      for (const ref of [...(existing.groups ?? []), ...(menu.groups ?? [])]) {
        const key =
          typeof ref === "string"
            ? ref
            : String(
                (ref as { ref?: string; group_id?: string }).ref ??
                  (ref as { group_id?: string }).group_id ??
                  JSON.stringify(ref),
              );
        if (refs.has(key)) continue;
        refs.add(key);
        mergedRefs.push(ref);
      }
      menuById.set(mid, { ...existing, ...menu, groups: mergedRefs });
    }
  }

  return {
    code: 200,
    msg: "merged",
    data: {
      ...template,
      group: [...groupsById.values()].sort(
        (a, b) => Number(a.group_id ?? 0) - Number(b.group_id ?? 0),
      ),
      menu_group: [...menuById.values()],
    },
  };
}

function summarize(payload: PinMePayload): string {
  const groups = payload.data?.group ?? [];
  const products = groups.reduce(
    (n, group) => n + (group.products?.length ?? 0),
    0,
  );
  const windows = [
    ...new Set(
      groups.map(
        (group) =>
          `${group.local_name ?? "?"} ${group.start_time ?? "?"}-${group.end_time ?? "?"}`,
      ),
    ),
  ];
  return `groups=${groups.length} products=${products} windows=${windows.length}`;
}

function loadSnapshotFiles(storeId: number): PinMePayload[] {
  const dir = snapshotDir(storeId);
  let names: string[] = [];
  try {
    names = readdirSync(dir).filter((name) => name.endsWith(".json"));
  } catch {
    return [];
  }
  return names.map((name) => {
    const raw = readFileSync(path.join(dir, name), "utf8");
    return JSON.parse(raw) as PinMePayload;
  });
}

function writeMerged(storeId: number, payloads: PinMePayload[]): void {
  if (payloads.length === 0) {
    console.warn(`store ${storeId}: no snapshots to merge`);
    return;
  }
  const merged = mergePayloads(payloads);
  const outPath = dataDir(`pinme-${storeId}-raw.json`);
  writeFileSync(outPath, JSON.stringify(merged), "utf8");
  console.log(`store ${storeId}: merged ${payloads.length} snapshots → ${summarize(merged)}`);
  console.log(`  wrote ${path.relative(process.cwd(), outPath)}`);
}

async function crawlStore(storeId: number, mergeOnly: boolean): Promise<void> {
  mkdirSync(snapshotDir(storeId), { recursive: true });

  if (!mergeOnly) {
    const payload = await fetchMenus(storeId);
    if (payload.code !== 200) {
      throw new Error(
        `store ${storeId}: API ${payload.code} ${payload.msg ?? ""}`.trim(),
      );
    }
    const file = path.join(snapshotDir(storeId), `live-${stamp()}.json`);
    writeFileSync(file, JSON.stringify(payload), "utf8");
    console.log(
      `store ${storeId}: crawled ${summarize(payload)} → ${path.relative(process.cwd(), file)}`,
    );
  }

  const snapshots = loadSnapshotFiles(storeId);
  // Also fold in previous merged raw if present and not already a snapshot source.
  const rawPath = dataDir(`pinme-${storeId}-raw.json`);
  try {
    const raw = JSON.parse(readFileSync(rawPath, "utf8")) as PinMePayload;
    if ((raw.data?.group?.length ?? 0) > 0) snapshots.push(raw);
  } catch {
    // no existing raw
  }
  writeMerged(storeId, snapshots);
}

function parseArgs(argv: string[]): { stores: number[]; mergeOnly: boolean } {
  let mergeOnly = false;
  const stores: number[] = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === "--merge-only") mergeOnly = true;
    else if (arg === "--store") {
      const id = Number(argv[++i]);
      if (!Number.isFinite(id)) throw new Error("invalid --store id");
      stores.push(id);
    }
  }
  return { stores: stores.length > 0 ? stores : [...STORE_IDS], mergeOnly };
}

async function main() {
  const { stores, mergeOnly } = parseArgs(process.argv.slice(2));
  for (const storeId of stores) {
    await crawlStore(storeId, mergeOnly);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
