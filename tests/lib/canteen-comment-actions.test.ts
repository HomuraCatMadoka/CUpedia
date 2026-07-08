import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { mockGetSession, mockRedirect, mockDbQueryUsers } = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  mockRedirect: vi.fn(),
  mockDbQueryUsers: { findFirst: vi.fn() },
}));

vi.mock("next/navigation", () => ({
  redirect: (...args: unknown[]) => {
    mockRedirect(...args);
    throw new Error("NEXT_REDIRECT");
  },
}));

vi.mock("next/headers", () => ({
  headers: vi.fn().mockResolvedValue(new Headers()),
}));

vi.mock("@/lib/auth", () => ({
  auth: {
    api: {
      getSession: (opts: unknown) => mockGetSession(opts),
    },
  },
}));

vi.mock("@/db", () => ({
  db: {
    query: { users: mockDbQueryUsers },
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}));

import {
  adminDeleteDishComment,
  createDishComment,
  deleteDishComment,
  getCommentsForMenuItem,
  updateDishComment,
} from "@/lib/canteen-comment-actions";
import { getMenuItemDeleteImpact } from "@/lib/canteen-admin-actions";
import { resetCanteenMockState } from "@/lib/canteen-mock";

const ITEM_ID = "mock-item-demo";

function mockLoggedInUser(id = "user-1", nickname = "测试用户") {
  mockGetSession.mockResolvedValue({ user: { id } });
  mockDbQueryUsers.findFirst.mockResolvedValue({
    id,
    email: "user@test.com",
    nickname,
    role: "user",
    banned: false,
  });
}

function mockAdminUser() {
  mockGetSession.mockResolvedValue({ user: { id: "admin-1" } });
  mockDbQueryUsers.findFirst.mockResolvedValue({
    id: "admin-1",
    email: "admin@test.com",
    nickname: "Admin",
    role: "admin",
    banned: false,
  });
}

describe("canteen-comment-actions (mock mode)", () => {
  const prevMock = process.env.CANTEEN_MOCK_DATA;

  beforeEach(() => {
    process.env.CANTEEN_MOCK_DATA = "true";
    resetCanteenMockState();
    mockGetSession.mockResolvedValue(null);
    mockDbQueryUsers.findFirst.mockResolvedValue(undefined);
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.env.CANTEEN_MOCK_DATA = prevMock;
    resetCanteenMockState();
  });

  it("returns comments for a menu item", async () => {
    mockLoggedInUser();
    await createDishComment(ITEM_ID, "很好吃");
    const comments = await getCommentsForMenuItem(ITEM_ID);
    expect(comments).toHaveLength(1);
    expect(comments[0].content).toBe("很好吃");
    expect(comments[0].authorNickname).toBe("测试用户");
  });

  it("rejects anonymous comment creation", async () => {
    await expect(createDishComment(ITEM_ID, "匿名留言")).rejects.toThrow(
      "NEXT_REDIRECT",
    );
  });

  it("rejects invalid comment content before auth", async () => {
    await expect(
      createDishComment(ITEM_ID, "<script>alert(1)</script>"),
    ).rejects.toThrow("INVALID_COMMENT");
    expect(mockGetSession).not.toHaveBeenCalled();
  });

  it("lets authors update their own comments", async () => {
    mockLoggedInUser();
    const created = await createDishComment(ITEM_ID, "初稿");
    const updated = await updateDishComment(created.id, "改好了");
    expect(updated.content).toBe("改好了");
    const comments = await getCommentsForMenuItem(ITEM_ID);
    expect(comments[0].content).toBe("改好了");
  });

  it("lets authors delete their own comments", async () => {
    mockLoggedInUser();
    const created = await createDishComment(ITEM_ID, "待删除");
    await deleteDishComment(created.id);
    const comments = await getCommentsForMenuItem(ITEM_ID);
    expect(comments).toHaveLength(0);
  });

  it("lets admin delete any comment", async () => {
    mockLoggedInUser("user-2", "作者");
    const created = await createDishComment(ITEM_ID, "管理员可删");
    mockAdminUser();
    await adminDeleteDishComment(created.id);
    const comments = await getCommentsForMenuItem(ITEM_ID);
    expect(comments).toHaveLength(0);
  });

  it("includes comment count in menu item delete impact", async () => {
    mockLoggedInUser();
    await createDishComment(ITEM_ID, "一条评论");
    mockAdminUser();
    const impact = await getMenuItemDeleteImpact(ITEM_ID);
    expect(impact.commentCount).toBe(1);
  });
});
