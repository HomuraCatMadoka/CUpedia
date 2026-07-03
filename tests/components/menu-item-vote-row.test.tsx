/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { MenuItemVoteRow } from "@/components/canteen/menu-item-vote-row";
import type { CanteenMenuItem } from "@/lib/canteen-types";

const { mockUpsertDishVote } = vi.hoisted(() => ({
  mockUpsertDishVote: vi.fn(),
}));

vi.mock("@/lib/canteen-vote-actions", () => ({
  upsertDishVote: (...args: unknown[]) => mockUpsertDishVote(...args),
}));

const ITEM: CanteenMenuItem = {
  id: "item-1",
  canteenId: "canteen-1",
  name: "演示菜品",
  price: 12,
  mealPeriod: "lunch",
  sortOrder: 0,
  svgKey: "default",
  createdAt: new Date(),
  updatedAt: new Date(),
};

function renderRow(
  counts = { likes: 0, dislikes: 0 },
  initialVote: "like" | "dislike" | null = null,
) {
  return render(
    <MenuItemVoteRow item={ITEM} counts={counts} initialVote={initialVote} />,
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
  it("optimistically increments like count on click", async () => {
    mockUpsertDishVote.mockImplementation(
      () => new Promise(() => {}),
    );
    renderRow();
    fireEvent.click(screen.getByRole("button", { name: "点赞" }));
    expect(screen.getByRole("button", { name: "点赞" }).textContent).toContain("1");
  });

  it("toggles off like and decrements count", async () => {
    mockUpsertDishVote.mockResolvedValue({ menuItemId: ITEM.id, vote: null });
    renderRow({ likes: 1, dislikes: 0 }, "like");
    fireEvent.click(screen.getByRole("button", { name: "点赞" }));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "点赞" }).textContent).toContain("0");
    });
    expect(mockUpsertDishVote).toHaveBeenCalledWith(ITEM.id, null);
  });

  it("switches from like to dislike", async () => {
    mockUpsertDishVote.mockResolvedValue({
      menuItemId: ITEM.id,
      vote: "dislike",
    });
    renderRow({ likes: 1, dislikes: 0 }, "like");
    fireEvent.click(screen.getByRole("button", { name: "点踩" }));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "点赞" }).textContent).toContain("0");
      expect(screen.getByRole("button", { name: "点踩" }).textContent).toContain("1");
    });
    expect(mockUpsertDishVote).toHaveBeenCalledWith(ITEM.id, "dislike");
  });

  it("rolls back optimistic state and shows error on failure", async () => {
    mockUpsertDishVote.mockRejectedValue(new Error("RATE_LIMIT_EXCEEDED"));
    renderRow();
    fireEvent.click(screen.getByRole("button", { name: "点赞" }));
    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toContain("操作太频繁");
      expect(screen.getByRole("button", { name: "点赞" }).textContent).toContain("0");
    });
  });

  it("maps USER_BANNED to a readable message", async () => {
    mockUpsertDishVote.mockRejectedValue(new Error("USER_BANNED"));
    renderRow();
    fireEvent.click(screen.getByRole("button", { name: "点赞" }));
    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toContain("账号已封禁");
    });
  });
});
