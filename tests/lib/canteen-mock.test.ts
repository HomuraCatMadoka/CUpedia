import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  isCanteenMockMode,
  mockCreateCanteen,
  mockCreateDishComment,
  mockDeleteAllMenuItems,
  mockDeleteCanteen,
  mockDeleteImpactForMenuItem,
  mockDeleteMenuItem,
  mockEnsureAnonSession,
  mockGetCommentsForMenuItem,
  mockListCanteens,
  mockListMenuItems,
  mockUpsertDishVote,
  resetCanteenMockState,
} from "@/lib/canteen-mock";

describe("canteen-mock", () => {
  const prev = process.env.CANTEEN_MOCK_DATA;

  beforeEach(() => {
    process.env.CANTEEN_MOCK_DATA = "true";
    resetCanteenMockState();
  });

  afterEach(() => {
    process.env.CANTEEN_MOCK_DATA = prev;
    resetCanteenMockState();
  });

  it("detects mock mode from env", () => {
    expect(isCanteenMockMode()).toBe(true);
    process.env.CANTEEN_MOCK_DATA = "false";
    expect(isCanteenMockMode()).toBe(false);
  });

  it("seeds demo canteens with dishes across meal periods and categories", () => {
    const canteens = mockListCanteens();
    expect(canteens).toHaveLength(20);
    expect(
      canteens.every((canteen) => canteen.name.startsWith("演示食堂")),
    ).toBe(true);
    const items = mockListMenuItems("mock-canteen-demo");
    expect(items.length).toBeGreaterThanOrEqual(100);
    expect(items.some((i) => i.id === "mock-item-demo")).toBe(true);
    expect(items.some((i) => (i.pricing?.options.length ?? 0) >= 5)).toBe(true);
    expect(items.some((i) => i.mealPeriods.length > 1)).toBe(true);
    expect(new Set(items.flatMap((i) => i.mealPeriods))).toEqual(
      new Set(["breakfast", "lunch", "dinner"]),
    );
    expect(new Set(items.map((i) => i.svgKey)).size).toBeGreaterThan(3);
  });

  it("creates and deletes canteens in memory", () => {
    const created = mockCreateCanteen({ name: "测试食堂", location: "A" });
    expect(mockListCanteens().some((c) => c.id === created.id)).toBe(true);
    mockDeleteCanteen(created.id);
    expect(mockListCanteens().some((c) => c.id === created.id)).toBe(false);
  });

  it("reports vote rows in menu item delete impact", () => {
    mockEnsureAnonSession();
    mockUpsertDishVote("mock-item-demo", "like");
    expect(mockDeleteImpactForMenuItem("mock-item-demo").voteCount).toBe(1);
  });

  it("drops vote rows when a menu item is deleted", () => {
    const canteenId = "mock-canteen-demo";
    const item = mockListMenuItems(canteenId)[0];
    mockEnsureAnonSession();
    mockUpsertDishVote(item.id, "like");
    mockDeleteMenuItem(canteenId, item.id);
    expect(mockDeleteImpactForMenuItem(item.id).voteCount).toBe(0);
  });

  it("deletes all menu items for a canteen", () => {
    const canteenId = "mock-canteen-demo";
    const otherCanteenId = "mock-canteen-demo-b";
    const targetItem = mockListMenuItems(canteenId)[0];
    const otherItem = mockListMenuItems(otherCanteenId)[0];
    const before = mockListMenuItems(canteenId).length;
    const otherBefore = mockListMenuItems(otherCanteenId).length;
    expect(before).toBeGreaterThan(0);

    mockEnsureAnonSession();
    mockUpsertDishVote(targetItem.id, "like");
    mockUpsertDishVote(otherItem.id, "like");
    mockCreateDishComment(
      targetItem.id,
      "target-user",
      "演示用户",
      "target@example.com",
      "目标评论",
    );
    mockCreateDishComment(
      otherItem.id,
      "other-user",
      "演示用户",
      "other@example.com",
      "保留评论",
    );

    const result = mockDeleteAllMenuItems(canteenId);

    expect(result.deletedCount).toBe(before);
    expect(mockListMenuItems(canteenId)).toHaveLength(0);
    expect(mockDeleteImpactForMenuItem(targetItem.id)).toMatchObject({
      voteCount: 0,
      commentCount: 0,
    });
    expect(mockListMenuItems(otherCanteenId)).toHaveLength(otherBefore);
    expect(mockDeleteImpactForMenuItem(otherItem.id)).toMatchObject({
      voteCount: 1,
      commentCount: 1,
    });
    expect(mockGetCommentsForMenuItem(otherItem.id)).toHaveLength(1);
  });
});
