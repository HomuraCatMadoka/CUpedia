import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  isCanteenMockMode,
  mockCreateCanteen,
  mockDeleteCanteen,
  mockListCanteens,
  mockListMenuItems,
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

  it("seeds demo canteens and menu items", () => {
    const canteens = mockListCanteens();
    expect(canteens.length).toBeGreaterThanOrEqual(2);
    const items = mockListMenuItems(canteens[0].id);
    expect(items.length).toBeGreaterThan(0);
  });

  it("creates and deletes canteens in memory", () => {
    const created = mockCreateCanteen({ name: "测试食堂", location: "A" });
    expect(mockListCanteens().some((c) => c.id === created.id)).toBe(true);
    mockDeleteCanteen(created.id);
    expect(mockListCanteens().some((c) => c.id === created.id)).toBe(false);
  });
});
