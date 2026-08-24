import type {
  CanteenMenuSourceConfig,
  CanteenMenuSourceProvider,
} from "@/db/schema";
import { buildAigensMenuSyncPayload } from "@/lib/canteen-aigens-menu";
import { buildIchefMenuSyncPayload } from "@/lib/canteen-ichef-menu";
import {
  buildPinmeMenuSyncPayload,
  createPinmeSignedParams,
} from "@/lib/canteen-pinme-menu";
import { buildQmaiMenuSyncPayload } from "@/lib/canteen-qmai-menu";
import { assertProviderMenuIdentitySnapshot } from "./canteen-provider-menu-identity";
import type {
  MenuObservationContext,
  MenuSnapshotScopeEvidence,
  ProviderMenuObservation,
} from "./canteen-types";

const ICHEF_ENDPOINT =
  "https://shop.ichefpos.com/api/graphql/online_restaurant";
const ICHEF_PLATFORM = "ICHEF_INSTORE";
const REQUEST_TIMEOUT_MS = 15_000;

const MENU_HOURS_QUERY = `
query menuHoursSnapshotQuery($publicId: String, $platformType: PlatformTypes!) {
  restaurant(publicId: $publicId) {
    onlineOrderingMenu(platformType: $platformType) {
      menuHoursSnapshot {
        startTime
        endTime
        categorySnapshotUuids
      }
    }
  }
}`;

const CATEGORIES_QUERY = `
query storeMenuItemCategoriesQuery(
  $publicId: String
  $platformType: PlatformTypes!
  $categoriesSnapshotUuids: [UUID!]!
) {
  restaurant(publicId: $publicId) {
    onlineOrderingMenu(platformType: $platformType) {
      categoriesSnapshot(uuids: $categoriesSnapshotUuids) {
        name
        uuid
        menuItemsSnapshot {
          uuid
          name
          price
        }
      }
    }
  }
}`;

type FetchMenuOptions = {
  fetchImpl?: typeof fetch;
  observationContext?: MenuObservationContext;
};

export type MenuSource = {
  provider: CanteenMenuSourceProvider;
  externalOwnerId?: string | null;
  externalStoreId: string;
  config?: CanteenMenuSourceConfig;
};

type JsonObject = Record<string, unknown>;

function object(value: unknown): JsonObject | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonObject)
    : null;
}

function optionalString(value: unknown): value is string | undefined {
  return value === undefined || typeof value === "string";
}

