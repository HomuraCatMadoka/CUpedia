/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useState } from "react";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
} from "@testing-library/react";
import { MenuItemVoteRow } from "@/components/canteen/menu-item-vote-row";
import type {
  CanteenMenuItem,
  MenuItemVoteCounts,
  VoteChoice,
} from "@/lib/canteen-types";
import { applyVoteCountDelta } from "@/lib/canteen-types";

const { mockUpsertDishVote } = vi.hoisted(() => ({
  mockUpsertDishVote: vi.fn(),
}));

vi.mock("@/lib/canteen-vote-actions", () => ({
  upsertDishVote: (...args: unknown[]) => mockUpsertDishVote(...args),
}));

vi.mock("@/components/canteen/menu-item-comment-panel", () => ({
  MenuItemCommentPanel: () => null,
}));

const ITEM: CanteenMenuItem = {
  id: "item-1",
  canteenId: "canteen-1",
  name: "演示菜品",
  pricing: {
    options: [
      {
        id: "price-hot",
        label: "熱",
        amountMinor: 1100,
        currency: "HKD",
        sortOrder: 0,
      },
      {
        id: "price-iced",
        label: "凍",
        amountMinor: 1300,
        currency: "HKD",
        sortOrder: 1,
      },
    ],
  },
  mealPeriod: "lunch",
  sortOrder: 0,
  svgKey: "default",
  createdAt: new Date(),
  updatedAt: new Date(),
};

function VoteRowHarness({
  initialCounts = { likes: 0, dislikes: 0 },
  initialVote = null as VoteChoice,
}: {
  initialCounts?: MenuItemVoteCounts;
  initialVote?: VoteChoice;
}) {
  const [counts, setCounts] = useState(initialCounts);
  const [myVote, setMyVote] = useState<VoteChoice>(initialVote);

  function handleVoteChange(
    _itemId: string,
    prevVote: VoteChoice,
    nextVote: VoteChoice,
  ) {
    setMyVote(nextVote);
    setCounts((current) => applyVoteCountDelta(current, prevVote, nextVote));
  }

  return (
    <MenuItemVoteRow
      item={ITEM}
      counts={counts}
      myVote={myVote}
      onVoteChange={handleVoteChange}
    />
  );
}

beforeEach(() => {
  mockUpsertDishVote.mockReset();
  mockUpsertDishVote.mockResolvedValue({ menuItemId: ITEM.id, vote: "like" });
});

afterEach(() => {
  cleanup();
});

describe("MenuItemVoteRow", () => {
  it("renders generic labelled price options", () => {
    render(<VoteRowHarness />);
    expect(screen.getByText("熱")).toBeTruthy();
    expect(screen.getByText("$11")).toBeTruthy();
    expect(screen.getByText("凍")).toBeTruthy();
    expect(screen.getByText("$13")).toBeTruthy();
  });

  it("optimistically increments like count on click", async () => {
    mockUpsertDishVote.mockImplementation(() => new Promise(() => {}));
    render(<VoteRowHarness />);
    fireEvent.click(screen.getByRole("button", { name: "点赞" }));
    expect(screen.getByRole("button", { name: "点赞" }).textContent).toContain(
      "1",
    );
  });

  it("toggles off like and decrements count", async () => {
    mockUpsertDishVote.mockResolvedValue({ menuItemId: ITEM.id, vote: null });
    render(
      <VoteRowHarness
        initialCounts={{ likes: 1, dislikes: 0 }}
        initialVote="like"
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "点赞" }));
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "点赞" }).textContent,
      ).toContain("0");
    });
    expect(mockUpsertDishVote).toHaveBeenCalledWith(ITEM.id, null);
  });

  it("switches from like to dislike", async () => {
    mockUpsertDishVote.mockResolvedValue({
      menuItemId: ITEM.id,
      vote: "dislike",
    });
    render(
      <VoteRowHarness
        initialCounts={{ likes: 1, dislikes: 0 }}
        initialVote="like"
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "点踩" }));
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "点赞" }).textContent,
      ).toContain("0");
      expect(
        screen.getByRole("button", { name: "点踩" }).textContent,
      ).toContain("1");
    });
    expect(mockUpsertDishVote).toHaveBeenCalledWith(ITEM.id, "dislike");
  });

  it("rolls back optimistic state and shows error on failure", async () => {
    mockUpsertDishVote.mockRejectedValue(new Error("RATE_LIMIT_EXCEEDED"));
    render(<VoteRowHarness />);
    fireEvent.click(screen.getByRole("button", { name: "点赞" }));
    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toContain("操作太频繁");
      expect(
        screen.getByRole("button", { name: "点赞" }).textContent,
      ).toContain("0");
    });
  });

  it("maps USER_BANNED to a readable message", async () => {
    mockUpsertDishVote.mockRejectedValue(new Error("USER_BANNED"));
    render(<VoteRowHarness />);
    fireEvent.click(screen.getByRole("button", { name: "点赞" }));
    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toContain("账号已封禁");
    });
  });
});
