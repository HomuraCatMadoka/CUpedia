import { createHash } from "node:crypto";
import { assignMealPeriodSortOrder } from "./canteen-aigens-parse";
import { assertProviderMenuIdentityItems } from "./canteen-provider-menu-identity";
import { compareProviderText } from "./canteen-provider-menu-ordering";
import { mealPeriodsForOperatingWindow } from "./canteen-provider-menu-periods";
import { expectedMenuSnapshotCompleteness } from "./canteen-menu-snapshot-completeness";
import {
  createMenuPublicationKey,
  isMenuServiceTime,
} from "./canteen-menu-publication";
import { pinmePublicationCompatibilityKey } from "./canteen-pinme-publication";
import { resolveMenuSectionKey } from "./canteen-svg-keys";
import {
  normalizeMealPeriods,
  type MenuSnapshotScopeEvidence,
  type ProviderMenuObservation,
  type MenuItemPriceOptionInput,
} from "./canteen-types";

const PINME_SIGNING_KEY = "a91f9568fbd23881c2b2c7fa9af5b12a";
const MAX_PINME_GROUPS = 500;
const MAX_PINME_GROUP_REFERENCES = 500;
const MAX_PINME_REFRESH_BOUNDARIES = 128;

type JsonObject = Record<string, unknown>;
type PinmeServiceWindow = Extract<
  MenuSnapshotScopeEvidence,
  { provider: "pinme" }
>["serviceWindows"][number];
type PinmePublicationWindow = NonNullable<
  Extract<
    MenuSnapshotScopeEvidence,
    { provider: "pinme" }
  >["publicationWindows"]
>[number];

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

function pinmeGroupId(value: unknown): string | null {
  const normalized = text(value);
  return normalized && /^\d{1,32}$/.test(normalized) ? normalized : null;
}

