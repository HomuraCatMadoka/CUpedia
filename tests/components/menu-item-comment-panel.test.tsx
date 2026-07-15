/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { MenuItemCommentPanel } from "@/components/canteen/menu-item-comment-panel";

const {
  mockGetCommentsForMenuItem,
  mockCreateDishComment,
  mockUpdateDishComment,
  mockDeleteDishComment,
} = vi.hoisted(() => ({
  mockGetCommentsForMenuItem: vi.fn(),
  mockCreateDishComment: vi.fn(),
  mockUpdateDishComment: vi.fn(),
  mockDeleteDishComment: vi.fn(),
}));

vi.mock("@/lib/canteen-comment-actions", () => ({
  getCommentsForMenuItem: (...args: unknown[]) =>
    mockGetCommentsForMenuItem(...args),
  createDishComment: (...args: unknown[]) => mockCreateDishComment(...args),
  updateDishComment: (...args: unknown[]) => mockUpdateDishComment(...args),
  deleteDishComment: (...args: unknown[]) => mockDeleteDishComment(...args),
}));

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...props
  }: {
    href: string;
    children: React.ReactNode;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

beforeEach(() => {
  mockGetCommentsForMenuItem.mockReset();
  mockCreateDishComment.mockReset();
  mockUpdateDishComment.mockReset();
  mockDeleteDishComment.mockReset();
});

afterEach(() => {
  cleanup();
});

describe("MenuItemCommentPanel", () => {
  it("always shows comment count before expanding", () => {
    render(
      <MenuItemCommentPanel
        menuItemId="item-1"
        currentUserId={null}
        initialCommentCount={3}
      />,
    );
    expect(screen.getByRole("button", { name: "评论 (3)" })).toBeTruthy();
    expect(mockGetCommentsForMenuItem).not.toHaveBeenCalled();
  });

  it("renders comment text as plain text without executing HTML", async () => {
    mockGetCommentsForMenuItem.mockResolvedValue([
      {
        id: "c1",
        menuItemId: "item-1",
        userId: "u1",
        content: "<script>alert(1)</script>好吃",
        authorNickname: "路人",
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);

    render(<MenuItemCommentPanel menuItemId="item-1" currentUserId={null} />);
    fireEvent.click(screen.getByRole("button", { name: /评论/ }));

    await waitFor(() => {
      expect(screen.getByText("<script>alert(1)</script>好吃")).toBeTruthy();
    });
    expect(document.querySelector("script")).toBeNull();
  });

  it("shows login hint when user is not logged in", async () => {
    mockGetCommentsForMenuItem.mockResolvedValue([]);
    render(<MenuItemCommentPanel menuItemId="item-1" currentUserId={null} />);
    fireEvent.click(screen.getByRole("button", { name: /评论/ }));

    await waitFor(() => {
      expect(screen.getByRole("link", { name: "登录" }).getAttribute("href")).toBe(
        "/login",
      );
    });
  });

  it("shows banned message instead of login link for banned users", async () => {
    mockGetCommentsForMenuItem.mockResolvedValue([]);
    render(
      <MenuItemCommentPanel
        menuItemId="item-1"
        currentUserId={null}
        commentBlocked="banned"
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /评论/ }));

    await waitFor(() => {
      expect(screen.getByRole("status").textContent).toContain("账号已封禁");
    });
    expect(screen.queryByRole("link", { name: "登录" })).toBeNull();
  });

  it("lets logged-in users post and keeps comments after collapse", async () => {
    mockGetCommentsForMenuItem.mockResolvedValue([]);
    mockCreateDishComment.mockResolvedValue({
      id: "c-new",
      menuItemId: "item-1",
      userId: "user-1",
      content: "味道不错",
      authorNickname: "我",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    render(
      <MenuItemCommentPanel menuItemId="item-1" currentUserId="user-1" />,
    );
    fireEvent.click(screen.getByRole("button", { name: /评论/ }));

    await waitFor(() => {
      expect(screen.getByPlaceholderText("写下你的短评…")).toBeTruthy();
    });

    fireEvent.change(screen.getByPlaceholderText("写下你的短评…"), {
      target: { value: "味道不错" },
    });
    fireEvent.click(screen.getByRole("button", { name: "发表评论" }));

    await waitFor(() => {
      expect(screen.getByText("味道不错")).toBeTruthy();
      expect(screen.getByRole("button", { name: /评论 \(1\)/ })).toBeTruthy();
    });

    fireEvent.click(screen.getByRole("button", { name: /评论 \(1\)/ }));
    expect(screen.queryByText("味道不错")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /评论 \(1\)/ }));
    expect(screen.getByText("味道不错")).toBeTruthy();
    expect(mockGetCommentsForMenuItem).toHaveBeenCalledTimes(1);
  });

  it("lets authors edit their comments", async () => {
    mockGetCommentsForMenuItem.mockResolvedValue([
      {
        id: "c1",
        menuItemId: "item-1",
        userId: "user-1",
        content: "旧内容",
        authorNickname: "我",
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);
    mockUpdateDishComment.mockResolvedValue({
      id: "c1",
      menuItemId: "item-1",
      userId: "user-1",
      content: "新内容",
      authorNickname: "我",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    render(
      <MenuItemCommentPanel menuItemId="item-1" currentUserId="user-1" />,
    );
    fireEvent.click(screen.getByRole("button", { name: /评论/ }));

    await waitFor(() => {
      expect(screen.getByText("旧内容")).toBeTruthy();
    });

    fireEvent.click(screen.getByRole("button", { name: "编辑" }));
    fireEvent.change(screen.getByDisplayValue("旧内容"), {
      target: { value: "新内容" },
    });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => {
      expect(screen.getByText("新内容")).toBeTruthy();
    });
    expect(mockUpdateDishComment).toHaveBeenCalledWith("c1", "新内容");
  });

  it("lets authors delete their comments", async () => {
    mockGetCommentsForMenuItem.mockResolvedValue([
      {
        id: "c1",
        menuItemId: "item-1",
        userId: "user-1",
        content: "待删除",
        authorNickname: "我",
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);
    mockDeleteDishComment.mockResolvedValue(undefined);

    render(
      <MenuItemCommentPanel menuItemId="item-1" currentUserId="user-1" />,
    );
    fireEvent.click(screen.getByRole("button", { name: /评论/ }));

    await waitFor(() => {
      expect(screen.getByText("待删除")).toBeTruthy();
    });

    fireEvent.click(screen.getByRole("button", { name: "删除" }));

    await waitFor(() => {
      expect(mockDeleteDishComment).toHaveBeenCalledWith("c1");
    });
    await waitFor(() => {
      expect(screen.getByText("暂无评论")).toBeTruthy();
    });
    expect(screen.getByRole("button", { name: /评论 \(0\)/ })).toBeTruthy();
  });
});
