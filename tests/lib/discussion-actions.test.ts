import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  mockRedirect,
  mockGetSession,
  mockDbQueryUsers,
  mockDbQueryDiscussions,
  mockDbSelect,
  mockDbInsert,
  mockDbUpdate,
  mockDbDelete,
  mockHeaders,
  mockAssertContributorComplete,
} = vi.hoisted(() => {
  const chain = () => {
    const obj: Record<string, unknown> = {};
    obj.from = vi.fn().mockReturnValue(obj);
    obj.innerJoin = vi.fn().mockReturnValue(obj);
    obj.where = vi.fn().mockReturnValue(obj);
    obj.orderBy = vi.fn().mockResolvedValue([]);
    obj.values = vi.fn().mockReturnValue(obj);
    obj.returning = vi.fn().mockResolvedValue([]);
    obj.set = vi.fn().mockReturnValue(obj);
    return obj;
  };
  return {
    mockRedirect: vi.fn(),
    mockGetSession: vi.fn(),
    mockDbQueryUsers: { findFirst: vi.fn() },
    mockDbQueryDiscussions: { findFirst: vi.fn() },
    mockDbSelect: vi.fn().mockReturnValue(chain()),
    mockDbInsert: vi.fn().mockReturnValue(chain()),
    mockDbUpdate: vi.fn().mockReturnValue(chain()),
    mockDbDelete: vi.fn().mockReturnValue(chain()),
    mockHeaders: vi.fn().mockResolvedValue(new Headers()),
    mockAssertContributorComplete: vi.fn(async (user) => user),
  };
});

vi.mock("next/navigation", () => ({
  redirect: (...args: unknown[]) => {
    mockRedirect(...args);
    throw new Error("NEXT_REDIRECT");
  },
}));

vi.mock("next/headers", () => ({ headers: mockHeaders }));

vi.mock("@/lib/auth", () => ({
  auth: {
    api: { getSession: (opts: unknown) => mockGetSession(opts) },
  },
}));

vi.mock("@/lib/site-settings", () => ({
  getWikiEditRoleFresh: vi.fn().mockResolvedValue("user"),
}));

vi.mock("@/lib/contributor-account", () => ({
  assertContributorComplete: mockAssertContributorComplete,
}));

vi.mock("@/db", () => ({
  db: {
    query: {
      users: mockDbQueryUsers,
      discussions: mockDbQueryDiscussions,
    },
    select: (...args: unknown[]) => mockDbSelect(...args),
    insert: (...args: unknown[]) => mockDbInsert(...args),
    update: (...args: unknown[]) => mockDbUpdate(...args),
    delete: (...args: unknown[]) => mockDbDelete(...args),
  },
}));

import {
  getDiscussions,
  createDiscussion,
  addReply,
  resolveDiscussion,
  deleteDiscussion,
} from "@/lib/discussion-actions";

function mockAuthSession(id = "user-1", role = "user") {
  mockGetSession.mockResolvedValue({
    user: { id, email: "user@cuhk.edu.hk", name: null, image: null, role },
  });
  mockDbQueryUsers.findFirst.mockResolvedValue({
    id,
    email: "user@cuhk.edu.hk",
    nickname: "TestUser",
    role,
    banned: false,
  });
}

beforeEach(() => vi.clearAllMocks());

