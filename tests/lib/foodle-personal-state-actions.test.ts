import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const returning = vi.fn();
  const onConflictDoUpdate = vi.fn(() => ({ returning }));
  const values = vi.fn((input: unknown) => {
    void input;
    return { onConflictDoUpdate };
  });
  const insert = vi.fn(() => ({ values }));
  const findFirst = vi.fn();
  return {
    findFirst,
    insert,
    values,
    onConflictDoUpdate,
    returning,
    getOptionalUser: vi.fn(),
    requireAuth: vi.fn(),
  };
});

vi.mock("@/db", () => ({
  db: {
    query: { foodleUserStates: { findFirst: mocks.findFirst } },
    insert: mocks.insert,
  },
}));
vi.mock("@/lib/auth-guard", () => ({
  getOptionalUser: mocks.getOptionalUser,
  requireAuth: mocks.requireAuth,
}));
vi.mock("server-only", () => ({}));

import {
  getFoodlePersonalSnapshot,
  migrateFoodleLocalStateAction,
  saveFoodleCandidateDecisionAction,
  saveFoodleMatchResultAction,
} from "@/lib/food-map/personal-state-actions";
import { emptyFoodlePersonalState } from "@/lib/food-map/personal-state";

const result = {
  restaurantId: "sht-mock-meal",
  candidateIds: ["sht-mock-meal", "foodle-sht-002"],
  sourceLabel: "沙田站 · 20 分钟范围",
  mode: "multi" as const,
  finalOpponentId: "foodle-sht-002",
  completedAt: "2026-08-04T08:00:00.000Z",
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.findFirst.mockResolvedValue(undefined);
  mocks.returning.mockImplementation(async () => {
    const values = mocks.values.mock.calls.at(-1)?.[0] as {
      decisions: unknown;
      matchResult: unknown;
    };
    return [values];
  });
});

describe("Foodle personal state actions", () => {
  it("keeps anonymous browsing independent from the account database", async () => {
    mocks.getOptionalUser.mockResolvedValue(null);

    await expect(getFoodlePersonalSnapshot()).resolves.toEqual({
      kind: "anonymous",
    });
    expect(mocks.findFirst).not.toHaveBeenCalled();
  });

  it("loads an empty account state when the user has no row yet", async () => {
    mocks.getOptionalUser.mockResolvedValue({ id: "user-1" });

    await expect(getFoodlePersonalSnapshot()).resolves.toEqual({
      kind: "authenticated",
      state: emptyFoodlePersonalState(),
    });
    expect(mocks.findFirst).toHaveBeenCalledTimes(1);
  });

  it("writes a candidate decision only to the authenticated user", async () => {
    mocks.requireAuth.mockResolvedValue({ id: "user-1" });

    const state = await saveFoodleCandidateDecisionAction(
      "sht-mock-meal",
      "saved",
    );

    expect(state.decisions.byRestaurantId["sht-mock-meal"]).toEqual({
      decision: "saved",
      decidedAt: expect.any(String),
    });
    expect(mocks.values).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        decisions: state.decisions,
      }),
    );
    await expect(
      saveFoodleCandidateDecisionAction("foreign-restaurant", "saved"),
    ).rejects.toThrow("餐厅资料已不可用");
  });

  it("persists only a valid completed Match result", async () => {
    mocks.requireAuth.mockResolvedValue({ id: "user-1" });

    await expect(saveFoodleMatchResultAction(result)).resolves.toMatchObject({
      matchResult: result,
    });
    await expect(
      saveFoodleMatchResultAction({
        ...result,
        restaurantId: "foreign-restaurant",
      }),
    ).rejects.toThrow("Match 结果无效");
  });

  it("migrates browser state only after the explicit migration action", async () => {
    mocks.requireAuth.mockResolvedValue({ id: "user-1" });
    mocks.findFirst.mockResolvedValue({
      decisions: emptyFoodlePersonalState().decisions,
      matchResult: null,
    });
    const local = {
      version: 1 as const,
      decisions: {
        version: 1 as const,
        byRestaurantId: {
          "foodle-sht-003": {
            decision: "saved" as const,
            decidedAt: "2026-08-04T07:00:00.000Z",
          },
        },
      },
      matchResult: result,
    };

    await expect(migrateFoodleLocalStateAction(local)).resolves.toEqual(local);
    expect(mocks.values).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        decisions: local.decisions,
        matchResult: result,
      }),
    );
  });

  it("surfaces account-data failures without blocking anonymous facts", async () => {
    mocks.getOptionalUser.mockResolvedValue({ id: "user-1" });
    mocks.findFirst.mockRejectedValue(new Error("database offline"));

    await expect(getFoodlePersonalSnapshot()).resolves.toEqual({
      kind: "unavailable",
      message: "个人选择暂时无法读取",
    });
  });
});
