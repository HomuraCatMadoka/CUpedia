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
import type { MenuSyncInput } from "@/lib/canteen-types";

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

type FetchMenuOptions = { fetchImpl?: typeof fetch };

export type MenuSource = {
  provider: CanteenMenuSourceProvider;
  externalStoreId: string;
  config?: CanteenMenuSourceConfig;
};

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
  const result = payload as { data?: unknown; errors?: unknown[] };
  if (result.errors?.length || !result.data)
    throw new Error("ICHEF_GRAPHQL_ERROR");
  return result.data as {
    restaurant?: {
      onlineOrderingMenu?: {
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

export async function fetchIchefMenu(
  externalStoreId: string,
  options: FetchMenuOptions = {},
): Promise<MenuSyncInput> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const common = { publicId: externalStoreId, platformType: ICHEF_PLATFORM };
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
  return buildIchefMenuSyncPayload(externalStoreId, menuHours, categories);
}

export async function fetchAigensMenu(
  externalStoreId: string,
  options: FetchMenuOptions = {},
): Promise<MenuSyncInput> {
  if (!/^\d+$/.test(externalStoreId))
    throw new Error("INVALID_AIGENS_STORE_ID");
  const url = new URL(
    `https://aigensstoreapp.appspot.com/api/v1/menu/store/${externalStoreId}.json`,
  );
  url.search = new URLSearchParams({
    locale: "default",
    open: "true",
    menu: "prekiosk",
    groupId: "1000",
    country: "hk",
  }).toString();
  const payload = await fetchJson(
    url.toString(),
    { cache: "no-store" },
    options.fetchImpl ?? fetch,
  );
  return buildAigensMenuSyncPayload(payload, externalStoreId);
}

export async function fetchPinmeMenu(
  externalStoreId: string,
  options: FetchMenuOptions = {},
): Promise<MenuSyncInput> {
  if (!/^\d+$/.test(externalStoreId)) throw new Error("INVALID_PINME_STORE_ID");
  const fetchImpl = options.fetchImpl ?? fetch;
  const headers = {
    "Store-id": externalStoreId,
    langcode: "zh-Hant",
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
    takeout: "1",
    order_sub_type: "1",
  });
  const payload = await fetchJson(
    `https://meal.pin2eat.com/api/home/product-menus?${query}`,
    {
      headers: { ...headers, Authorization: `Bearer ${token}` },
      cache: "no-store",
    },
    fetchImpl,
  );
  return buildPinmeMenuSyncPayload(payload, externalStoreId);
}

export function fetchMenuFromProvider(
  source: MenuSource,
  options: FetchMenuOptions = {},
): Promise<MenuSyncInput> {
  switch (source.provider) {
    case "aigens":
      return fetchAigensMenu(source.externalStoreId, options);
    case "ichef":
      return fetchIchefMenu(source.externalStoreId, options);
    case "pinme":
      return fetchPinmeMenu(source.externalStoreId, options);
    case "qmai":
      throw new Error("QMAI_MENU_SOURCE_NOT_SUPPORTED");
  }
}