describe("getDiscussions", () => {
  it("returns empty array when no discussions exist", async () => {
    const result = await getDiscussions("page-1");
    expect(result).toEqual([]);
    expect(mockDbSelect).toHaveBeenCalled();
  });

  it("builds threaded structure from flat rows", async () => {
    const now = new Date();
    const rows = [
      {
        id: "d1",
        commentMarkId: "abc",
        content: "root comment",
        resolved: false,
        parentId: null,
        createdAt: now,
        userId: "u1",
        nickname: "Alice",
      },
      {
        id: "d2",
        commentMarkId: "abc",
        content: "reply",
        resolved: false,
        parentId: "d1",
        createdAt: new Date(now.getTime() + 1000),
        userId: "u2",
        nickname: "Bob",
      },
    ];
    const chain = mockDbSelect();
    chain.orderBy.mockResolvedValue(rows);

    const result = await getDiscussions("page-1");
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("d1");
    expect(result[0].replies).toHaveLength(1);
    expect(result[0].replies[0].id).toBe("d2");
    expect(result[0].canResolve).toBe(false);
  });

  it("only marks the owner or an admin as able to resolve", async () => {
    const chain = mockDbSelect();
    chain.orderBy.mockResolvedValue([
      {
        id: "d1",
        commentMarkId: "abc",
        content: "root",
        resolved: false,
        parentId: null,
        createdAt: new Date(),
        userId: "owner",
        nickname: "Owner",
      },
    ]);
    mockAuthSession("other", "user");
    expect((await getDiscussions("page-1"))[0].canResolve).toBe(false);

    mockAuthSession("owner", "user");
    expect((await getDiscussions("page-1"))[0].canResolve).toBe(true);

    mockAuthSession("admin", "admin");
    expect((await getDiscussions("page-1"))[0].canResolve).toBe(true);
  });

  it("degrades to empty list when the query fails", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const chain = mockDbSelect();
    chain.orderBy.mockRejectedValueOnce(
      new Error('relation "discussions" does not exist'),
    );

    const result = await getDiscussions("page-1");
    expect(result).toEqual([]);
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});

describe("createDiscussion", () => {
  it("blocks an incomplete account before inserting attributed content", async () => {
    mockAuthSession();
    mockAssertContributorComplete.mockRejectedValueOnce(
      new Error("ACCOUNT_SETUP_REQUIRED"),
    );

    await expect(createDiscussion("p1", "mark1", "hello")).rejects.toThrow(
      "ACCOUNT_SETUP_REQUIRED",
    );
    expect(mockDbInsert).not.toHaveBeenCalled();
  });

  it("rejects unauthenticated caller", async () => {
    mockGetSession.mockResolvedValue(null);
    await expect(createDiscussion("p1", "mark1", "hello")).rejects.toThrow(
      "NEXT_REDIRECT",
    );
  });

  it("rejects empty content", async () => {
    mockAuthSession();
    await expect(createDiscussion("p1", "mark1", "   ")).rejects.toThrow(
      "Content cannot be empty",
    );
  });

  it("creates discussion and returns id", async () => {
    mockAuthSession();
    const chain = mockDbInsert();
    chain.returning.mockResolvedValue([{ id: "new-id" }]);

    const id = await createDiscussion("p1", "mark1", "hello");
    expect(id).toBe("new-id");
    expect(mockDbInsert).toHaveBeenCalled();
  });
});

describe("addReply", () => {
  it("blocks an incomplete account before looking up the discussion", async () => {
    mockAuthSession();
    mockAssertContributorComplete.mockRejectedValueOnce(
      new Error("ACCOUNT_SETUP_REQUIRED"),
    );

    await expect(addReply("d1", "reply")).rejects.toThrow(
      "ACCOUNT_SETUP_REQUIRED",
    );
    expect(mockDbQueryDiscussions.findFirst).not.toHaveBeenCalled();
    expect(mockDbInsert).not.toHaveBeenCalled();
  });

  it("rejects reply to non-root discussion", async () => {
    mockAuthSession();
    mockDbQueryDiscussions.findFirst.mockResolvedValue(null);
    await expect(addReply("nonexist", "reply")).rejects.toThrow(
      "Discussion not found",
    );
  });

  it("adds reply to existing discussion", async () => {
    mockAuthSession();
    mockDbQueryDiscussions.findFirst.mockResolvedValue({
      id: "d1",
      pageId: "p1",
      commentMarkId: "mark1",
    });
    const chain = mockDbInsert();
    chain.returning.mockResolvedValue([{ id: "reply-id" }]);

    const id = await addReply("d1", "reply text");
    expect(id).toBe("reply-id");
  });
});

describe("resolveDiscussion", () => {
  it("rejects resolving nonexistent discussion", async () => {
    mockAuthSession();
    mockDbQueryDiscussions.findFirst.mockResolvedValue(null);
    await expect(resolveDiscussion("nonexist")).rejects.toThrow(
      "Discussion not found",
    );
  });

  it("rejects non-owner non-admin from resolving", async () => {
    mockAuthSession("user-2");
    mockDbQueryDiscussions.findFirst.mockResolvedValue({
      id: "d1",
      userId: "user-1",
    });
    await expect(resolveDiscussion("d1")).rejects.toThrow("Permission denied");
  });

  it("allows owner to resolve their discussion", async () => {
    mockAuthSession("user-1");
    mockDbQueryDiscussions.findFirst.mockResolvedValue({
      id: "d1",
      userId: "user-1",
    });
    const chain = mockDbUpdate();
    chain.where.mockResolvedValue(undefined);

    await expect(resolveDiscussion("d1")).resolves.not.toThrow();
    expect(mockDbUpdate).toHaveBeenCalled();
  });

  it("allows admin to resolve any discussion", async () => {
    mockAuthSession("admin-1", "admin");
    mockDbQueryDiscussions.findFirst.mockResolvedValue({
      id: "d1",
      userId: "user-1",
    });
    const chain = mockDbUpdate();
    chain.where.mockResolvedValue(undefined);

    await expect(resolveDiscussion("d1")).resolves.not.toThrow();
  });
});

describe("deleteDiscussion", () => {
  it("rejects deleting nonexistent discussion", async () => {
    mockAuthSession();
    mockDbQueryDiscussions.findFirst.mockResolvedValue(null);
    await expect(deleteDiscussion("nonexist")).rejects.toThrow(
      "Discussion not found",
    );
  });

  it("allows owner to delete their discussion", async () => {
    mockAuthSession("user-1");
    mockDbQueryDiscussions.findFirst.mockResolvedValue({
      id: "d1",
      userId: "user-1",
    });
    const chain = mockDbDelete();
    chain.where.mockResolvedValue(undefined);

    await expect(deleteDiscussion("d1")).resolves.not.toThrow();
  });

  it("rejects non-owner non-admin from deleting", async () => {
    mockAuthSession("user-2");
    mockDbQueryDiscussions.findFirst.mockResolvedValue({
      id: "d1",
      userId: "user-1",
    });
    await expect(deleteDiscussion("d1")).rejects.toThrow("Permission denied");
  });

  it("allows admin to delete any discussion", async () => {
    mockAuthSession("admin-1", "admin");
    mockDbQueryDiscussions.findFirst.mockResolvedValue({
      id: "d1",
      userId: "user-1",
    });
    const chain = mockDbDelete();
    chain.where.mockResolvedValue(undefined);

    await expect(deleteDiscussion("d1")).resolves.not.toThrow();
  });
});