function hongKongDateTime(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Hong_Kong",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")} ${value("hour")}:${value("minute")}:${value("second")}`;
}

function configString(
  config: CanteenMenuSourceConfig | undefined,
  key: string,
  fallback: string,
): string {
  const value = config?.[key];
  if (value === undefined) return fallback;
  if (typeof value !== "string" || !value.trim()) {
    throw new Error("INVALID_MENU_SOURCE_CONFIG");
  }
  return value.trim();
}

function configPositiveInteger(
  config: CanteenMenuSourceConfig | undefined,
  key: string,
  fallback?: number,
): number {
  const value = config?.[key] ?? fallback;
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error("INVALID_MENU_SOURCE_CONFIG");
  }
  return parsed;
}

function assertOnlyConfigKeys(
  config: CanteenMenuSourceConfig | undefined,
  allowed: readonly string[],
): void {
  if (!config) return;
  const allowedKeys = new Set(allowed);
  if (Object.keys(config).some((key) => !allowedKeys.has(key))) {
    throw new Error("INVALID_MENU_SOURCE_CONFIG");
  }
}

function validateIchefData(payload: unknown) {
  const result = object(payload);
  const data = object(result?.data);
  if (
    !result ||
    !data ||
    (Array.isArray(result.errors) && result.errors.length)
  ) {
    throw new Error("ICHEF_GRAPHQL_ERROR");
  }
  const restaurant = object(data.restaurant);
  const menu = object(restaurant?.onlineOrderingMenu);
  if (!restaurant || !menu) throw new Error("INVALID_ICHEF_MENU");
  const hours = menu.menuHoursSnapshot;
  if (
    hours !== undefined &&
    (!Array.isArray(hours) ||
      !hours.every((value) => {
        const hour = object(value);
        return (
          hour !== null &&
          optionalString(hour.startTime) &&
          optionalString(hour.endTime) &&
          (hour.categorySnapshotUuids === undefined ||
            (Array.isArray(hour.categorySnapshotUuids) &&
              hour.categorySnapshotUuids.every(
                (uuid) => typeof uuid === "string",
              )))
        );
      }))
  ) {
    throw new Error("INVALID_ICHEF_MENU");
  }
  const categories = menu.categoriesSnapshot;
  if (
    categories !== undefined &&
    (!Array.isArray(categories) ||
      !categories.every((value) => {
        const category = object(value);
        return (
          category !== null &&
          optionalString(category.uuid) &&
          optionalString(category.name) &&
          (category.menuItemsSnapshot === undefined ||
            (Array.isArray(category.menuItemsSnapshot) &&
              category.menuItemsSnapshot.every((itemValue) => {
                const item = object(itemValue);
                return (
                  item !== null &&
                  optionalString(item.uuid) &&
                  optionalString(item.name) &&
                  (item.price === undefined || typeof item.price === "number")
                );
              })))
        );
      }))
  ) {
    throw new Error("INVALID_ICHEF_MENU");
  }
  return data as {
    restaurant: {
      onlineOrderingMenu: {
        menuHoursSnapshot?: Array<{
          startTime?: string;
          endTime?: string;
          categorySnapshotUuids?: string[];
        }>;
        categoriesSnapshot?: Array<{
          uuid?: string;
          name?: string;
          menuItemsSnapshot?: Array<{
            uuid?: string;
            name?: string;
            price?: number;
          }>;
        }>;
      };
    };
  };
}

async function fetchJson(
  url: string,
  init: RequestInit,
  fetchImpl: typeof fetch,
): Promise<unknown> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await fetchImpl(url, {
        ...init,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (!response.ok) throw new Error(`UPSTREAM_HTTP_${response.status}`);
      return await response.json();
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

async function ichefGraphql(
  operationName: string,
  variables: Record<string, unknown>,
  query: string,
  fetchImpl: typeof fetch,
) {
  const payload = await fetchJson(
    `${ICHEF_ENDPOINT}?op=${operationName}`,
    {
      method: "POST",
      headers: {
        "accept-language": "zh-Hant",
        "content-type": "application/json",
      },
      body: JSON.stringify({ operationName, variables, query }),
      cache: "no-store",
    },
    fetchImpl,
  );
  return validateIchefData(payload);
}

export async function fetchIchefMenu(
  externalStoreId: string,
  options: FetchMenuOptions = {},
  config?: CanteenMenuSourceConfig,
): Promise<ProviderMenuObservation> {
  const fetchImpl = options.fetchImpl ?? fetch;
  assertOnlyConfigKeys(config, ["platformType"]);
  const common = {
    publicId: externalStoreId,
    platformType: configString(config, "platformType", ICHEF_PLATFORM),
  };
  const hoursData = await ichefGraphql(
    "menuHoursSnapshotQuery",
    common,
    MENU_HOURS_QUERY,
    fetchImpl,
  );
  const menuHours =
    hoursData.restaurant?.onlineOrderingMenu?.menuHoursSnapshot ?? [];
  const categoryUuids = [
    ...new Set(menuHours.flatMap((hour) => hour.categorySnapshotUuids ?? [])),
  ];
  if (categoryUuids.length === 0) throw new Error("EMPTY_ICHEF_MENU");
  const categoriesData = await ichefGraphql(
    "storeMenuItemCategoriesQuery",
    { ...common, categoriesSnapshotUuids: categoryUuids },
    CATEGORIES_QUERY,
    fetchImpl,
  );
  const categories =
    categoriesData.restaurant?.onlineOrderingMenu?.categoriesSnapshot ?? [];
  return buildIchefMenuSyncPayload(menuHours, categories);
}

export async function fetchAigensMenu(
  externalStoreId: string,
  options: FetchMenuOptions = {},
  config?: CanteenMenuSourceConfig,
): Promise<ProviderMenuObservation> {
  if (!/^\d+$/.test(externalStoreId))
    throw new Error("INVALID_AIGENS_STORE_ID");
  assertOnlyConfigKeys(config, [
    "locale",
    "open",
    "menu",
    "groupId",
    "country",
  ]);
  const url = new URL(
    `https://aigensstoreapp.appspot.com/api/v1/menu/store/${externalStoreId}.json`,
  );
  url.search = new URLSearchParams({
    locale: configString(config, "locale", "default"),
    open: configString(config, "open", "true"),
    menu: configString(config, "menu", "prekiosk"),
    groupId: configString(config, "groupId", "1000"),
    country: configString(config, "country", "hk"),
  }).toString();
  const payload = await fetchJson(
    url.toString(),
    { cache: "no-store" },
    options.fetchImpl ?? fetch,
  );
  const scopeEvidence = readAigensCatalogScope(payload, externalStoreId);
  return buildAigensMenuSyncPayload(payload, scopeEvidence);
}

