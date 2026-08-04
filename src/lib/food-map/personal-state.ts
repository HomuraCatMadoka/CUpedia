import {
  emptyCandidateDecisionStore,
  parseCandidateDecisionStore,
  type CandidateDecisionStore,
} from "@/lib/food-map/candidate-decisions";
import {
  parseFoodleMatchStore,
  type FoodleMatchResult,
} from "@/lib/food-map/match";
import { FOODLE_RESTAURANTS } from "@/lib/food-map/restaurant-catalog";

export interface FoodlePersonalState {
  version: 1;
  decisions: CandidateDecisionStore;
  matchResult: FoodleMatchResult | null;
}

export type FoodlePersonalSnapshot =
  | { kind: "anonymous" }
  | { kind: "authenticated"; state: FoodlePersonalState }
  | { kind: "unavailable"; message: string };

const restaurantIds = new Set(
  FOODLE_RESTAURANTS.map((restaurant) => restaurant.id),
);

function validDate(value: string) {
  return Number.isFinite(Date.parse(value));
}

export function emptyFoodlePersonalState(): FoodlePersonalState {
  return {
    version: 1,
    decisions: emptyCandidateDecisionStore(),
    matchResult: null,
  };
}

export function parseFoodlePersonalState(input: unknown): FoodlePersonalState {
  if (!input || typeof input !== "object") return emptyFoodlePersonalState();
  const raw = input as {
    version?: unknown;
    decisions?: unknown;
    matchResult?: unknown;
  };
  if (raw.version !== 1) return emptyFoodlePersonalState();

  const parsedDecisions = parseCandidateDecisionStore(
    JSON.stringify(raw.decisions ?? null),
  );
  const byRestaurantId = Object.fromEntries(
    Object.entries(parsedDecisions.byRestaurantId).filter(
      ([restaurantId, value]) =>
        restaurantIds.has(restaurantId) && validDate(value.decidedAt),
    ),
  );
  const parsedMatch = parseFoodleMatchStore(
    JSON.stringify({ version: 1, result: raw.matchResult ?? null }),
  ).result;
  const matchResult =
    parsedMatch &&
    validDate(parsedMatch.completedAt) &&
    parsedMatch.candidateIds.every((id) => restaurantIds.has(id))
      ? parsedMatch
      : null;

  return {
    version: 1,
    decisions: { version: 1, byRestaurantId },
    matchResult,
  };
}

export function hasFoodlePersonalState(state: FoodlePersonalState) {
  return (
    Object.keys(state.decisions.byRestaurantId).length > 0 ||
    state.matchResult !== null
  );
}

function newer<T>(
  first: T | null,
  second: T | null,
  date: (value: T) => string,
) {
  if (!first) return second;
  if (!second) return first;
  return Date.parse(date(second)) > Date.parse(date(first)) ? second : first;
}

export function mergeFoodlePersonalStates(
  accountInput: unknown,
  localInput: unknown,
): FoodlePersonalState {
  const account = parseFoodlePersonalState(accountInput);
  const local = parseFoodlePersonalState(localInput);
  const restaurantIds = new Set([
    ...Object.keys(account.decisions.byRestaurantId),
    ...Object.keys(local.decisions.byRestaurantId),
  ]);
  const byRestaurantId: CandidateDecisionStore["byRestaurantId"] = {};

  for (const restaurantId of restaurantIds) {
    const record = newer(
      account.decisions.byRestaurantId[restaurantId] ?? null,
      local.decisions.byRestaurantId[restaurantId] ?? null,
      (value) => value.decidedAt,
    );
    if (record) byRestaurantId[restaurantId] = record;
  }

  return {
    version: 1,
    decisions: { version: 1, byRestaurantId },
    matchResult: newer(
      account.matchResult,
      local.matchResult,
      (value) => value.completedAt,
    ),
  };
}
