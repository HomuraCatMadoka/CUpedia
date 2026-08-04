import { describe, expect, it } from "vitest";

import {
  emptyFoodlePersonalState,
  hasFoodlePersonalState,
  mergeFoodlePersonalStates,
  parseFoodlePersonalState,
} from "@/lib/food-map/personal-state";

const saved = {
  version: 1 as const,
  byRestaurantId: {
    "sht-mock-meal": {
      decision: "saved" as const,
      decidedAt: "2026-08-01T08:00:00.000Z",
    },
  },
};

const result = {
  restaurantId: "sht-mock-meal",
  candidateIds: ["sht-mock-meal", "foodle-sht-002"],
  sourceLabel: "沙田站 · 20 分钟范围",
  mode: "multi" as const,
  finalOpponentId: "foodle-sht-002",
  completedAt: "2026-08-01T09:00:00.000Z",
};

describe("Foodle personal state", () => {
  it("starts empty and detects meaningful browser state", () => {
    expect(hasFoodlePersonalState(emptyFoodlePersonalState())).toBe(false);
    expect(
      hasFoodlePersonalState({
        version: 1,
        decisions: saved,
        matchResult: null,
      }),
    ).toBe(true);
  });

  it("sanitizes unknown account input instead of accepting foreign IDs", () => {
    expect(
      parseFoodlePersonalState({
        version: 1,
        decisions: {
          version: 1,
          byRestaurantId: {
            "sht-mock-meal": saved.byRestaurantId["sht-mock-meal"],
            "foreign-restaurant": {
              decision: "saved",
              decidedAt: "2026-08-01T08:00:00.000Z",
            },
          },
        },
        matchResult: {
          ...result,
          restaurantId: "foreign-restaurant",
        },
      }),
    ).toEqual({
      version: 1,
      decisions: saved,
      matchResult: null,
    });
  });

  it("merges only after an explicit choice and lets the newest record win", () => {
    const account = {
      version: 1 as const,
      decisions: saved,
      matchResult: result,
    };
    const local = {
      version: 1 as const,
      decisions: {
        version: 1 as const,
        byRestaurantId: {
          "sht-mock-meal": {
            decision: "passed" as const,
            decidedAt: "2026-08-02T08:00:00.000Z",
          },
          "foodle-sht-003": {
            decision: "saved" as const,
            decidedAt: "2026-08-02T07:00:00.000Z",
          },
        },
      },
      matchResult: {
        ...result,
        restaurantId: "foodle-sht-003",
        candidateIds: ["foodle-sht-003", "foodle-sht-004"],
        finalOpponentId: "foodle-sht-004",
        completedAt: "2026-08-02T09:00:00.000Z",
      },
    };

    expect(mergeFoodlePersonalStates(account, local)).toEqual(local);
  });
});
