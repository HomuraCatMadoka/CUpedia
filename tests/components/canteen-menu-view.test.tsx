/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { CanteenMenuView } from "@/components/canteen/canteen-menu-view";
import type { CanteenMenuItem } from "@/lib/canteen-types";

vi.mock("@/lib/canteen-vote-actions", () => ({
  upsertDishVote: vi.fn().mockResolvedValue({ menuItemId: "lunch-1", vote: "like" }),
}));

function item(
  id: string,
  mealPeriod: CanteenMenuItem["mealPeriod"],
  name: string,
): CanteenMenuItem {
  const t = new Date();
  return {
    id,
    canteenId: "c1",
    name,
    price: 10,
    mealPeriod,
    sortOrder: 0,
    svgKey: "default",
    createdAt: t,
    updatedAt: t,
  };
}

const ITEMS = [
  item("bf-1", "breakfast", "演示早餐"),
  item("ln-1", "lunch", "演示午餐"),
  item("dn-1", "dinner", "演示晚餐"),
];

beforeEach(() => {
  cleanup();
});

afterEach(() => {
  cleanup();
});

describe("CanteenMenuView", () => {
  it("filters menu list when switching meal period tabs", () => {
    render(
      <CanteenMenuView items={ITEMS} voteCounts={{}} myVotes={{}} />,
    );

    expect(screen.getByText("演示午餐")).toBeTruthy();
    expect(screen.queryByText("演示早餐")).toBeNull();

    fireEvent.click(screen.getByRole("tab", { name: "早餐" }));
    expect(screen.getByText("演示早餐")).toBeTruthy();
    expect(screen.queryByText("演示午餐")).toBeNull();
  });

  it("shows recommend ranking for current period only", () => {
    render(
      <CanteenMenuView
        items={ITEMS}
        voteCounts={{
          "ln-1": { likes: 5, dislikes: 0 },
          "bf-1": { likes: 99, dislikes: 0 },
        }}
        myVotes={{}}
      />,
    );

    fireEvent.click(screen.getByRole("tab", { name: "大众推荐" }));
    expect(screen.getByText("演示午餐")).toBeTruthy();
    expect(screen.queryByText("演示早餐")).toBeNull();
  });

  it("shows empty state when period has no dishes", () => {
    render(
      <CanteenMenuView
        items={[item("ln-1", "lunch", "演示午餐")]}
        voteCounts={{}}
        myVotes={{}}
      />,
    );

    fireEvent.click(screen.getByRole("tab", { name: "早餐" }));
    expect(screen.getByText("该餐段暂无菜品")).toBeTruthy();
  });
});
