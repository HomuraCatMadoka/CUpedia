import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const {
  mockGetSession,
  mockRedirect,
  mockDbQueryUsers,
  mockDbTransaction,
  mockAssertContributorComplete,
} = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  mockRedirect: vi.fn(),
  mockDbQueryUsers: { findFirst: vi.fn() },
  mockDbTransaction: vi.fn(),
  mockAssertContributorComplete: vi.fn(async (user) => user),
}));

vi.mock("next/navigation", () => ({
  redirect: (...args: unknown[]) => {
    mockRedirect(...args);
    throw new Error("NEXT_REDIRECT");
  },
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
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

vi.mock("@/lib/contributor-account", () => ({
  assertContributorComplete: mockAssertContributorComplete,
}));

vi.mock("@/db", () => ({
  db: {
    query: { users: mockDbQueryUsers },
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    transaction: (fn: (tx: unknown) => Promise<unknown>) =>
      mockDbTransaction(fn),
  },
}));

import {
  adminDeleteDishComment,
  adminListDishCommentAuditLogs,
  adminListDishComments,
  createDishComment,
  deleteDishComment,
  getCommentCountsForCanteen,
  getCommentsForMenuItem,
  updateDishComment,
} from "@/lib/canteen-comment-actions";
import {
  getCanteenDeleteImpact,
  getMenuItemDeleteImpact,
} from "@/lib/canteen-admin-actions";
import { ADMIN_DISH_COMMENT_LIST_LIMIT } from "@/lib/canteen-types";
import { resetCanteenMockState } from "@/lib/canteen-mock";

const ITEM_ID = "mock-item-demo";

function mockLoggedInUser(
  id = "user-1",
  nickname = "测试用户",
  email = `${id}@test.com`,
) {
  mockGetSession.mockResolvedValue({ user: { id, name: nickname, email } });
  mockDbQueryUsers.findFirst.mockResolvedValue({
    id,
    email,
    nickname,
    role: "user",
    banned: false,
  });
}

function mockAdminUser() {
  mockGetSession.mockResolvedValue({
    user: { id: "admin-1", email: "admin@test.com", name: "Admin" },
  });
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

  it("returns per-item comment counts for a canteen", async () => {
    mockLoggedInUser();
    await createDishComment(ITEM_ID, "很好吃");
    await createDishComment(ITEM_ID, "味道不错");
    const counts = await getCommentCountsForCanteen("mock-canteen-demo");
    expect(counts[ITEM_ID]).toBe(2);
  });

  it("rejects anonymous comment creation", async () => {
    await expect(createDishComment(ITEM_ID, "匿名留言")).rejects.toThrow(
      "NEXT_REDIRECT",
    );
  });

  it("blocks an incomplete account before creating an attributed comment", async () => {
    mockLoggedInUser();
    mockAssertContributorComplete.mockRejectedValueOnce(
      new Error("ACCOUNT_SETUP_REQUIRED"),
    );

    await expect(createDishComment(ITEM_ID, "很好吃")).rejects.toThrow(
      "ACCOUNT_SETUP_REQUIRED",
    );
    expect(await getCommentsForMenuItem(ITEM_ID)).toEqual([]);
  });

  it("rejects invalid comment content before auth", async () => {
    await expect(
      createDishComment(ITEM_ID, "<script>alert(1)</script>"),
    ).rejects.toThrow("INVALID_COMMENT");
    expect(mockGetSession).not.toHaveBeenCalled();
  });

  it("does not query DB users when creating in mock mode", async () => {
    mockLoggedInUser();
    await createDishComment(ITEM_ID, "纯内存");
    expect(mockDbQueryUsers.findFirst).not.toHaveBeenCalled();
  });

  it("rejects banned user comment creation", async () => {
    const prevMock = process.env.CANTEEN_MOCK_DATA;
    process.env.CANTEEN_MOCK_DATA = "false";
    try {
      mockGetSession.mockResolvedValue({ user: { id: "user-1" } });
      mockDbQueryUsers.findFirst.mockResolvedValue({
        id: "user-1",
        email: "b@t.com",
        nickname: "B",
        role: "user",
        banned: true,
      });
      await expect(createDishComment(ITEM_ID, "被封禁")).rejects.toThrow(
        "NEXT_REDIRECT",
      );
    } finally {
      process.env.CANTEEN_MOCK_DATA = prevMock;
    }
  });

  it("lets authors update their own comments", async () => {
    mockLoggedInUser();
    const created = await createDishComment(ITEM_ID, "初稿");
    const updated = await updateDishComment(created.id, "改好了");
    expect(updated.content).toBe("改好了");
    const comments = await getCommentsForMenuItem(ITEM_ID);
    expect(comments[0].content).toBe("改好了");
  });

  it("rejects non-author update", async () => {
    mockLoggedInUser("user-a", "作者A");
    const created = await createDishComment(ITEM_ID, "A的内容");
    mockLoggedInUser("user-b", "作者B");
    await expect(updateDishComment(created.id, "篡改")).rejects.toThrow(
      "COMMENT_NOT_FOUND",
    );
  });

  it("lets authors delete their own comments", async () => {
    mockLoggedInUser();
    const created = await createDishComment(ITEM_ID, "待删除");
    await deleteDishComment(created.id);
    const comments = await getCommentsForMenuItem(ITEM_ID);
    expect(comments).toHaveLength(0);
  });

  it("rejects non-author delete", async () => {
    mockLoggedInUser("user-a", "作者A");
    const created = await createDishComment(ITEM_ID, "A的内容");
    mockLoggedInUser("user-b", "作者B");
    await expect(deleteDishComment(created.id)).rejects.toThrow(
      "COMMENT_NOT_FOUND",
    );
    const comments = await getCommentsForMenuItem(ITEM_ID);
    expect(comments).toHaveLength(1);
  });

  it("lets admin delete any comment", async () => {
    mockLoggedInUser("user-2", "作者", "author@test.com");
    const created = await createDishComment(ITEM_ID, "管理员可删");
    mockAdminUser();
    await adminDeleteDishComment(created.id);
    const comments = await getCommentsForMenuItem(ITEM_ID);
    expect(comments).toHaveLength(0);

    const logs = await adminListDishCommentAuditLogs();
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({
      actorUserId: "admin-1",
      actorEmail: "admin@test.com",
      action: "dish_comment.delete",
      targetId: created.id,
      targetUserId: "user-2",
      details: {
        authorEmail: "author@test.com",
        authorNickname: "作者",
        content: "管理员可删",
        canteenName: "演示食堂",
        menuItemName: "演示菜品",
      },
    });
  });

  it("deletes and audits a comment in one database transaction", async () => {
    process.env.CANTEEN_MOCK_DATA = "false";
    mockAdminUser();

    const selectChain = {
      from: vi.fn(),
      innerJoin: vi.fn(),
      where: vi.fn(),
      limit: vi.fn().mockResolvedValue([
        {
          id: "comment-1",
          userId: "user-2",
          content: "违规内容",
          createdAt: new Date("2026-07-21T00:00:00Z"),
          authorEmail: "author@test.com",
          authorNickname: "作者",
          menuItemId: "item-1",
          menuItemName: "咖喱饭",
          canteenId: "canteen-1",
          canteenName: "演示食堂",
        },
      ]),
    };
    selectChain.from.mockReturnValue(selectChain);
    selectChain.innerJoin.mockReturnValue(selectChain);
    selectChain.where.mockReturnValue(selectChain);

    const deleteChain = {
      where: vi.fn(),
      returning: vi.fn().mockResolvedValue([{ id: "comment-1" }]),
    };
    deleteChain.where.mockReturnValue(deleteChain);
    const auditValues = vi.fn().mockResolvedValue(undefined);
    const tx = {
      select: vi.fn().mockReturnValue(selectChain),
      delete: vi.fn().mockReturnValue(deleteChain),
      insert: vi.fn().mockReturnValue({ values: auditValues }),
    };
    mockDbTransaction.mockImplementation(async (fn) => fn(tx));

    await adminDeleteDishComment("comment-1");

    expect(tx.delete).toHaveBeenCalledOnce();
    expect(tx.insert).toHaveBeenCalledOnce();
    expect(auditValues).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: "admin-1",
        actorEmail: "admin@test.com",
        action: "dish_comment.delete",
        targetId: "comment-1",
        targetUserId: "user-2",
        details: expect.objectContaining({
          authorEmail: "author@test.com",
          content: "违规内容",
        }),
      }),
    );
  });

  it("lists recent dish comments for admin newest-first with context", async () => {
    mockLoggedInUser("user-a", "作者A");
    await createDishComment(ITEM_ID, "第一条");
    mockLoggedInUser("user-b", "作者B", "author-b@test.com");
    await createDishComment(ITEM_ID, "第二条");
    mockAdminUser();
    const listed = await adminListDishComments();
    expect(listed.length).toBeGreaterThanOrEqual(2);
    expect(listed[0].content).toBe("第二条");
    expect(listed[0].canteenName).toBe("演示食堂");
    expect(listed[0].menuItemName).toBe("演示菜品");
    expect(listed[0].authorNickname).toBe("作者B");
    expect(listed[0].authorEmail).toBe("author-b@test.com");
    expect(listed.length).toBeLessThanOrEqual(ADMIN_DISH_COMMENT_LIST_LIMIT);
  });

  it("rejects non-admin listing comments", async () => {
    mockLoggedInUser();
    await expect(adminListDishComments()).rejects.toThrow("NEXT_REDIRECT");
  });

  it("rejects non-admin listing comment audit logs", async () => {
    mockLoggedInUser();
    await expect(adminListDishCommentAuditLogs()).rejects.toThrow(
      "NEXT_REDIRECT",
    );
  });

  it("includes comment count in menu item delete impact", async () => {
    mockLoggedInUser();
    await createDishComment(ITEM_ID, "一条评论");
    mockAdminUser();
    const impact = await getMenuItemDeleteImpact(ITEM_ID);
    expect(impact.commentCount).toBe(1);
  });

  it("includes comment count in canteen delete impact", async () => {
    mockLoggedInUser();
    await createDishComment(ITEM_ID, "一条评论");
    mockAdminUser();
    const impact = await getCanteenDeleteImpact("mock-canteen-demo");
    expect(impact.commentCount).toBe(1);
  });
});
