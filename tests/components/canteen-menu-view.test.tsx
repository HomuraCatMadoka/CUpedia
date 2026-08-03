/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
  waitFor,
} from "@testing-library/react";
import { CanteenMenuView } from "@/components/canteen/canteen-menu-view";
import type {
  CanteenMenuItem,
  MealPeriodAssignment,
} from "@/lib/canteen-types";
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
    expanded,
  }: {
    initialCommentCount?: number;
    expanded?: boolean;
  }) => (
    <button type="button" data-expanded={expanded ? "true" : "false"}>
      {`评论 (${initialCommentCount})`}
    </button>
  ),
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
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn(() => ({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  });
  Object.defineProperty(window, "scrollTo", {
    configurable: true,
    value: vi.fn(),
  });
  Object.defineProperty(window, "scrollY", {
    configurable: true,
    value: 0,
  });
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
    configurable: true,
    value: vi.fn(),
  });
  cleanup();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  cleanup();
});

describe("CanteenMenuView", () => {
  it("shows one menu for the current meal period with ranking view tabs", async () => {
    render(<CanteenMenuView items={ITEMS} voteCounts={{}} myVotes={{}} />);

    await waitFor(() => expect(screen.getByText("演示午餐")).toBeTruthy());
    expect(screen.getByRole("tablist", { name: "菜单视图" })).toBeTruthy();
    expect(
      screen.getByRole("tab", { name: "菜单" }).getAttribute("aria-selected"),
    ).toBe("true");
    expect(screen.getByRole("tab", { name: "红榜" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "黑榜" })).toBeTruthy();
    expect(screen.queryByText("演示早餐")).toBeNull();
  });

  it("supports keyboard navigation and panel relationships for view tabs", async () => {
    render(<CanteenMenuView items={ITEMS} voteCounts={{}} myVotes={{}} />);
    await waitFor(() => expect(screen.getByText("演示午餐")).toBeTruthy());

    const menuTab = screen.getByRole("tab", { name: "菜单" });
    const recommendTab = screen.getByRole("tab", { name: "红榜" });
    expect(menuTab.tabIndex).toBe(0);
    expect(recommendTab.tabIndex).toBe(-1);
    expect(menuTab.getAttribute("aria-controls")).toBe(
      "canteen-view-panel-menu",
    );

    menuTab.focus();
    fireEvent.keyDown(menuTab, { key: "ArrowRight" });

    expect(recommendTab.getAttribute("aria-selected")).toBe("true");
    expect(recommendTab.tabIndex).toBe(0);
    expect(document.activeElement).toBe(recommendTab);
    expect(screen.getByRole("tabpanel").getAttribute("aria-labelledby")).toBe(
      "canteen-view-tab-recommend",
    );
  });

  it("switches the single menu between meal periods", async () => {
    render(<CanteenMenuView items={ITEMS} voteCounts={{}} myVotes={{}} />);

    await waitFor(() => expect(screen.getByText("演示午餐")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "早餐" }));

    await waitFor(() => expect(screen.getByText("演示早餐")).toBeTruthy());
    expect(screen.queryByText("演示午餐")).toBeNull();
  });

  it("chooses breakfast before 11:30 and dinner after 17:30 HKT", async () => {
    setHktClock(10);
    const view = render(
      <CanteenMenuView items={ITEMS} voteCounts={{}} myVotes={{}} />,
    );
    await waitFor(() => expect(screen.getByText("演示早餐")).toBeTruthy());

    view.unmount();
    setHktClock(18);
    render(<CanteenMenuView items={ITEMS} voteCounts={{}} myVotes={{}} />);
    await waitFor(() => expect(screen.getByText("演示晚餐")).toBeTruthy());
  });

  it("settles on the latest period after rapid changes", async () => {
    render(<CanteenMenuView items={ITEMS} voteCounts={{}} myVotes={{}} />);
    await waitFor(() => expect(screen.getByText("演示午餐")).toBeTruthy());

    const breakfast = screen.getByRole("button", { name: "早餐" });
    const dinner = screen.getByRole("button", { name: "晚餐" });
    fireEvent.click(breakfast);
    fireEvent.click(dinner);

    expect(dinner.getAttribute("data-current")).toBe("true");
    await waitFor(() => expect(screen.getByText("演示晚餐")).toBeTruthy());
    expect(screen.queryByText("演示早餐")).toBeNull();
  });

  it("expands one meal period at a time and allows all periods to collapse", async () => {
    render(
      <CanteenMenuView
        items={[
          item("bf-rice", "breakfast", "早餐饭", "rice"),
          item("ln-noodle", "lunch", "午餐面", "noodle"),
          item("dn-drink", "dinner", "晚餐饮品", "drink"),
        ]}
        voteCounts={{}}
        myVotes={{}}
      />,
    );

    await waitFor(() => expect(screen.getByText("午餐面")).toBeTruthy());
    const breakfast = screen.getByRole("button", { name: "早餐" });
    const lunch = screen.getByRole("button", { name: "午餐" });
    expect(lunch.getAttribute("aria-expanded")).toBe("true");
    expect(breakfast.getAttribute("aria-expanded")).toBe("false");

    fireEvent.click(screen.getByRole("button", { name: "粉面" }));
    await waitFor(() =>
      expect(window.scrollTo).toHaveBeenCalledWith(
        expect.objectContaining({ behavior: "instant" }),
      ),
    );

    fireEvent.click(breakfast);
    await waitFor(() => expect(screen.getByText("早餐饭")).toBeTruthy());
    expect(breakfast.getAttribute("aria-expanded")).toBe("true");
    expect(lunch.getAttribute("aria-expanded")).toBe("false");

    breakfast.focus();
    fireEvent.click(breakfast);
    expect(document.activeElement).toBe(breakfast);

    expect(breakfast.getAttribute("aria-expanded")).toBe("false");
  });

  it("measures section containers instead of sticky headings for adjacent jumps", async () => {
    const view = render(
      <CanteenMenuView
        items={[
          item("ln-rice", "lunch", "午餐饭", "rice"),
          item("ln-noodle", "lunch", "午餐面", "noodle"),
        ]}
        voteCounts={{}}
        myVotes={{}}
      />,
    );
    await waitFor(() => expect(screen.getByText("午餐面")).toBeTruthy());

    Object.defineProperty(window, "scrollY", {
      configurable: true,
      value: 500,
    });
    const toolbar =
      view.container.querySelector<HTMLElement>(".canteen-toolbar")!;
    const riceSection = view.container.querySelector<HTMLElement>(
      '[data-menu-section-key="rice"]',
    )!;
    const riceHeading = screen.getByRole("heading", { name: /饭类/ });
    toolbar.getBoundingClientRect = () => new DOMRect(0, 100, 320, 44);
    riceSection.getBoundingClientRect = () => new DOMRect(0, 120, 244, 300);
    riceHeading.getBoundingClientRect = () => new DOMRect(0, 40, 244, 32);

    fireEvent.click(screen.getByRole("button", { name: "粉面" }));
    await waitFor(() => expect(window.scrollTo).toHaveBeenCalled());
    vi.mocked(window.scrollTo).mockClear();

    fireEvent.click(screen.getByRole("button", { name: "饭类" }));

    await waitFor(() =>
      expect(window.scrollTo).toHaveBeenCalledWith({
        top: 476,
        behavior: "instant",
      }),
    );
  });

  it("resets a new meal period to its first section instead of restoring old height", async () => {
    const originalRect = HTMLElement.prototype.getBoundingClientRect;
    const rectSpy = vi
      .spyOn(HTMLElement.prototype, "getBoundingClientRect")
      .mockImplementation(function (this: HTMLElement) {
        if (this.classList.contains("canteen-toolbar")) {
          return new DOMRect(0, 100, 320, 44);
        }
        if (this.dataset.menuSectionKey) {
          return new DOMRect(0, 82, 244, 300);
        }
        return originalRect.call(this);
      });

    render(
      <CanteenMenuView
        items={[
          item("bf-noodle", "breakfast", "早餐面", "noodle"),
          item("ln-rice", "lunch", "午餐饭", "rice"),
        ]}
        voteCounts={{}}
        myVotes={{}}
      />,
    );
    await waitFor(() => expect(screen.getByText("午餐饭")).toBeTruthy());
    Object.defineProperty(window, "scrollY", {
      configurable: true,
      value: 900,
    });
    vi.mocked(window.scrollTo).mockClear();

    fireEvent.click(screen.getByRole("button", { name: "早餐" }));

    await waitFor(() =>
      expect(window.scrollTo).toHaveBeenCalledWith({
        top: 838,
        behavior: "instant",
      }),
    );
    rectSpy.mockRestore();
  });

  it("shows the afternoon hint only on lunch", async () => {
    setHktClock(15);
    render(<CanteenMenuView items={ITEMS} voteCounts={{}} myVotes={{}} />);

    await waitFor(() =>
      expect(screen.getByRole("status").textContent).toContain(
        AFTERNOON_HINT_TEXT,
      ),
    );
    fireEvent.click(screen.getByRole("button", { name: "早餐" }));
    await waitFor(() => expect(screen.queryByRole("status")).toBeNull());
  });

  it("shows only meal periods the canteen serves", async () => {
    render(
      <CanteenMenuView
        items={[item("ln-1", "lunch", "午市"), item("dn-1", "dinner", "晚市")]}
        voteCounts={{}}
        myVotes={{}}
      />,
    );

    await waitFor(() => expect(screen.getByText("午市")).toBeTruthy());
    expect(screen.getByRole("button", { name: "午餐" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "晚餐" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "早餐" })).toBeNull();
  });

  it("renders directional red and black ranking views", async () => {
    const lunchItems = [
      item("good", "lunch", "演示菜品 A", "rice"),
      item("bad", "lunch", "演示菜品 B", "rice"),
      item("mixed", "lunch", "演示菜品 C", "rice"),
    ];
    render(
      <CanteenMenuView
        items={lunchItems}
        voteCounts={{
          good: { likes: 8, dislikes: 2 },
          bad: { likes: 1, dislikes: 7 },
          mixed: { likes: 2, dislikes: 2 },
        }}
        myVotes={{}}
      />,
    );

    await waitFor(() => expect(screen.getByText("演示菜品 A")).toBeTruthy());
    fireEvent.click(screen.getByRole("tab", { name: "红榜" }));
    const red = screen.getByRole("tabpanel", { name: "红榜" });
    expect(red.textContent).toContain("演示菜品 A");
    expect(red.textContent).not.toContain("演示菜品 B");
    expect(red.textContent).not.toContain("演示菜品 C");

    fireEvent.click(screen.getByRole("tab", { name: "黑榜" }));
    const black = screen.getByRole("tabpanel", { name: "黑榜" });
    expect(black.textContent).toContain("演示菜品 B");
    expect(black.textContent).not.toContain("演示菜品 A");
  });

  it("shows an empty ranking state when votes are insufficient", async () => {
    render(
      <CanteenMenuView
        items={[item("low", "lunch", "新菜", "rice")]}
        voteCounts={{ low: { likes: 3, dislikes: 1 } }}
        myVotes={{}}
      />,
    );

    await waitFor(() => expect(screen.getByText("新菜")).toBeTruthy());
    fireEvent.click(screen.getByRole("tab", { name: "红榜" }));
    expect(screen.getByText("暂时还没有菜品达到入榜票数。")).toBeTruthy();
  });

  it("uses the finder for search and category jumps without filtering the menu", async () => {
    const mixed = [
      item("rice-1", "lunch", "演示菜品 A", "rice"),
      item("drink-1", "lunch", "演示菜品 B", "drink"),
      item("noodle-1", "lunch", "演示菜品 C", "noodle"),
    ];
    render(<CanteenMenuView items={mixed} voteCounts={{}} myVotes={{}} />);
    await waitFor(() => expect(screen.getByText("演示菜品 A")).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: "查找菜品" }));
    const finder = screen.getByRole("dialog");
    expect(finder).toBeTruthy();
    expect(within(finder).getByRole("button", { name: /饭类/ })).toBeTruthy();
    expect(within(finder).getByRole("button", { name: /饮品/ })).toBeTruthy();

    fireEvent.change(screen.getByRole("searchbox", { name: "搜索菜品" }), {
      target: { value: "演示菜品 B" },
    });
    expect(screen.getByText("找到 1 道菜")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "演示菜品 B" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.getByText("演示菜品 A")).toBeTruthy();
    expect(screen.getByText("演示菜品 C")).toBeTruthy();
    await waitFor(() =>
      expect(
        window.scrollTo as unknown as ReturnType<typeof vi.fn>,
      ).toHaveBeenCalled(),
    );
  });

  it("renders a long menu as grouped semantic sections", async () => {
    const longMenu = Array.from({ length: 100 }, (_, index) =>
      item(
        `dish-${index}`,
        "lunch",
        `菜品 ${index + 1}`,
        index % 2 === 0 ? "rice" : "noodle",
      ),
    );
    render(<CanteenMenuView items={longMenu} voteCounts={{}} myVotes={{}} />);

    await waitFor(() => expect(screen.getByText("菜品 100")).toBeTruthy());
    expect(screen.getAllByRole("listitem")).toHaveLength(100);
    expect(screen.getByRole("heading", { name: /饭类/ })).toBeTruthy();
    expect(screen.getByRole("heading", { name: /粉面/ })).toBeTruthy();
  });

  it("keeps the menu compact and opens price details in one dialog", async () => {
    const priced = item("priced", "lunch", "套餐饭", "rice");
    priced.pricing = {
      options: [
        {
          id: "hot",
          label: "热饮",
          amountMinor: 3800,
          currency: "HKD",
          sortOrder: 0,
        },
        {
          id: "special",
          label: "特饮",
          amountMinor: 4600,
          currency: "HKD",
          sortOrder: 1,
        },
      ],
    };

    render(
      <CanteenMenuView
        items={[priced]}
        voteCounts={{}}
        myVotes={{}}
        commentCounts={{ priced: 3 }}
      />,
    );

    await waitFor(() => expect(screen.getByText("$38 起")).toBeTruthy());
    expect(screen.queryByText("· 2 种选择")).toBeNull();
    expect(screen.queryByText("特饮")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /套餐饭.*打开详情/ }));

    const dialog = screen.getByRole("dialog");
    expect(dialog.textContent).toContain("2 种选择");
    expect(dialog.textContent).toContain("价格选项");
    expect(dialog.textContent).toContain("热饮");
    expect(dialog.textContent).toContain("$38");
    expect(dialog.textContent).toContain("特饮");
    expect(dialog.textContent).toContain("$46");
    expect(dialog.textContent).toContain("评论");
    expect(
      within(dialog).getByRole("button", { name: "评论 (3)" }).dataset.expanded,
    ).toBe("true");
  });

  it("does not repeat a single price inside the details body", async () => {
    const priced = item("single-price", "lunch", "净云吞");
    priced.pricing = {
      options: [
        {
          id: "regular",
          label: null,
          amountMinor: 1800,
          currency: "HKD",
          sortOrder: 0,
        },
      ],
    };

    render(<CanteenMenuView items={[priced]} voteCounts={{}} myVotes={{}} />);

    fireEvent.click(screen.getByRole("button", { name: /净云吞.*打开详情/ }));

    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("$18")).toBeTruthy();
    expect(within(dialog).queryByText("价格选项")).toBeNull();
  });

  it("keeps all-day dishes in the available specific period", async () => {
    render(
      <CanteenMenuView
        items={[item("ln", "lunch", "热菜"), item("all", "allday", "甜品")]}
        voteCounts={{}}
        myVotes={{}}
      />,
    );

    await waitFor(() => expect(screen.getByText("热菜")).toBeTruthy());
    expect(screen.getByText("甜品")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "早餐" })).toBeNull();
    expect(screen.queryByRole("button", { name: "晚餐" })).toBeNull();
  });

  it("shows one multi-period dish under both periods", async () => {
    render(
      <CanteenMenuView
        items={[item("shared", ["lunch", "dinner"], "午晚餐菜品")]}
        voteCounts={{}}
        myVotes={{}}
      />,
    );

    await waitFor(() => expect(screen.getByText("午晚餐菜品")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "晚餐" }));
    await waitFor(() => expect(screen.getByText("午晚餐菜品")).toBeTruthy());
  });
});
