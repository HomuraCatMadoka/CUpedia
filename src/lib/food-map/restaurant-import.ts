import { MTR_STATIONS, type MtrStationId } from "@/lib/food-map/data";
import type {
  FoodleRestaurant,
  RestaurantOpeningState,
} from "@/lib/food-map/restaurant-catalog";

const STALE_AFTER_MS = 30 * 24 * 60 * 60 * 1000;
const stationIds = new Set(MTR_STATIONS.map((station) => station.id));
const openingStates = new Set<RestaurantOpeningState>([
  "open",
  "closed",
  "unknown",
]);

export type RestaurantImportIssueCode =
  | "invalid_snapshot"
  | "invalid_row"
  | "duplicate_foodle_id"
  | "duplicate_provider_record"
  | "unsupported_opening_state"
  | "unsupported_station";

export interface RestaurantImportIssue {
  row: number;
  code: RestaurantImportIssueCode;
  message: string;
}

export interface FoodleRestaurantImport {
  provider: "openrice" | null;
  acquiredAt: string | null;
  restaurants: readonly FoodleRestaurant[];
  issues: readonly RestaurantImportIssue[];
  status: "ready" | "partial" | "failed";
}

export type FoodleCatalogState =
  | "ready"
  | "partial"
  | "stale"
  | "empty"
  | "failed";

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function isoDate(value: unknown): string | null {
  const text = nonEmptyString(value);
  return text && Number.isFinite(Date.parse(text)) ? text : null;
}

function nullableString(value: unknown): string | null | undefined {
  if (value === null) return null;
  return typeof value === "string" ? value : undefined;
}

function nullableNumber(
  value: unknown,
  options: { integer?: boolean; min?: number; max?: number } = {},
): number | null | undefined {
  if (value === null) return null;
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  if (options.integer && !Number.isInteger(value)) return undefined;
  if (options.min !== undefined && value < options.min) return undefined;
  if (options.max !== undefined && value > options.max) return undefined;
  return value;
}

function nullableStrings(value: unknown): readonly string[] | null | undefined {
  if (value === null) return null;
  if (
    !Array.isArray(value) ||
    !value.every((item) => typeof item === "string")
  ) {
    return undefined;
  }
  return value;
}

function canonicalUrl(value: unknown): string | null | undefined {
  if (value === null) return null;
  if (typeof value !== "string") return undefined;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:"
      ? value
      : undefined;
  } catch {
    return undefined;
  }
}

function issue(
  row: number,
  code: RestaurantImportIssueCode,
  message: string,
): RestaurantImportIssue {
  return { row, code, message };
}

export function importFoodleRestaurantSnapshot(
  input: unknown,
): FoodleRestaurantImport {
  const snapshot = record(input);
  if (
    !snapshot ||
    snapshot.version !== 1 ||
    snapshot.provider !== "openrice" ||
    !isoDate(snapshot.acquired_at) ||
    !Array.isArray(snapshot.restaurants)
  ) {
    return {
      provider: null,
      acquiredAt: null,
      restaurants: [],
      issues: [issue(0, "invalid_snapshot", "快照格式或来源不受支持")],
      status: "failed",
    };
  }

  const acquiredAt = snapshot.acquired_at as string;
  const restaurants: FoodleRestaurant[] = [];
  const issues: RestaurantImportIssue[] = [];
  const foodleIds = new Set<string>();
  const providerIds = new Set<string>();

  for (const [index, value] of snapshot.restaurants.entries()) {
    const rowNumber = index + 1;
    const raw = record(value);
    if (!raw) {
      issues.push(issue(rowNumber, "invalid_row", "餐厅记录不是对象"));
      continue;
    }

    const foodleId = nonEmptyString(raw.foodle_id);
    const providerId = nonEmptyString(raw.provider_record_id);
    const updatedAt = isoDate(raw.updated_at);
    const name = nonEmptyString(raw.name);
    const url = canonicalUrl(raw.canonical_url);
    const cuisines = nullableStrings(raw.cuisines);
    const priceRange = nullableString(raw.price_range);
    const openingState = nonEmptyString(raw.opening_state);
    const openingLabel = nullableString(raw.opening_label);
    const imageUrls = nullableStrings(raw.image_urls);
    const stationId = nonEmptyString(raw.station_id);
    const walkMinutes = nullableNumber(raw.walk_minutes, {
      integer: true,
      min: 0,
      max: 90,
    });
    const averageScore = nullableNumber(raw.average_score, { min: 0, max: 5 });
    const uniqueVisitors = nullableNumber(raw.unique_visitors, {
      integer: true,
      min: 0,
    });
    const totalCheckins = nullableNumber(raw.total_checkins, {
      integer: true,
      min: 0,
    });

    if (
      openingState &&
      !openingStates.has(openingState as RestaurantOpeningState)
    ) {
      issues.push(
        issue(rowNumber, "unsupported_opening_state", "营业状态不受支持"),
      );
      continue;
    }
    if (stationId && !stationIds.has(stationId as MtrStationId)) {
      issues.push(
        issue(rowNumber, "unsupported_station", "港铁站编号不受支持"),
      );
      continue;
    }
    if (foodleId && foodleIds.has(foodleId)) {
      issues.push(
        issue(rowNumber, "duplicate_foodle_id", "Foodle 餐厅编号重复"),
      );
      continue;
    }
    if (providerId && providerIds.has(providerId)) {
      issues.push(
        issue(rowNumber, "duplicate_provider_record", "来源餐厅编号重复"),
      );
      continue;
    }

    if (
      !foodleId ||
      !providerId ||
      !updatedAt ||
      !name ||
      url === undefined ||
      cuisines === undefined ||
      priceRange === undefined ||
      !openingState ||
      openingLabel === undefined ||
      imageUrls === undefined ||
      !stationId ||
      walkMinutes === undefined ||
      averageScore === undefined ||
      uniqueVisitors === undefined ||
      totalCheckins === undefined
    ) {
      issues.push(issue(rowNumber, "invalid_row", "餐厅记录含无效或缺失字段"));
      continue;
    }

    foodleIds.add(foodleId);
    providerIds.add(providerId);
    restaurants.push({
      id: foodleId,
      source: {
        provider: "openrice",
        externalId: providerId,
        url,
        imageUrls: imageUrls ?? [],
        acquiredAt,
        updatedAt,
      },
      sourceFacts: {
        name,
        cuisines,
        priceRange,
        openingState: openingState as RestaurantOpeningState,
        openingLabel,
      },
      foodle: {
        stationId: stationId as MtrStationId,
        walkMinutes,
        averageScore,
        uniqueVisitors,
        totalCheckins,
      },
    });
  }

  return {
    provider: "openrice",
    acquiredAt,
    restaurants,
    issues,
    status:
      issues.length === 0
        ? "ready"
        : restaurants.length > 0
          ? "partial"
          : "failed",
  };
}

export function getFoodleCatalogState(
  imported: FoodleRestaurantImport,
  now = new Date(),
): FoodleCatalogState {
  if (imported.status === "failed") return "failed";
  if (imported.restaurants.length === 0) return "empty";
  if (
    imported.acquiredAt &&
    now.getTime() - Date.parse(imported.acquiredAt) > STALE_AFTER_MS
  ) {
    return "stale";
  }
  return imported.status;
}
