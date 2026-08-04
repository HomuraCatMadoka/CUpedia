import type { FoodleRestaurant } from "@/lib/food-map/restaurant-catalog";

export const FOODLE_MATCH_STORAGE_KEY = "cupedia:foodle-match:v1";

export type MatchSide = "left" | "right";

export interface FoodleMatchSession {
  candidateIds: readonly string[];
  sourceLabel: string;
  championId: string;
  championSide: MatchSide;
  challengerIndex: number;
}

export interface FoodleMatchResult {
  restaurantId: string;
  candidateIds: readonly string[];
  sourceLabel: string;
  mode: "single" | "multi";
  finalOpponentId: string | null;
  completedAt: string;
}

export type FoodleMatchStart =
  | { kind: "empty" }
  | { kind: "comparison"; session: FoodleMatchSession }
  | { kind: "result"; result: FoodleMatchResult };

export type FoodleMatchChoice = Exclude<FoodleMatchStart, { kind: "empty" }>;

export interface FoodleMatchStore {
  version: 1;
  result: FoodleMatchResult | null;
}

export interface MatchComparisonValue {
  primary: string;
  secondary?: string;
}

export interface MatchComparisonRow {
  key: "commute" | "price" | "opening" | "score" | "community";
  label: string;
  labelSub?: string;
  left: MatchComparisonValue;
  right: MatchComparisonValue;
}

export interface MatchDifference {
  key: "commute" | "price" | "score" | "checkins";
  text: string;
  accessibleText: string;
}

export interface MatchComparison {
  differences: readonly MatchDifference[];
  rows: readonly MatchComparisonRow[];
}

function uniqueIds(candidateIds: readonly string[]) {
  return [...new Set(candidateIds.filter(Boolean))];
}

export interface StartFoodleMatchOptions {
  random?: () => number;
  championSide?: MatchSide;
}

function shuffledIds(candidateIds: readonly string[], random: () => number) {
  const shuffled = uniqueIds(candidateIds);
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [
      shuffled[swapIndex],
      shuffled[index],
    ];
  }
  return shuffled;
}

function createResult(
  restaurantId: string,
  candidateIds: readonly string[],
  sourceLabel: string,
  mode: FoodleMatchResult["mode"],
  finalOpponentId: string | null,
  completedAt: string,
): FoodleMatchResult {
  return {
    restaurantId,
    candidateIds,
    sourceLabel,
    mode,
    finalOpponentId,
    completedAt,
  };
}

export function startFoodleMatch(
  candidateIds: readonly string[],
  sourceLabel: string,
  completedAt = new Date().toISOString(),
  options: StartFoodleMatchOptions = {},
): FoodleMatchStart {
  const random = options.random ?? Math.random;
  const eligibleIds = shuffledIds(candidateIds, random);
  if (eligibleIds.length === 0) return { kind: "empty" };
  if (eligibleIds.length === 1) {
    return {
      kind: "result",
      result: createResult(
        eligibleIds[0],
        eligibleIds,
        sourceLabel,
        "single",
        null,
        completedAt,
      ),
    };
  }

  return {
    kind: "comparison",
    session: {
      candidateIds: eligibleIds,
      sourceLabel,
      championId: eligibleIds[0],
      championSide: options.championSide ?? (random() < 0.5 ? "left" : "right"),
      challengerIndex: 1,
    },
  };
}

export function getFoodleMatchPair(
  session: FoodleMatchSession,
): readonly [string, string] | null {
  const challengerId = session.candidateIds[session.challengerIndex];
  if (!challengerId) return null;
  return session.championSide === "left"
    ? [session.championId, challengerId]
    : [challengerId, session.championId];
}

export function chooseFoodleMatch(
  session: FoodleMatchSession,
  winnerId: string,
  completedAt = new Date().toISOString(),
): FoodleMatchChoice {
  const pair = getFoodleMatchPair(session);
  if (!pair || !pair.includes(winnerId)) {
    return { kind: "comparison", session };
  }

  const winnerSide: MatchSide = pair[0] === winnerId ? "left" : "right";
  const loserId = pair[0] === winnerId ? pair[1] : pair[0];
  if (session.challengerIndex === session.candidateIds.length - 1) {
    return {
      kind: "result",
      result: createResult(
        winnerId,
        session.candidateIds,
        session.sourceLabel,
        "multi",
        loserId,
        completedAt,
      ),
    };
  }

  return {
    kind: "comparison",
    session: {
      ...session,
      championId: winnerId,
      championSide: winnerSide,
      challengerIndex: session.challengerIndex + 1,
    },
  };
}

