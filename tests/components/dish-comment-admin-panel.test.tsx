/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

vi.mock("@/lib/canteen-comment-actions", () => ({
  adminDeleteDishComment: vi.fn(),
}));

import { DishCommentAdminPanel } from "@/components/admin/dish-comment-admin-panel";

afterEach(cleanup);

describe("DishCommentAdminPanel", () => {
  it("links active and deleted-comment authors to their unique account", () => {
    render(
      <DishCommentAdminPanel
        comments={[
          {
            id: "comment-1",
            menuItemId: "item-1",
            userId: "user-1",
            content: "现有评论",
            createdAt: new Date("2026-07-21T01:00:00Z"),
            updatedAt: new Date("2026-07-21T01:00:00Z"),
            authorNickname: "同名用户",
            authorEmail: "author+active@cuhk.edu.hk",
            canteenId: "canteen-1",
            canteenName: "范克廉楼咖啡阁",
            menuItemName: "咖喱饭",
          },
        ]}
        auditLogs={[
          {
            id: "audit-1",
            actorUserId: "admin-1",
            actorEmail: "admin@cuhk.edu.hk",
            actorNickname: "管理员",
            action: "dish_comment.delete",
            targetType: "canteen_dish_comment",
            targetId: "comment-deleted",
            targetUserId: "user-2",
            details: {
              content: "已删除评论",
              authorEmail: "author+deleted@cuhk.edu.hk",
              authorNickname: "同名用户",
              canteenId: "canteen-1",
              canteenName: "范克廉楼咖啡阁",
              menuItemId: "item-1",
              menuItemName: "咖喱饭",
              commentCreatedAt: "2026-07-21T00:00:00.000Z",
            },
            createdAt: new Date("2026-07-21T02:00:00Z"),
          },
        ]}
      />,
    );

    expect(
      screen
        .getByRole("link", {
          name: "同名用户（author+active@cuhk.edu.hk）",
        })
        .getAttribute("href"),
    ).toBe("/admin/users?q=author%2Bactive%40cuhk.edu.hk");
    expect(
      screen
        .getByRole("link", {
          name: "同名用户（author+deleted@cuhk.edu.hk）",
        })
        .getAttribute("href"),
    ).toBe("/admin/users?q=author%2Bdeleted%40cuhk.edu.hk");
    expect(screen.getByText(/由 管理员（admin@cuhk.edu.hk）删除/)).toBeTruthy();
  });
});
