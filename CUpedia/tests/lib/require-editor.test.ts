import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  mockRedirect,
  mockGetSession,
  mockDbQueryUsers,
  mockDbExecute,
  mockHeaders,
} = vi.hoisted(() => ({
  mockRedirect: vi.fn(),
  mockGetSession: vi.fn(),
  mockDbQueryUsers: { findFirst: vi.fn() },
  mockDbExecute: vi.fn(),
  mockHeaders: vi.fn().mockResolvedValue(new Headers()),
}));

vi.mock("next/navigation", () => ({
  redirect: (...args: unknown[]) => {
    mockRedirect(...args);
    throw new Error("NEXT_REDIRECT");
  },
}));

vi.mock("next/headers", () => ({
  headers: mockHeaders,
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
    execute: mockDbExecute,
  },
}));

import { requireEditor, requireEditorOrRedirect } from "@/lib/auth-guard";
import { _clearCache } from "@/lib/site-settings";

function mockAuthenticatedUser(role: string) {
  mockGetSession.mockResolvedValue({
    user: { id: "user-1", email: "u@cuhk.edu.hk", name: null, image: null },
  });
  mockDbQueryUsers.findFirst.mockResolvedValue({
    id: "user-1",
    email: "u@cuhk.edu.hk",
    banned: false,
    role,
    nickname: "Test",
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  _clearCache();
});

describe("requireEditor", () => {
  it("allows admin when wiki_edit_role = admin", async () => {
    mockAuthenticatedUser("admin");
    mockDbExecute.mockResolvedValue({ rows: [{ value: "admin" }] });
    const user = await requireEditor();
    expect(user.role).toBe("admin");
  });

  it("denies regular user when wiki_edit_role = admin", async () => {
    mockAuthenticatedUser("user");
    mockDbExecute.mockResolvedValue({ rows: [{ value: "admin" }] });
    await expect(requireEditor()).rejects.toThrow("EDIT_PERMISSION_DENIED");
  });

  it("allows regular user when wiki_edit_role = user", async () => {
    mockAuthenticatedUser("user");
    mockDbExecute.mockResolvedValue({ rows: [{ value: "user" }] });
    const user = await requireEditor();
    expect(user.role).toBe("user");
  });

  it("allows admin when wiki_edit_role = user", async () => {
    mockAuthenticatedUser("admin");
    mockDbExecute.mockResolvedValue({ rows: [{ value: "user" }] });
    const user = await requireEditor();
    expect(user.role).toBe("admin");
  });

  it("defaults to admin-only when no setting exists", async () => {
    mockAuthenticatedUser("user");
    mockDbExecute.mockResolvedValue({ rows: [] });
    await expect(requireEditor()).rejects.toThrow("EDIT_PERMISSION_DENIED");
  });

  it("defaults to admin-only — admin still allowed", async () => {
    mockAuthenticatedUser("admin");
    mockDbExecute.mockResolvedValue({ rows: [] });
    const user = await requireEditor();
    expect(user.role).toBe("admin");
  });
});

describe("requireEditorOrRedirect", () => {
  it("redirects unauthorized user to /wiki", async () => {
    mockAuthenticatedUser("user");
    mockDbExecute.mockResolvedValue({ rows: [{ value: "admin" }] });
    await expect(requireEditorOrRedirect()).rejects.toThrow("NEXT_REDIRECT");
    expect(mockRedirect).toHaveBeenCalledWith("/wiki");
  });

  it("allows authorized user", async () => {
    mockAuthenticatedUser("admin");
    mockDbExecute.mockResolvedValue({ rows: [{ value: "admin" }] });
    const user = await requireEditorOrRedirect();
    expect(user.role).toBe("admin");
  });
});