function number(value: number | null) {
  return value === null || !Number.isFinite(value) ? null : value;
}

function totalCommute(restaurant: FoodleRestaurant, mtrMinutes: number) {
  const walk = number(restaurant.foodle.walkMinutes);
  return walk === null || !Number.isFinite(mtrMinutes)
    ? null
    : mtrMinutes + walk;
}

function priceMidpoint(price: string | null) {
  if (!price) return null;
  const values = price.match(/\d+/gu)?.map(Number) ?? [];
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function openingLabel(restaurant: FoodleRestaurant) {
  if (restaurant.sourceFacts.openingLabel) {
    return restaurant.sourceFacts.openingLabel;
  }
  if (restaurant.sourceFacts.openingState === "open") return "营业中";
  if (restaurant.sourceFacts.openingState === "closed") return "已休息";
  return "资料暂缺";
}

function commuteValue(restaurant: FoodleRestaurant, mtrMinutes: number) {
  const walk = number(restaurant.foodle.walkMinutes);
  const total = totalCommute(restaurant, mtrMinutes);
  return {
    primary: total === null ? "暂缺" : `${total} 分钟`,
    secondary: `港铁 ${mtrMinutes} · 步行 ${walk === null ? "暂缺" : walk}`,
  };
}

function scoreValue(restaurant: FoodleRestaurant) {
  const score = number(restaurant.foodle.averageScore);
  return { primary: score === null ? "暂缺" : score.toFixed(1) };
}

function communityValue(restaurant: FoodleRestaurant) {
  const visitors = number(restaurant.foodle.uniqueVisitors);
  const checkins = number(restaurant.foodle.totalCheckins);
  return {
    primary: visitors === null ? "到访暂缺" : `${visitors} 人到访`,
    secondary: checkins === null ? "打卡暂缺" : `${checkins} 次打卡`,
  };
}

function namedDifference(
  key: MatchDifference["key"],
  owner: FoodleRestaurant,
  shortFact: string,
  spokenFact: string,
): MatchDifference {
  return {
    key,
    text: `${owner.sourceFacts.name}${shortFact}`,
    accessibleText: `${owner.sourceFacts.name}${spokenFact}`,
  };
}

export function buildMatchComparison(
  left: FoodleRestaurant,
  right: FoodleRestaurant,
  leftMtrMinutes: number,
  rightMtrMinutes: number,
): MatchComparison {
  const leftTotal = totalCommute(left, leftMtrMinutes);
  const rightTotal = totalCommute(right, rightMtrMinutes);
  const leftPrice = priceMidpoint(left.sourceFacts.priceRange);
  const rightPrice = priceMidpoint(right.sourceFacts.priceRange);
  const leftScore = number(left.foodle.averageScore);
  const rightScore = number(right.foodle.averageScore);
  const leftCheckins = number(left.foodle.totalCheckins);
  const rightCheckins = number(right.foodle.totalCheckins);
  const differences: MatchDifference[] = [];

  if (
    leftTotal !== null &&
    rightTotal !== null &&
    Math.abs(leftTotal - rightTotal) >= 2
  ) {
    differences.push(
      namedDifference(
        "commute",
        leftTotal < rightTotal ? left : right,
        `快 ${Math.abs(leftTotal - rightTotal)} 分`,
        `总通勤少 ${Math.abs(leftTotal - rightTotal)} 分钟`,
      ),
    );
  }
  if (
    leftPrice !== null &&
    rightPrice !== null &&
    Math.abs(leftPrice - rightPrice) >= 8
  ) {
    differences.push(
      namedDifference(
        "price",
        leftPrice < rightPrice ? left : right,
        `平 HK$${Math.round(Math.abs(leftPrice - rightPrice))}`,
        `价格低 HK$${Math.round(Math.abs(leftPrice - rightPrice))}`,
      ),
    );
  }
  if (
    leftScore !== null &&
    rightScore !== null &&
    Math.min(leftCheckins ?? 0, rightCheckins ?? 0) >= 5 &&
    Math.abs(leftScore - rightScore) >= 0.3
  ) {
    differences.push(
      namedDifference(
        "score",
        leftScore > rightScore ? left : right,
        `高 ${Math.abs(leftScore - rightScore).toFixed(1)}`,
        `Foodle 平均分高 ${Math.abs(leftScore - rightScore).toFixed(1)}`,
      ),
    );
  }
  if (
    leftCheckins !== null &&
    rightCheckins !== null &&
    Math.abs(leftCheckins - rightCheckins) >= 10
  ) {
    differences.push(
      namedDifference(
        "checkins",
        leftCheckins > rightCheckins ? left : right,
        `多 ${Math.abs(leftCheckins - rightCheckins)} 次打卡`,
        `累计打卡多 ${Math.abs(leftCheckins - rightCheckins)} 次`,
      ),
    );
  }

  return {
    differences: differences.slice(0, 2),
    rows: [
      {
        key: "commute",
        label: "通勤",
        labelSub: "港铁 + 步行",
        left: commuteValue(left, leftMtrMinutes),
        right: commuteValue(right, rightMtrMinutes),
      },
      {
        key: "price",
        label: "价格",
        left: { primary: left.sourceFacts.priceRange ?? "暂缺" },
        right: { primary: right.sourceFacts.priceRange ?? "暂缺" },
      },
      {
        key: "opening",
        label: "营业",
        left: { primary: openingLabel(left) },
        right: { primary: openingLabel(right) },
      },
      {
        key: "score",
        label: "Foodle 分",
        left: scoreValue(left),
        right: scoreValue(right),
      },
      {
        key: "community",
        label: "打卡",
        labelSub: "到访 / 记录",
        left: communityValue(left),
        right: communityValue(right),
      },
    ],
  };
}

export function emptyFoodleMatchStore(): FoodleMatchStore {
  return { version: 1, result: null };
}

export function saveFoodleMatchResult(
  store: FoodleMatchStore,
  result: FoodleMatchResult,
): FoodleMatchStore {
  return { ...store, result };
}

export function serializeFoodleMatchStore(store: FoodleMatchStore) {
  return JSON.stringify(store);
}

function validResult(value: unknown): value is FoodleMatchResult {
  if (!value || typeof value !== "object") return false;
  const result = value as Partial<FoodleMatchResult>;
  if (
    typeof result.restaurantId !== "string" ||
    !Array.isArray(result.candidateIds) ||
    !result.candidateIds.every((id) => typeof id === "string") ||
    !result.candidateIds.includes(result.restaurantId) ||
    typeof result.sourceLabel !== "string" ||
    (result.mode !== "single" && result.mode !== "multi") ||
    !(
      result.finalOpponentId === null ||
      typeof result.finalOpponentId === "string"
    ) ||
    typeof result.completedAt !== "string"
  ) {
    return false;
  }
  const ids = uniqueIds(result.candidateIds);
  if (ids.length !== result.candidateIds.length) return false;
  if (result.mode === "single") {
    return ids.length === 1 && result.finalOpponentId === null;
  }
  return (
    ids.length >= 2 &&
    typeof result.finalOpponentId === "string" &&
    ids.includes(result.finalOpponentId) &&
    result.finalOpponentId !== result.restaurantId
  );
}

export function parseFoodleMatchStore(value: string | null): FoodleMatchStore {
  if (!value) return emptyFoodleMatchStore();
  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== "object") return emptyFoodleMatchStore();
    const store = parsed as { version?: unknown; result?: unknown };
    if (store.version !== 1 || !validResult(store.result)) {
      return emptyFoodleMatchStore();
    }
    return { version: 1, result: store.result };
  } catch {
    return emptyFoodleMatchStore();
  }
}

export function googleMapsUrlFor(
  restaurant: FoodleRestaurant,
  stationName: string,
) {
  const query = encodeURIComponent(
    `${restaurant.sourceFacts.name} ${stationName} 香港`,
  );
  return `https://www.google.com/maps/search/?api=1&query=${query}`;
}

export function openRiceUrlFor(restaurant: FoodleRestaurant) {
  if (restaurant.source.url) return restaurant.source.url;
  return `https://www.openrice.com/zh/hongkong/restaurants?what=${encodeURIComponent(
    restaurant.sourceFacts.name,
  )}`;
}