function referencedPinmeGroups(data: JsonObject): {
  menuGroupCount: number;
  referencedGroupIds: string[];
  groups: JsonObject[];
  groupCount: number;
  publicationKey: string;
  publicationWindows: PinmePublicationWindow[];
  refreshBoundaryMinutes: number[];
  refreshUntilMinute?: number;
} {
  if (!Array.isArray(data.menu_group) || !Array.isArray(data.group)) {
    throw new Error("INVALID_PINME_MENU_TOPOLOGY");
  }
  if (
    data.menu_group.length > MAX_PINME_GROUPS ||
    data.group.length > MAX_PINME_GROUPS
  ) {
    throw new Error("INVALID_PINME_MENU_TOPOLOGY");
  }

  const referencedGroupIds = new Set<string>();
  const publicationDescriptors: Array<{
    publicationId: string | null;
    startTime: string | null;
    endTime: string | null;
    groupIds: string[];
  }> = [];
  const publicationWindows = new Map<string, PinmePublicationWindow>();
  const refreshBoundaryMinutes = new Set<number>();
  let refreshUntilMinute: number | undefined;
  let hasBoundedRefreshHorizon = data.group.length > 0;
  let referenceCount = 0;
  for (const menuGroupValue of data.menu_group) {
    const menuGroup = object(menuGroupValue);
    if (!menuGroup || !Array.isArray(menuGroup.groups)) {
      throw new Error("INVALID_PINME_MENU_TOPOLOGY");
    }
    referenceCount += menuGroup.groups.length;
    if (referenceCount > MAX_PINME_GROUP_REFERENCES) {
      throw new Error("INVALID_PINME_MENU_TOPOLOGY");
    }
    const menuGroupIds = new Set<string>();
    for (const groupIdValue of menuGroup.groups) {
      const groupId = pinmeGroupId(groupIdValue);
      if (!groupId) throw new Error("INVALID_PINME_MENU_TOPOLOGY");
      referencedGroupIds.add(groupId);
      menuGroupIds.add(groupId);
    }
    const window = serviceWindow(menuGroup);
    if (window) {
      refreshBoundaryMinutes.add(minuteOfDay(window.startTime));
      refreshBoundaryMinutes.add(minuteOfDay(window.endTime));
    }
    const publicationId = pinmeGroupId(menuGroup.menu_id);
    if (publicationId && window) {
      publicationWindows.set(
        `${publicationId}/${window.startTime}/${window.endTime}`,
        { publicationId, ...window },
      );
    }
    publicationDescriptors.push({
      publicationId,
      startTime: window?.startTime ?? null,
      endTime: window?.endTime ?? null,
      groupIds: [...menuGroupIds].sort((left, right) =>
        left.localeCompare(right),
      ),
    });
  }
  if (referencedGroupIds.size === 0) throw new Error("EMPTY_PINME_MENU");

  const groupsById = new Map<string, JsonObject>();
  for (const groupValue of data.group) {
    const group = object(groupValue);
    const groupId = pinmeGroupId(group?.group_id);
    if (!group || !groupId || groupsById.has(groupId)) {
      throw new Error("INVALID_PINME_MENU_TOPOLOGY");
    }
    groupsById.set(groupId, group);
    const window = serviceWindow(group);
    if (window) {
      const startMinute = minuteOfDay(window.startTime);
      const endMinute = minuteOfDay(window.endTime);
      refreshBoundaryMinutes.add(startMinute);
      refreshBoundaryMinutes.add(endMinute);
      if (startMinute >= endMinute) {
        hasBoundedRefreshHorizon = false;
      } else {
        refreshUntilMinute = Math.max(refreshUntilMinute ?? 0, endMinute);
      }
    } else {
      hasBoundedRefreshHorizon = false;
    }
  }

  const sortedReferencedGroupIds = [...referencedGroupIds].sort((left, right) =>
    left.localeCompare(right),
  );
  const groups = sortedReferencedGroupIds.map((groupId) => {
    const group = groupsById.get(groupId);
    if (!group) throw new Error("INVALID_PINME_MENU_TOPOLOGY");
    return group;
  });
  return {
    menuGroupCount: data.menu_group.length,
    referencedGroupIds: sortedReferencedGroupIds,
    groups,
    groupCount: data.group.length,
    publicationKey: createMenuPublicationKey(
      [
        ...new Set(
          publicationDescriptors.map((descriptor) =>
            JSON.stringify(descriptor),
          ),
        ),
      ].sort((left, right) => left.localeCompare(right)),
    ),
    publicationWindows: [...publicationWindows.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([, window]) => window),
    refreshBoundaryMinutes: [...refreshBoundaryMinutes]
      .sort((left, right) => left - right)
      .slice(0, MAX_PINME_REFRESH_BOUNDARIES),
    ...(hasBoundedRefreshHorizon && refreshUntilMinute !== undefined
      ? { refreshUntilMinute }
      : {}),
  };
}

function assertValidPinmeProducts(group: JsonObject): void {
  if (!Array.isArray(group.products)) throw new Error("INVALID_PINME_MENU");
  for (const productValue of group.products) {
    const product = object(productValue);
    if (
      !product ||
      (product.product_id !== undefined &&
        typeof product.product_id !== "string" &&
        typeof product.product_id !== "number") ||
      (product.prices !== undefined && !Array.isArray(product.prices))
    ) {
      throw new Error("INVALID_PINME_MENU");
    }
  }
}

function serviceWindow(group: JsonObject): PinmeServiceWindow | null {
  const startTime = text(group.start_time);
  const endTime = text(group.end_time);
  if (!isMenuServiceTime(startTime) || !isMenuServiceTime(endTime)) {
    return null;
  }
  return { startTime, endTime };
}

function minuteOfDay(value: string): number {
  const [hour, minute] = value.split(":").map(Number);
  return hour * 60 + minute;
}

function amountMinor(value: unknown): number | null {
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(number) || number < 0 || number > 9_999) return null;
  return Math.round(number * 100);
}

function canonicalizePriceOptions(
  options: MenuItemPriceOptionInput[],
): MenuItemPriceOptionInput[] {
  return options
    .slice()
    .sort(
      (left, right) =>
        compareProviderText(left.label ?? "", right.label ?? "") ||
        left.amountMinor - right.amountMinor ||
        compareProviderText(left.currency, right.currency),
    )
    .map((option, sortOrder) => ({ ...option, sortOrder }));
}

