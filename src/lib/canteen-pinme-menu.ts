import { createHash } from "node:crypto";
import { assignMealPeriodSortOrder } from "@/lib/canteen-aigens-parse";
import { mealPeriodsForOperatingWindow } from "@/lib/canteen-provider-menu-periods";
import {
  assertCompatibleProviderIdentityOccurrence,
  assertProviderMenuIdentityItems,
} from "./canteen-provider-menu-identity";
import { resolveMenuSectionKey } from "@/lib/canteen-svg-keys";
import type {
  MenuSyncInput,
  MenuItemPriceOptionInput,
} from "@/lib/canteen-types";

const PINME_SIGNING_KEY = "a91f9568fbd23881c2b2c7fa9af5b12a";

type JsonObject = Record<string, unknown>;

function object(value: unknown): JsonObject | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonObject)
    : null;
}

function array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function text(value: unknown): string | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const normalized = String(value).trim().replace(/\s+/g, " ");
  return normalized || null;
}

function amountMinor(value: unknown): number | null {
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(number) || number < 0 || number > 9_999) return null;
  return Math.round(number * 100);
}

export function createPinmeSignedParams(
  storeId: string,
  timestamp = Date.now(),
): URLSearchParams {
  const params = new URLSearchParams({
    store_id: storeId,
    ts: String(timestamp),
  });
  const input = [...params.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join("&");
  params.set(
    "sign",
    createHash("md5")
      .update(`${input}&key=${PINME_SIGNING_KEY}`)
      .digest("hex")
      .toUpperCase(),
  );
  return params;
}

function priceOptions(product: JsonObject): MenuItemPriceOptionInput[] {
  const variants = array(product.prices)
    .map(object)
    .filter((value): value is JsonObject => value !== null)
    .filter((value) => text(value.status) !== "0")
    .map((value, index) => {
      const amount = amountMinor(value.takeout_price ?? value.price);
      if (amount === null) return null;
      const standard = object(value.productStandardItem);
      return {
        label: text(standard?.local_name ?? standard?.en_name),
        amountMinor: amount,
        currency: "HKD",
        sortOrder: index,
      };
    })
    .filter((value): value is MenuItemPriceOptionInput => value !== null);
  if (variants.length === 1) variants[0].label = null;
  if (variants.length > 0) return variants;
  const amount = amountMinor(product.takeout_price ?? product.price);
  return amount === null
    ? []
    : [{ label: null, amountMinor: amount, currency: "HKD", sortOrder: 0 }];
}

export function buildPinmeMenuSyncPayload(input: unknown): MenuSyncInput {
  const root = object(input);
  const data = object(root?.data);
  if (Number(root?.code) !== 200 || !data) throw new Error("PINME_MENU_ERROR");

  const byProductId = new Map<
    string,
    Omit<MenuSyncInput["items"][number], "sortOrder">
  >();
  for (const groupValue of array(data.group)) {
    const group = object(groupValue);
    if (!group) continue;
    const categoryName = text(group.local_name ?? group.en_name) ?? "其他";
    const mealPeriods = mealPeriodsForOperatingWindow(
      text(group.start_time) ?? undefined,
      text(group.end_time) ?? undefined,
    );
    for (const productValue of array(group.products)) {
      const product = object(productValue);
      const externalProductId = text(product?.product_id);
      const name = text(product?.local_name ?? product?.en_name);
      if (product && text(product.status) !== "0") {
        assertProviderMenuIdentityItems("pinme", [
          { externalProductId: externalProductId ?? "" },
        ]);
      }
      if (
        !product ||
        !externalProductId ||
        !name ||
        text(product.status) === "0"
      ) {
        continue;
      }
      const existing = byProductId.get(externalProductId);
      if (existing) {
        const svgKey = resolveMenuSectionKey({ categoryName, dishName: name });
        assertCompatibleProviderIdentityOccurrence("pinme", existing, {
          externalProductId,
          name,
          priceOptions: priceOptions(product),
          mealPeriods,
          svgKey,
        });
        existing.mealPeriods = [
          ...new Set([...existing.mealPeriods, ...mealPeriods]),
        ];
        continue;
      }
      byProductId.set(externalProductId, {
        externalProductId,
        name,
        priceOptions: priceOptions(product),
        mealPeriods,
        svgKey: resolveMenuSectionKey({ categoryName, dishName: name }),
      });
    }
  }
  const items = [...byProductId.values()].map((item) => ({
    ...item,
    sortOrder: 0,
  }));
  if (items.length === 0) throw new Error("EMPTY_PINME_MENU");
  assertProviderMenuIdentityItems("pinme", items);
  return {
    takeOverLegacyItems: false,
    items: assignMealPeriodSortOrder(items, (item) => item.mealPeriods),
  };
}