function readAigensCatalogScope(
  payload: unknown,
  externalStoreId: string,
): MenuSnapshotScopeEvidence {
  const response = object(payload);
  const data = object(response?.data);
  const menu = object(data?.menu);
  const storeIds = menu?.storeIds;
  const periods = menu?.periods;
  const categories = menu?.categories;
  const validPeriodCode = (value: unknown): value is string =>
    typeof value === "string" && /^[A-Z][A-Z0-9_-]{0,15}$/.test(value);
  const providerPeriodsAreBounded =
    Array.isArray(periods) &&
    periods.length > 0 &&
    periods.length <= 32 &&
    periods.every((value) => validPeriodCode(object(value)?.code));
  const declaredPeriodCodes = new Set(
    Array.isArray(periods)
      ? periods.flatMap((value) => {
          const period = object(value);
          return typeof period?.code === "string" ? [period.code] : [];
        })
      : [],
  );
  const categoryPeriodsAreDeclared =
    Array.isArray(categories) &&
    categories.every((value) => {
      const category = object(value);
      return (
        category !== null &&
        (category.periods === undefined ||
          (Array.isArray(category.periods) &&
            category.periods.length <= 32 &&
            category.periods.every(
              (period) =>
                validPeriodCode(period) && declaredPeriodCodes.has(period),
            )))
      );
    });
  if (
    response?.status !== "1" ||
    String(data?.id ?? "") !== externalStoreId ||
    typeof data?.name !== "string" ||
    !data.name.trim() ||
    data.name.trim().length > 200 ||
    data?.published !== true ||
    data?.terminated !== false ||
    typeof menu?.name !== "string" ||
    !menu.name.trim() ||
    menu.name.trim().length > 200 ||
    menu?.archived !== false ||
    menu?.slim !== false ||
    !Array.isArray(storeIds) ||
    !storeIds.some((storeId) => String(storeId) === externalStoreId) ||
    !providerPeriodsAreBounded ||
    !categoryPeriodsAreDeclared ||
    categories.length > 500 ||
    !Array.isArray(menu.groups) ||
    menu.groups.length > 500
  ) {
    throw new Error("INVALID_AIGENS_MENU_SCOPE");
  }
  return {
    provider: "aigens",
    externalStoreId,
    storeName: (data.name as string).trim().replace(/\s+/g, " "),
    menuName: (menu.name as string).trim().replace(/\s+/g, " "),
    providerPeriodCodes: [...declaredPeriodCodes].sort(),
    categoryPeriodCodes: [
      ...new Set(
        categories.flatMap((value) => {
          const category = object(value)!;
          return (category.periods as string[] | undefined) ?? [];
        }),
      ),
    ].sort(),
    categoryCount: categories.length,
    groupCount: menu.groups.length,
  };
}

export async function fetchPinmeMenu(
  externalStoreId: string,
  options: FetchMenuOptions = {},
  config?: CanteenMenuSourceConfig,
): Promise<ProviderMenuObservation> {
  if (!/^\d+$/.test(externalStoreId)) throw new Error("INVALID_PINME_STORE_ID");
  assertOnlyConfigKeys(config, ["langcode", "takeout", "orderSubType"]);
  const fetchImpl = options.fetchImpl ?? fetch;
  const headers = {
    "Store-id": externalStoreId,
    langcode: configString(config, "langcode", "zh-Hant"),
  };
  const tokenPayload = (await fetchJson(
    `https://meal.pin2eat.com/api/account/token?${createPinmeSignedParams(externalStoreId)}`,
    { headers, cache: "no-store" },
    fetchImpl,
  )) as { code?: number; data?: { token?: unknown } };
  const token = tokenPayload.data?.token;
  if (tokenPayload.code !== 200 || typeof token !== "string" || !token) {
    throw new Error("PINME_TOKEN_ERROR");
  }
  const query = new URLSearchParams({
    store_id: externalStoreId,
    takeout: configString(config, "takeout", "1"),
    order_sub_type: configString(config, "orderSubType", "1"),
  });
  const payload = await fetchJson(
    `https://meal.pin2eat.com/api/home/product-menus?${query}`,
    {
      headers: { ...headers, Authorization: `Bearer ${token}` },
      cache: "no-store",
    },
    fetchImpl,
  );
  return buildPinmeMenuSyncPayload(payload);
}

