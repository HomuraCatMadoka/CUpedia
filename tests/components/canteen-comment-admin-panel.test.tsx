/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { CanteenCommentAdminPanel } from "@/components/admin/canteen-comment-admin-panel";
import type { AdminCanteenDishComment } from "@/lib/canteen-types";

const { mockAdminDeleteDishComment, mockRefresh } = vi.hoisted(() => ({
  mockAdminDeleteDishComment: vi.fn(),
  mockRefresh: vi.fn(),
}));

vi.mock("@/lib/canteen-comment-actions", () => ({
  adminDeleteDishComment: (...args: unknown[]) =>
    mockAdminDeleteDishComment(...args),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}));

const sampleComment: AdminCanteenDishComment = {
  id: "c1",
  menuItemId: "item-1",
  userId: "u1",
  content: "还行吧",
  authorNickname: "路人甲",
  canteenId: "canteen-1",
  canteenName: "演示食堂",
  menuItemName: "演示菜品",
  createdAt: new Date("2026-07-01T04:00:00.000Z"),
  updatedAt: new Date("2026-07-01T04:00:00.000Z"),
};

beforeEach(() => {
  mockAdminDeleteDishComment.mockReset();
  mockRefresh.mockReset();
});

afterEach(() => {
  cleanup();
});

describe("CanteenCommentAdminPanel", () => {
  it("renders empty state when there are no comments", () => {
    render(<CanteenCommentAdminPanel comments={[]} />);
    expect(screen.getByText("暂无菜品评论。")).toBeTruthy();
  });

  it("lists comments with canteen and dish context", () => {
    render(<CanteenCommentAdminPanel comments={[sampleComment]} />);
    expect(screen.getByText("还行吧")).toBeTruthy();
    expect(screen.getByText(/演示食堂/)).toBeTruthy();
    expect(screen.getByText(/演示菜品/)).toBeTruthy();
    expect(screen.getByText(/路人甲/)).toBeTruthy();
  });

  it("deletes a comment after confirmation", async () => {
    mockAdminDeleteDishComment.mockResolvedValue(undefined);
    render(<CanteenCommentAdminPanel comments={[sampleComment]} />);

    fireEvent.click(screen.getByRole("button", { name: "删除" }));
    expect(screen.getByText(/将永久删除「还行吧」/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "删除" }));

    await waitFor(() => {
      expect(mockAdminDeleteDishComment).toHaveBeenCalledWith("c1");
      expect(mockRefresh).toHaveBeenCalled();
    });
  });
});
