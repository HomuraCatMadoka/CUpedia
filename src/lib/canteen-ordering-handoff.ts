import type {
  CanteenMenuSourceProvider,
  CanteenOrderingHandoffProvider,
} from "@/db/schema";

const EPHEMERAL_PARAMS = new Set([
  "sessionuuid",
  "orderid",
  "order_id",
  "paymentid",
  "payment_id",
  "token",
]);

export type OrderingHandoff = {
  provider: CanteenOrderingHandoffProvider;
  url: string;
};

export type MenuSourceOrderingLocator = {
  provider: CanteenMenuSourceProvider;
  externalStoreId: string;
  config?: Record<string, unknown> | null;
};

/**
 * Exact official entry URLs keyed by the menu-source locator already stored
 * in `canteen_menu_sources`. These preserve provider-specific mode/table
 * parameters instead of reconstructing a generic store URL.
 */
const KNOWN_MENU_SOURCE_HANDOFFS: Record<string, OrderingHandoff> = {
  "pinme:4898": {
    provider: "pinme",
    url: "https://meal.pin2eat.com/store/4898/takeout",
  },
  "pinme:5198": {
    provider: "pinme",
    url: "https://meal.pin2eat.com/store/5198/takeout",
  },
  "pinme:5203": {
    provider: "pinme",
    url: "https://meal.pin2eat.com/store/5203/takeout",
  },
  "pinme:5500": {
    provider: "pinme",
    url: "https://meal.pin2eat.com/store/5500/takeout",
  },
  "pinme:4899": {
    provider: "pinme",
    url: "https://meal.pin2eat.com/v2/package_store/pages/store/home?store_id=4899#index",
  },
  "pinme:5581": {
    provider: "pinme",
    url: "https://meal.pin2eat.com/v2/package_store/pages/store/home?store_id=5581",
  },
  "aigens:112891": {
    provider: "aigens",
    url: "https://csd.order.place/home/store/112891?_aigens_source=scan&catMode=false&mode=prekiosk",
  },
  "ichef:UQftKWxU": {
    provider: "ichef",
    url: "https://shop.ichefpos.com/store/UQftKWxU/instore/qrcode?tableName=VDE",
  },
};

function configString(
  config: Record<string, unknown> | null | undefined,
  key: string,
): string | null {
  const value = config?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function menuSourceLocatorKey(
  provider: string,
  externalStoreId: string,
): string {
  return `${provider}:${externalStoreId.trim()}`;
}

/** Official ordering URL derived from a persisted menu-source locator. */
export function orderingHandoffFromMenuSource(
  source: MenuSourceOrderingLocator | null | undefined,
): OrderingHandoff | null {
  if (!source) return null;
  const storeId = source.externalStoreId.trim();
  if (!storeId) return null;

  const known =
    KNOWN_MENU_SOURCE_HANDOFFS[
      menuSourceLocatorKey(source.provider, storeId)
    ];
  if (known) return known;

  switch (source.provider) {
    case "pinme":
      return {
        provider: "pinme",
        url: `https://meal.pin2eat.com/store/${encodeURIComponent(storeId)}/takeout`,
      };
    case "aigens": {
      const mode = configString(source.config, "menu") ?? "prekiosk";
      const url = new URL(
        `https://csd.order.place/home/store/${encodeURIComponent(storeId)}`,
      );
      url.searchParams.set("_aigens_source", "scan");
      url.searchParams.set("catMode", "false");
      url.searchParams.set("mode", mode);
      return { provider: "aigens", url: url.toString() };
    }
    case "ichef": {
      const tableName = configString(source.config, "tableName") ?? "VDE";
      const url = new URL(
        `https://shop.ichefpos.com/store/${encodeURIComponent(storeId)}/instore/qrcode`,
      );
      url.searchParams.set("tableName", tableName);
      return { provider: "ichef", url: url.toString() };
    }
    default:
      return null;
  }
}

export function parseOrderingHandoffUrl(value: unknown): string {
  if (typeof value !== "string" || value.length > 2_000) {
    throw new Error("INVALID_ORDERING_HANDOFF_URL");
  }
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error("INVALID_ORDERING_HANDOFF_URL");
  }
  if (url.protocol !== "https:")
    throw new Error("INSECURE_ORDERING_HANDOFF_URL");
  for (const key of url.searchParams.keys()) {
    if (EPHEMERAL_PARAMS.has(key.toLowerCase())) {
      throw new Error("EPHEMERAL_ORDERING_HANDOFF_URL");
    }
  }
  return url.toString();
}