export async function fetchQmaiMenu(
  externalStoreId: string,
  options: FetchMenuOptions = {},
  config?: CanteenMenuSourceConfig,
  externalOwnerId?: string | null,
): Promise<ProviderMenuObservation> {
  if (!/^\d+$/.test(externalStoreId)) throw new Error("INVALID_QMAI_STORE_ID");
  assertOnlyConfigKeys(config, ["orderType", "locale"]);
  const multiStoreId = externalStoreId;
  const sellerId = String(
    configPositiveInteger(undefined, "sellerId", Number(externalOwnerId)),
  );
  const orderType = configPositiveInteger(config, "orderType", 1);
  const locale = configString(config, "locale", "zh-HK");
  const observationContext = options.observationContext;
  if (!observationContext) throw new Error("MENU_OBSERVATION_CONTEXT_REQUIRED");
  const fetchImpl = options.fetchImpl ?? fetch;
  const commonHeaders = {
    Accept: "application/json",
    "Accept-Language": locale,
    "content-type": "application/json",
    "Qm-From": "h5",
    "Qm-From-Type": "catering",
    "store-id": sellerId,
  };
  const loginPayload = (await fetchJson(
    "https://webapi.qmai.cn/web/account-center/oauth/mini-app-login",
    {
      method: "POST",
      headers: { ...commonHeaders, "Qm-User-Token": "" },
      body: JSON.stringify({
        code: "",
        storeId: Number(sellerId),
        sellerId: Number(sellerId),
        appid: "",
        flowScene: "",
      }),
      cache: "no-store",
    },
    fetchImpl,
  )) as { code?: number | string; status?: boolean; data?: unknown };
  const loginData = object(loginPayload.data);
  const token = loginData?.token;
  if (
    Number(loginPayload.code) !== 0 ||
    loginPayload.status !== true ||
    typeof token !== "string" ||
    !token
  ) {
    throw new Error("QMAI_TOKEN_ERROR");
  }
  const payload = await fetchJson(
    "https://webapi.qmai.cn/web/catering/goods/list/category-item",
    {
      method: "POST",
      headers: {
        ...commonHeaders,
        "multi-store-id": multiStoreId,
        "Qm-User-Token": token,
      },
      body: JSON.stringify({
        orderType,
        storeId: Number(multiStoreId),
        buyTime: hongKongDateTime(observationContext.observedAt),
        version: 3,
      }),
      cache: "no-store",
    },
    fetchImpl,
  );
  return buildQmaiMenuSyncPayload(payload, observationContext.mealPeriod);
}

export function fetchMenuFromProvider(
  source: MenuSource,
  observationContext: MenuObservationContext,
  options: FetchMenuOptions = {},
): Promise<ProviderMenuObservation> {
  let payload: Promise<ProviderMenuObservation>;
  switch (source.provider) {
    case "aigens":
      payload = fetchAigensMenu(source.externalStoreId, options, source.config);
      break;
    case "ichef":
      payload = fetchIchefMenu(source.externalStoreId, options, source.config);
      break;
    case "pinme":
      payload = fetchPinmeMenu(source.externalStoreId, options, source.config);
      break;
    case "qmai":
      payload = fetchQmaiMenu(
        source.externalStoreId,
        { ...options, observationContext },
        source.config,
        source.externalOwnerId,
      );
      break;
  }
  return payload.then((result) => {
    const scopedResult =
      source.provider === "aigens" || source.provider === "pinme"
        ? {
            ...result,
            observationScope: {
              kind: "meal-period" as const,
              mealPeriod: observationContext.mealPeriod,
            },
          }
        : result;
    assertProviderMenuIdentitySnapshot(
      source.provider,
      source,
      scopedResult.items,
    );
    return scopedResult;
  });
}
