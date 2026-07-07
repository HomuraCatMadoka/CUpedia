import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  isCanteenMockMode,
  mockCreateCanteen,
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

  it("seeds a minimal demo canteen with one dish per meal period", () => {
    const canteens = mockListCanteens();
    expect(canteens).toHaveLength(1);
    expect(canteens[0].name).toBe("演示食堂");
    const items = mockListMenuItems(canteens[0].id);
    expect(items).toHaveLength(3);
    expect(items.map((i) => i.mealPeriod)).toEqual([
      "breakfast",
      "lunch",
      "dinner",
    ]);
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
});