function samePriceOptions(
  left: readonly MenuItemPriceOptionInput[],
  right: readonly MenuItemPriceOptionInput[],
): boolean {
  return (
    left.length === right.length &&
    left.every(
      (option, index) =>
        option.label === right[index].label &&
        option.amountMinor === right[index].amountMinor &&
        option.currency === right[index].currency,
    )
  );
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
  if (variants.length > 0) return canonicalizePriceOptions(variants);
  const amount = amountMinor(product.takeout_price ?? product.price);
  return amount === null
    ? []
    : [{ label: null, amountMinor: amount, currency: "HKD", sortOrder: 0 }];
}

export function buildPinmeMenuSyncPayload(
  input: unknown,
): ProviderMenuObservation {
  const root = object(input);
  const data = object(root?.data);
  if (Number(root?.code) !== 200 || !data) throw new Error("PINME_MENU_ERROR");
  const topology = referencedPinmeGroups(data);

  const byProductId = new Map<
    string,
    Omit<ProviderMenuObservation["items"][number], "sortOrder">
  >();
  const serviceWindows = new Map<string, PinmeServiceWindow>();
  for (const group of topology.groups) {
    assertValidPinmeProducts(group);
    const window = serviceWindow(group);
    if (window) {
      serviceWindows.set(`${window.startTime}/${window.endTime}`, window);
    }
    const categoryName = text(group.local_name ?? group.en_name) ?? "其他";
    const mealPeriods = mealPeriodsForOperatingWindow(
      text(group.start_time) ?? undefined,
      text(group.end_time) ?? undefined,
    );
    const occurrencesInGroup = new Map<
      string,
      Omit<ProviderMenuObservation["items"][number], "sortOrder">
    >();
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
      const occurrence = {
        externalProductId,
        name,
        priceOptions: priceOptions(product),
        mealPeriods,
        svgKey: resolveMenuSectionKey({ categoryName, dishName: name }),
      };
      const repeatedInGroup = occurrencesInGroup.get(externalProductId);
      if (repeatedInGroup) {
        assertProviderMenuIdentityItems("pinme", [repeatedInGroup, occurrence]);
      }
      occurrencesInGroup.set(externalProductId, occurrence);

      const existing = byProductId.get(externalProductId);
      if (existing) {
        if (
          existing.name !== occurrence.name ||
          !samePriceOptions(existing.priceOptions, occurrence.priceOptions)
        ) {
          assertProviderMenuIdentityItems("pinme", [existing, occurrence]);
        }
        if (occurrence.svgKey < existing.svgKey) {
          existing.svgKey = occurrence.svgKey;
        }
        const mergedMealPeriods = normalizeMealPeriods([
          ...existing.mealPeriods,
          ...mealPeriods,
        ]);
        if (!mergedMealPeriods) throw new Error("INVALID_MEAL_PERIOD");
        existing.mealPeriods = mergedMealPeriods;
        continue;
      }
      byProductId.set(externalProductId, occurrence);
    }
  }
  const items = [...byProductId.values()].map((item) => ({
    ...item,
    sortOrder: 0,
  }));
  if (items.length === 0) throw new Error("EMPTY_PINME_MENU");
  assertProviderMenuIdentityItems("pinme", items);
  const normalizedServiceWindows = [...serviceWindows.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([, window]) => window);
  const publicationCompatibilityKey = pinmePublicationCompatibilityKey({
    provider: "pinme",
    referencedGroupIds: topology.referencedGroupIds,
    serviceWindows: normalizedServiceWindows,
  });
  if (!publicationCompatibilityKey) {
    throw new Error("INVALID_PINME_MENU_TOPOLOGY");
  }
  return {
    snapshotCompleteness: expectedMenuSnapshotCompleteness("pinme"),
    items: assignMealPeriodSortOrder(items, (item) => item.mealPeriods),
    scopeEvidence: {
      provider: "pinme",
      menuGroupCount: topology.menuGroupCount,
      groupCount: topology.groupCount,
      referencedGroupIds: topology.referencedGroupIds,
      publicationKey: topology.publicationKey,
      publicationCompatibilityKey,
      publicationWindows: topology.publicationWindows,
      refreshBoundaryMinutes: topology.refreshBoundaryMinutes,
      ...(topology.refreshUntilMinute !== undefined
        ? { refreshUntilMinute: topology.refreshUntilMinute }
        : {}),
      serviceWindows: normalizedServiceWindows,
    },
  };
}
