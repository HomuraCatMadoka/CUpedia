"use server";

import { eq } from "drizzle-orm";

import { db } from "@/db";
import { foodleUserStates } from "@/db/schema";
import { getOptionalUser, requireAuth } from "@/lib/auth-guard";
import {
  decideCandidate,
  type CandidateDecision,
} from "@/lib/food-map/candidate-decisions";
import type { FoodleMatchResult } from "@/lib/food-map/match";
import {
  emptyFoodlePersonalState,
  mergeFoodlePersonalStates,
  parseFoodlePersonalState,
  type FoodlePersonalSnapshot,
  type FoodlePersonalState,
} from "@/lib/food-map/personal-state";
import { FOODLE_RESTAURANTS } from "@/lib/food-map/restaurant-catalog";

const restaurantIds = new Set(
  FOODLE_RESTAURANTS.map((restaurant) => restaurant.id),
);

async function readForUser(userId: string): Promise<FoodlePersonalState> {
  const row = await db.query.foodleUserStates.findFirst({
    where: eq(foodleUserStates.userId, userId),
    columns: { decisions: true, matchResult: true },
  });
  return row
    ? parseFoodlePersonalState({
        version: 1,
        decisions: row.decisions,
        matchResult: row.matchResult,
      })
    : emptyFoodlePersonalState();
}

async function writeForUser(
  userId: string,
  input: unknown,
): Promise<FoodlePersonalState> {
  const state = parseFoodlePersonalState(input);
  const [saved] = await db
    .insert(foodleUserStates)
    .values({
      userId,
      decisions: state.decisions,
      matchResult: state.matchResult,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: foodleUserStates.userId,
      set: {
        decisions: state.decisions,
        matchResult: state.matchResult,
        updatedAt: new Date(),
      },
    })
    .returning({
      decisions: foodleUserStates.decisions,
      matchResult: foodleUserStates.matchResult,
    });

  return saved ? parseFoodlePersonalState({ version: 1, ...saved }) : state;
}

export async function getFoodlePersonalSnapshot(): Promise<FoodlePersonalSnapshot> {
  try {
    const user = await getOptionalUser();
    if (!user?.id) return { kind: "anonymous" };
    return { kind: "authenticated", state: await readForUser(user.id) };
  } catch {
    return {
      kind: "unavailable",
      message: "个人选择暂时无法读取",
    };
  }
}

export async function saveFoodleCandidateDecisionAction(
  restaurantId: string,
  decision: CandidateDecision,
) {
  const user = await requireAuth();
  if (!restaurantIds.has(restaurantId)) {
    throw new Error("餐厅资料已不可用");
  }
  if (decision !== "saved" && decision !== "passed") {
    throw new Error("选择无效");
  }
  const current = await readForUser(user.id);
  return writeForUser(user.id, {
    ...current,
    decisions: decideCandidate(current.decisions, restaurantId, decision),
  });
}

export async function saveFoodleMatchResultAction(input: FoodleMatchResult) {
  const user = await requireAuth();
  const parsed = parseFoodlePersonalState({
    version: 1,
    decisions: emptyFoodlePersonalState().decisions,
    matchResult: input,
  }).matchResult;
  if (!parsed) throw new Error("Match 结果无效");
  const current = await readForUser(user.id);
  return writeForUser(user.id, { ...current, matchResult: parsed });
}

export async function migrateFoodleLocalStateAction(input: unknown) {
  const user = await requireAuth();
  const current = await readForUser(user.id);
  return writeForUser(user.id, mergeFoodlePersonalStates(current, input));
}
