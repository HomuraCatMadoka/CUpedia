import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  isCanteenMockMode,
  mockCreateCanteen,
  mockDeleteAllMenuItems,
  mockDeleteCanteen,
  mockDeleteImpactForMenuItem,
  mockDeleteMenuItem,
  mockEnsureAnonSession,
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
    expect(canteens.map((c) => c.name).sort()).toEqual(
      ["演示食堂", "演示食堂乙", "演示食堂丙"].sort(),
    );
    const items = mockListMenuItems("mock-canteen-demo");
    expect(items.length).toBeGreaterThanOrEqual(20);
    expect(items.some((i) => i.id === "mock-item-demo")).toBe(true);
    expect(
      new Set(items.flatMap((i) => i.mealPeriods)),
    ).toEqual(new Set(["breakfast", "lunch", "dinner"]));
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
    const canteen = mockListCanteens()[0];
    const item = mockListMenuItems(canteen.id)[0];
    mockEnsureAnonSession();
    mockUpsertDishVote(item.id, "like");
    mockDeleteMenuItem(canteen.id, item.id);
    expect(mockDeleteImpactForMenuItem(item.id).voteCount).toBe(0);
  });

  it("deletes all menu items for a canteen", () => {
    const canteen = mockListCanteens()[0];
    const before = mockListMenuItems(canteen.id).length;
    expect(before).toBeGreaterThan(0);
    const result = mockDeleteAllMenuItems(canteen.id);
    expect(result.deletedCount).toBe(before);
    expect(mockListMenuItems(canteen.id)).toHaveLength(0);
  });
});
