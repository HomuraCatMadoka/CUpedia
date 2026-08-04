import type { CandidateDecision } from "@/lib/food-map/candidate-decisions";
import {
  FOOD_MAP_BUDGETS,
  MTR_STATIONS,
  type FoodMapBudget,
  type MtrStationId,
} from "@/lib/food-map/data";
import { FOODLE_RESTAURANTS } from "@/lib/food-map/restaurant-catalog";

export const FOODLE_PENDING_INTENT_STORAGE_KEY =
  "cupedia:foodle-pending-intent:v1";

const MAX_AGE_MS = 24 * 60 * 60 * 1000;
const restaurantIds = new Set(
  FOODLE_RESTAURANTS.map((restaurant) => restaurant.id),
);
const stationIds = new Set(MTR_STATIONS.map((station) => station.id));
const budgets = new Set<number>(FOOD_MAP_BUDGETS);

export interface FoodlePendingIntent {
  version: 1;
  restaurantId: string;
  decision: CandidateDecision;
  budget: FoodMapBudget;
  stationId: MtrStationId | null;
  createdAt: string;
}

export function parseFoodlePendingIntent(
  value: string | null,
  now = new Date(),
): FoodlePendingIntent | null {
  if (!value) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== "object") return null;
    const intent = parsed as Partial<FoodlePendingIntent>;
    const createdAt = Date.parse(intent.createdAt ?? "");
    if (
      intent.version !== 1 ||
      typeof intent.restaurantId !== "string" ||
      !restaurantIds.has(intent.restaurantId) ||
      (intent.decision !== "saved" && intent.decision !== "passed") ||
      typeof intent.budget !== "number" ||
      !budgets.has(intent.budget) ||
      !(
        intent.stationId === null ||
        (typeof intent.stationId === "string" &&
          stationIds.has(intent.stationId))
      ) ||
      !Number.isFinite(createdAt) ||
      createdAt > now.getTime() + 5 * 60 * 1000 ||
      now.getTime() - createdAt > MAX_AGE_MS
    ) {
      return null;
    }
    return intent as FoodlePendingIntent;
  } catch {
    return null;
  }
}

export function serializeFoodlePendingIntent(intent: FoodlePendingIntent) {
  return JSON.stringify(intent);
}

export function safeFoodleLoginReturnPath(value: string | null) {
  if (
    !value ||
    !(
      value === "/food-map" ||
      value.startsWith("/food-map?") ||
      value.startsWith("/food-map#")
    )
  ) {
    return "/";
  }
  if (value.startsWith("//") || value.includes("\\")) return "/";
  return value;
}
