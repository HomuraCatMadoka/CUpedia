/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { CanteenMenuView } from "@/components/canteen/canteen-menu-view";
import type { CanteenMenuItem } from "@/lib/canteen-types";
import { AFTERNOON_HINT_TEXT } from "@/lib/canteen-meal-period";
import { hktDate } from "../helpers/hkt-date";

const { mockUpsertDishVote } = vi.hoisted(() => ({
  mockUpsertDishVote: vi.fn(),
}));

vi.mock("@/lib/canteen-vote-actions", () => ({
  upsertDishVote: (...args: unknown[]) => mockUpsertDishVote(...args),
}));

vi.mock("@/components/canteen/menu-item-comment-panel", () => ({
  MenuItemCommentPanel: ({
    initialCommentCount = 0,
  }: {
    initialCommentCount?: number;
  }) => (
    <button type="button">{`评论 (${initialCommentCount})`}</button>
  ),
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

function setHktClock(hour: number, minute = 0) {
  vi.setSystemTime(hktDate(hour, minute));
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  setHktClock(12, 0);
  mockUpsertDishVote.mockReset();
  mockUpsertDishVote.mockResolvedValue({ menuItemId: "ln-1", vote: "like" });
  cleanup();
});

afterEach(() => {
  vi.useRealTimers();
  cleanup();
});

describe("CanteenMenuView", () => {
  it("defaults to lunch tab at 12:00 HKT and filters by meal period", async () => {
    render(<CanteenMenuView items={ITEMS} voteCounts={{}} myVotes={{}} />);

    await waitFor(() => {
      expect(screen.getByText("演示午餐")).toBeTruthy();
    });
    expect(screen.queryByText("演示早餐")).toBeNull();

    fireEvent.click(screen.getByRole("tab", { name: "早餐" }));
    expect(screen.getByText("演示早餐")).toBeTruthy();
    expect(screen.queryByText("演示午餐")).toBeNull();
  });

  it("defaults to breakfast tab before 11:30 HKT", async () => {
    setHktClock(10, 0);
    render(<CanteenMenuView items={ITEMS} voteCounts={{}} myVotes={{}} />);

    await waitFor(() => {
      expect(screen.getByText("演示早餐")).toBeTruthy();
    });
    expect(screen.queryByText("演示午餐")).toBeNull();
  });

  it("defaults to dinner tab from 17:30 HKT", async () => {
    setHktClock(18, 0);
    render(<CanteenMenuView items={ITEMS} voteCounts={{}} myVotes={{}} />);

    await waitFor(() => {
      expect(screen.getByText("演示晚餐")).toBeTruthy();
    });
    expect(screen.queryByText("演示午餐")).toBeNull();
  });

  it("shows afternoon hint on lunch tab between 14:30 and 17:29 HKT", async () => {
    setHktClock(15, 0);
    render(<CanteenMenuView items={ITEMS} voteCounts={{}} myVotes={{}} />);

    await waitFor(() => {
      expect(screen.getByRole("status").textContent).toContain(
        AFTERNOON_HINT_TEXT,
      );
    });
  });

  it("shows recommend ranking for current period only", async () => {
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

    await waitFor(() => {
      expect(screen.getByText("演示午餐")).toBeTruthy();
    });

    fireEvent.click(screen.getByRole("tab", { name: "大众推荐" }));
    expect(screen.getByText("演示午餐")).toBeTruthy();
    expect(screen.queryByText("演示早餐")).toBeNull();
    expect(screen.getByText(/赞 5/)).toBeTruthy();
    expect(screen.queryByText(/赞 99/)).toBeNull();
  });

  it("shows comments on recommend and avoid rankings", async () => {
    render(
      <CanteenMenuView
        items={ITEMS}
        voteCounts={{ "ln-1": { likes: 2, dislikes: 3 } }}
        myVotes={{}}
        commentCounts={{ "ln-1": 4 }}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("演示午餐")).toBeTruthy();
    });

    fireEvent.click(screen.getByRole("tab", { name: "大众推荐" }));
    expect(screen.getByRole("button", { name: "评论 (4)" })).toBeTruthy();

    fireEvent.click(screen.getByRole("tab", { name: "大众避雷" }));
    expect(screen.getByRole("button", { name: "评论 (4)" })).toBeTruthy();
  });

  it("shows empty state when period has no dishes", async () => {
    render(
      <CanteenMenuView
        items={[item("ln-1", "lunch", "演示午餐")]}
        voteCounts={{}}
        myVotes={{}}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("演示午餐")).toBeTruthy();
    });

    fireEvent.click(screen.getByRole("tab", { name: "早餐" }));
    expect(screen.getByText("该餐段暂无菜品")).toBeTruthy();
  });

  it("keeps vote state when switching view tabs", async () => {
    render(
      <CanteenMenuView items={ITEMS} voteCounts={{}} myVotes={{}} />,
    );

    await waitFor(() => {
      expect(screen.getByText("演示午餐")).toBeTruthy();
    });

    fireEvent.click(screen.getByRole("button", { name: "点赞" }));
    expect(screen.getByRole("button", { name: "点赞" }).textContent).toContain("1");

    fireEvent.click(screen.getByRole("tab", { name: "大众推荐" }));
    fireEvent.click(screen.getByRole("tab", { name: "菜单" }));

    expect(screen.getByRole("button", { name: "点赞" }).textContent).toContain("1");
    expect(screen.getByRole("button", { name: "点赞" }).getAttribute("aria-pressed")).toBe(
      "true",
    );
  });
});
