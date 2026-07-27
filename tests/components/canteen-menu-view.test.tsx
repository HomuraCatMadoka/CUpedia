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
import type {
  CanteenMenuItem,
  MealPeriodAssignment,
} from "@/lib/canteen-types";
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
  mealPeriods: MealPeriodAssignment | MealPeriodAssignment[],
  name: string,
  svgKey = "default",
): CanteenMenuItem {
  const t = new Date();
  return {
    id,
    canteenId: "c1",
    name,
    pricing: null,
    mealPeriods: Array.isArray(mealPeriods) ? mealPeriods : [mealPeriods],
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
  it("defaults to 红榜 for the current meal period", async () => {
    render(<CanteenMenuView items={ITEMS} voteCounts={{}} myVotes={{}} />);

    await waitFor(() => {
      expect(screen.getByText("演示午餐")).toBeTruthy();
    });
    expect(
      screen.getByRole("tab", { name: "红榜" }).getAttribute("aria-selected"),
    ).toBe("true");
    expect(screen.queryByText("演示早餐")).toBeNull();
  });

  it("defaults to lunch period at 12:00 HKT and filters when opening 菜单", async () => {
    render(<CanteenMenuView items={ITEMS} voteCounts={{}} myVotes={{}} />);

    await waitFor(() => {
      expect(screen.getByText("演示午餐")).toBeTruthy();
    });

    fireEvent.click(screen.getByRole("tab", { name: "菜单" }));
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

  it("defaults to breakfast period before 11:30 HKT", async () => {
    setHktClock(10, 0);
    render(<CanteenMenuView items={ITEMS} voteCounts={{}} myVotes={{}} />);

    await waitFor(() => {
      expect(screen.getByText("演示早餐")).toBeTruthy();
    });
    expect(screen.queryByText("演示午餐")).toBeNull();
  });

  it("defaults to dinner period from 17:30 HKT", async () => {
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

  it("does not reserve blank space for afternoon hint on other tabs", async () => {
    setHktClock(15, 0);
    render(<CanteenMenuView items={ITEMS} voteCounts={{}} myVotes={{}} />);

    await waitFor(() => {
      expect(screen.getByRole("status")).toBeTruthy();
    });

    fireEvent.click(screen.getByRole("tab", { name: "早餐" }));
    await waitFor(() => {
      expect(screen.queryByRole("status")).toBeNull();
      expect(screen.getByText("演示早餐")).toBeTruthy();
    });
  });

  it("shows only meal periods the store actually serves", async () => {
    render(
      <CanteenMenuView
        items={[item("ln-1", "lunch", "仅午餐")]}
        voteCounts={{}}
        myVotes={{}}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("仅午餐")).toBeTruthy();
    });
    expect(screen.getByRole("tab", { name: "午餐" })).toBeTruthy();
    expect(screen.queryByRole("tab", { name: "早餐" })).toBeNull();
    expect(screen.queryByRole("tab", { name: "晚餐" })).toBeNull();
  });

  it("only shows meal periods the store actually serves when multiple", async () => {
    render(
      <CanteenMenuView
        items={[item("ln-1", "lunch", "午市"), item("dn-1", "dinner", "晚市")]}
        voteCounts={{}}
        myVotes={{}}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("午市")).toBeTruthy();
    });
    expect(screen.getByRole("tab", { name: "午餐" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "晚餐" })).toBeTruthy();
    expect(screen.queryByRole("tab", { name: "早餐" })).toBeNull();
  });

  it("shows red ranking for current period only", async () => {
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
      expect(
        screen.getByRole("button", { name: "点赞" }).textContent,
      ).toContain("5");
    });
    expect(screen.queryByText("演示早餐")).toBeNull();
  });

  it("shows comments and votes on red and black rankings", async () => {
    render(
      <CanteenMenuView
        items={ITEMS}
        voteCounts={{ "ln-1": { likes: 2, dislikes: 3 } }}
        myVotes={{}}
        commentCounts={{ "ln-1": 4 }}
      />,
    );

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "评论 (4)" })).toBeTruthy();
      expect(screen.getByRole("button", { name: "点赞" })).toBeTruthy();
      expect(screen.getByRole("button", { name: "点踩" })).toBeTruthy();
    });

    fireEvent.click(screen.getByRole("tab", { name: "黑榜" }));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "评论 (4)" })).toBeTruthy();
      expect(screen.getByRole("button", { name: "点赞" })).toBeTruthy();
    });
  });

  it("orders view tabs as 红榜 / 黑榜 / 菜单", async () => {
    render(<CanteenMenuView items={ITEMS} voteCounts={{}} myVotes={{}} />);

    await waitFor(() => {
      expect(screen.getByText("演示午餐")).toBeTruthy();
    });

    const viewTabs = screen.getByRole("tablist", { name: "视图" });
    const labels = Array.from(viewTabs.querySelectorAll('[role="tab"]')).map(
      (el) => el.textContent,
    );
    expect(labels).toEqual(["红榜", "黑榜", "菜单"]);
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

    fireEvent.click(screen.getByRole("tab", { name: "菜单" }));
    fireEvent.click(screen.getByRole("tab", { name: "红榜" }));

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
      expect(screen.getByText("叉烧饭")).toBeTruthy();
    });

    fireEvent.click(screen.getByRole("tab", { name: "菜单" }));
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

    fireEvent.click(screen.getByRole("tab", { name: "菜单" }));
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

  it("hides period tabs when every dish is allday-only", async () => {
    render(
      <CanteenMenuView
        items={[item("a", "allday", "甜品A"), item("b", "allday", "甜品B")]}
        voteCounts={{}}
        myVotes={{}}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("甜品A")).toBeTruthy();
    });
    expect(screen.getByText("甜品B")).toBeTruthy();
    expect(screen.queryByRole("tab", { name: "早餐" })).toBeNull();
    expect(screen.queryByRole("tab", { name: "午餐" })).toBeNull();
    expect(screen.queryByRole("tab", { name: "晚餐" })).toBeNull();
  });

  it("shows allday dishes under the lunch tab when lunch is the only specific period", async () => {
    render(
      <CanteenMenuView
        items={[item("ln-1", "lunch", "热菜"), item("d-1", "allday", "甜品")]}
        voteCounts={{}}
        myVotes={{}}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("热菜")).toBeTruthy();
    });
    expect(screen.getByText("甜品")).toBeTruthy();
    expect(screen.getByRole("tab", { name: "午餐" })).toBeTruthy();
    expect(screen.queryByRole("tab", { name: "早餐" })).toBeNull();
    expect(screen.queryByRole("tab", { name: "晚餐" })).toBeNull();
  });

  it("shows one multi-period dish under both lunch and dinner tabs", async () => {
    render(
      <CanteenMenuView
        items={[item("shared", ["lunch", "dinner"], "午晚餐菜品")]}
        voteCounts={{}}
        myVotes={{}}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("午晚餐菜品")).toBeTruthy();
    });
    fireEvent.click(screen.getByRole("tab", { name: "晚餐" }));
    await waitFor(() => {
      expect(screen.getByText("午晚餐菜品")).toBeTruthy();
    });
  });
});
