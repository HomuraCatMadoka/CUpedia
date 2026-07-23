/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  cleanup,
  waitFor,
} from "@testing-library/react";
import { CanteenMenuView } from "@/components/canteen/canteen-menu-view";
import type { CanteenMenuItem } from "@/lib/canteen-types";
import { AFTERNOON_HINT_TEXT } from "@/lib/canteen-meal-period";
import { hktDate } from "../helpers/hkt-date";

const { mockUpsertDishVote, mockUseDeferredValue } = vi.hoisted(() => ({
  mockUpsertDishVote: vi.fn(),
  mockUseDeferredValue: vi.fn((value: unknown) => value),
}));

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    useDeferredValue: <T,>(value: T) => mockUseDeferredValue(value) as T,
  };
});

vi.mock("@/lib/canteen-vote-actions", () => ({
  upsertDishVote: (...args: unknown[]) => mockUpsertDishVote(...args),
}));

vi.mock("@/components/canteen/menu-item-comment-panel", () => ({
  MenuItemCommentPanel: ({
    initialCommentCount = 0,
  }: {
    initialCommentCount?: number;
  }) => <button type="button">{`评论 (${initialCommentCount})`}</button>,
}));

function item(
  id: string,
  mealPeriod: CanteenMenuItem["mealPeriod"],
  name: string,
  svgKey = "default",
): CanteenMenuItem {
  const t = new Date();
  return {
    id,
    canteenId: "c1",
    name,
    pricing: null,
    mealPeriod,
    sortOrder: 0,
    svgKey,
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
  mockUseDeferredValue.mockReset();
  mockUseDeferredValue.mockImplementation((value) => value);
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
    await waitFor(() => {
      expect(screen.getByText("演示早餐")).toBeTruthy();
    });
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

  it("settles on the latest period after rapid tab changes", async () => {
    render(<CanteenMenuView items={ITEMS} voteCounts={{}} myVotes={{}} />);

    await waitFor(() => {
      expect(screen.getByText("演示午餐")).toBeTruthy();
    });

    const breakfast = screen.getByRole("tab", { name: "早餐" });
    const dinner = screen.getByRole("tab", { name: "晚餐" });
    fireEvent.click(breakfast);
    expect(breakfast.getAttribute("aria-selected")).toBe("true");
    fireEvent.click(dinner);
    expect(dinner.getAttribute("aria-selected")).toBe("true");

    await waitFor(() => {
      expect(screen.getByText("演示晚餐")).toBeTruthy();
    });
    expect(screen.queryByText("演示早餐")).toBeNull();
    expect(screen.queryByText("演示午餐")).toBeNull();
  });

  it("makes stale menu content inert while a period switch settles", async () => {
    let deferSelection = false;
    let settledSelection: unknown;
    mockUseDeferredValue.mockImplementation((selection) => {
      if (!deferSelection) {
        settledSelection = selection;
        return selection;
      }
      return settledSelection;
    });

    render(<CanteenMenuView items={ITEMS} voteCounts={{}} myVotes={{}} />);

    await waitFor(() => {
      expect(screen.getByText("演示午餐")).toBeTruthy();
    });

    deferSelection = true;
    fireEvent.click(screen.getByRole("tab", { name: "晚餐" }));

    const staleContent = screen
      .getByText("演示午餐")
      .closest('[aria-busy="true"]');
    expect(staleContent?.hasAttribute("inert")).toBe(true);
    expect(staleContent?.classList.contains("pointer-events-none")).toBe(true);
    expect(
      screen.getByRole("tab", { name: "晚餐" }).getAttribute("aria-selected"),
    ).toBe("true");
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
    await waitFor(() => {
      expect(screen.getByText("演示午餐")).toBeTruthy();
      expect(screen.getByText(/赞 5/)).toBeTruthy();
    });
    expect(screen.queryByText("演示早餐")).toBeNull();
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
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "评论 (4)" })).toBeTruthy();
    });

    fireEvent.click(screen.getByRole("tab", { name: "大众避雷" }));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "评论 (4)" })).toBeTruthy();
    });
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
    await waitFor(() => {
      expect(screen.getByText("该餐段暂无菜品")).toBeTruthy();
    });
  });

  it("keeps vote state when switching view tabs", async () => {
    render(<CanteenMenuView items={ITEMS} voteCounts={{}} myVotes={{}} />);

    await waitFor(() => {
      expect(screen.getByText("演示午餐")).toBeTruthy();
    });

    fireEvent.click(screen.getByRole("button", { name: "点赞" }));
    expect(screen.getByRole("button", { name: "点赞" }).textContent).toContain(
      "1",
    );

    fireEvent.click(screen.getByRole("tab", { name: "大众推荐" }));
    fireEvent.click(screen.getByRole("tab", { name: "菜单" }));

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "点赞" }).textContent,
      ).toContain("1");
    });
    expect(
      screen.getByRole("button", { name: "点赞" }).getAttribute("aria-pressed"),
    ).toBe("true");
  });

  it("groups menu items by svgKey with section headings and filters", async () => {
    const mixed = [
      item("rice-1", "lunch", "叉烧饭", "rice"),
      item("drink-1", "lunch", "奶茶", "drink"),
      item("noodle-1", "lunch", "牛肉面", "noodle"),
    ];
    render(<CanteenMenuView items={mixed} voteCounts={{}} myVotes={{}} />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /饭类/ })).toBeTruthy();
    });
    expect(screen.getByRole("heading", { name: /粉面/ })).toBeTruthy();
    expect(screen.getByRole("heading", { name: /饮品/ })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /饮品/ }));
    await waitFor(() => {
      expect(screen.getByText("奶茶")).toBeTruthy();
      expect(screen.queryByText("叉烧饭")).toBeNull();
      expect(screen.queryByText("牛肉面")).toBeNull();
    });
    expect(
      screen.getByRole("button", { name: /饮品/ }).getAttribute("aria-pressed"),
    ).toBe("true");

    fireEvent.click(screen.getByRole("button", { name: "全部" }));
    await waitFor(() => {
      expect(screen.getByText("叉烧饭")).toBeTruthy();
      expect(screen.getByText("牛肉面")).toBeTruthy();
    });
  });

  it("atomically resets category when periods have different sections", async () => {
    const mixedPeriods = [
      item("lunch-rice", "lunch", "午餐饭", "rice"),
      item("lunch-drink", "lunch", "午餐茶", "drink"),
      item("breakfast-noodle", "breakfast", "早餐面", "noodle"),
      item("breakfast-dessert", "breakfast", "早餐包", "dessert"),
    ];
    render(
      <CanteenMenuView items={mixedPeriods} voteCounts={{}} myVotes={{}} />,
    );

    await waitFor(() => {
      expect(screen.getByText("午餐饭")).toBeTruthy();
    });

    fireEvent.click(screen.getByRole("button", { name: /饮品/ }));
    await waitFor(() => {
      expect(screen.getByText("午餐茶")).toBeTruthy();
      expect(screen.queryByText("午餐饭")).toBeNull();
    });

    fireEvent.click(screen.getByRole("tab", { name: "早餐" }));
    expect(
      screen.getByRole("button", { name: "全部" }).getAttribute("aria-pressed"),
    ).toBe("true");
    expect(screen.getByRole("button", { name: /粉面/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /甜品/ })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /饮品/ })).toBeNull();

    await waitFor(() => {
      expect(screen.getByText("早餐面")).toBeTruthy();
      expect(screen.getByText("早餐包")).toBeTruthy();
    });
    expect(screen.queryByText("该餐段暂无菜品")).toBeNull();
  });
});
