import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { resetCanteenMockState } from "@/lib/canteen-mock";

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

describe("canteen-actions (mock mode)", () => {
  const prevMock = process.env.CANTEEN_MOCK_DATA;

  beforeEach(() => {
    process.env.CANTEEN_MOCK_DATA = "true";
    resetCanteenMockState();
  });

  afterEach(() => {
    process.env.CANTEEN_MOCK_DATA = prevMock;
    resetCanteenMockState();
  });

  it("lists canteens without touching the database", async () => {
    const { getCanteens } = await import("@/lib/canteen-actions");
    const canteens = await getCanteens();
    expect(canteens).toHaveLength(1);
    expect(canteens.every((c) => c.name.length > 0)).toBe(true);
  });

  it("returns null when canteen id is unknown", async () => {
    const { getCanteenById } = await import("@/lib/canteen-actions");
    const row = await getCanteenById("does-not-exist");
    expect(row).toBeNull();
  });

  it("returns menu items sorted by meal period then sort order", async () => {
    const { getCanteens, getCanteenMenuItems } = await import(
      "@/lib/canteen-actions"
    );
    const canteen = (await getCanteens())[0];
    const items = await getCanteenMenuItems(canteen.id);
    expect(items.length).toBeGreaterThan(0);
    const { compareMealPeriods } = await import("@/lib/canteen-types");
    for (let i = 1; i < items.length; i++) {
      const prev = items[i - 1];
      const curr = items[i];
      expect(compareMealPeriods(prev.mealPeriod, curr.mealPeriod)).toBeLessThanOrEqual(0);
    }
  });
});
