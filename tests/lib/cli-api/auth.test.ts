import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockGetSession, mockDbQueryUsers } = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  mockDbQueryUsers: { findFirst: vi.fn() },
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
  },
}));

import {
  getCliSessionUser,
  requireCliAuth,
  requireCliAdmin,
} from "@/lib/cli-api/auth";

function makeRequest(): Request {
  return new Request("http://localhost/api/cli/test", {
    headers: { authorization: "Bearer test-token" },
  });
}

const SESSION = { user: { id: "user-1", email: "u@cuhk.edu.hk" } };

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getCliSessionUser", () => {
  it("returns null without a session", async () => {
    mockGetSession.mockResolvedValue(null);
    await expect(getCliSessionUser(makeRequest())).resolves.toBeNull();
  });

  it("returns null when the session has no user", async () => {
    mockGetSession.mockResolvedValue({ user: null });
    await expect(getCliSessionUser(makeRequest())).resolves.toBeNull();
  });

  it("returns null when the DB user row is missing", async () => {
    mockGetSession.mockResolvedValue(SESSION);
    mockDbQueryUsers.findFirst.mockResolvedValue(undefined);
    await expect(getCliSessionUser(makeRequest())).resolves.toBeNull();
  });

  it("returns the DB-refreshed user for a valid session", async () => {
    mockGetSession.mockResolvedValue(SESSION);
    mockDbQueryUsers.findFirst.mockResolvedValue({
      id: "user-1",
      email: "u@cuhk.edu.hk",
      nickname: "NewNick",
      role: "admin",
      banned: false,
    });
    await expect(getCliSessionUser(makeRequest())).resolves.toEqual({
      id: "user-1",
      email: "u@cuhk.edu.hk",
      nickname: "NewNick",
      role: "admin",
      banned: false,
    });
  });

  it("surfaces a banned flag without filtering the user out", async () => {
    mockGetSession.mockResolvedValue(SESSION);
    mockDbQueryUsers.findFirst.mockResolvedValue({
      id: "user-1",
      email: "u@cuhk.edu.hk",
      nickname: "N",
      role: "user",
      banned: true,
    });
    const user = await getCliSessionUser(makeRequest());
    expect(user?.banned).toBe(true);
  });

  it("forwards the request headers to auth.api.getSession", async () => {
    mockGetSession.mockResolvedValue(null);
    const request = makeRequest();
    await getCliSessionUser(request);
    expect(mockGetSession).toHaveBeenCalledWith({ headers: request.headers });
  });
});

describe("requireCliAuth", () => {
  it("returns 401 UNAUTHORIZED when anonymous", async () => {
    mockGetSession.mockResolvedValue(null);
    const { user, response } = await requireCliAuth(makeRequest());
    expect(user).toBeNull();
    expect(response?.status).toBe(401);
    expect(await response?.json()).toEqual({ error: "UNAUTHORIZED" });
  });

  it("returns 403 USER_BANNED for a banned user", async () => {
    mockGetSession.mockResolvedValue(SESSION);
    mockDbQueryUsers.findFirst.mockResolvedValue({
      id: "user-1",
      email: "u@cuhk.edu.hk",
      nickname: "N",
      role: "user",
      banned: true,
    });
    const { user, response } = await requireCliAuth(makeRequest());
    expect(user).toBeNull();
    expect(response?.status).toBe(403);
    expect(await response?.json()).toEqual({ error: "USER_BANNED" });
  });

  it("returns the user with no response for an unbanned caller", async () => {
    mockGetSession.mockResolvedValue(SESSION);
    mockDbQueryUsers.findFirst.mockResolvedValue({
      id: "user-1",
      email: "u@cuhk.edu.hk",
      nickname: "N",
      role: "user",
      banned: false,
    });
    const { user, response } = await requireCliAuth(makeRequest());
    expect(response).toBeNull();
    expect(user).toEqual(
      expect.objectContaining({ id: "user-1", role: "user", banned: false }),
    );
  });
});

describe("requireCliAdmin", () => {
  it("returns 401 UNAUTHORIZED when anonymous", async () => {
    mockGetSession.mockResolvedValue(null);
    const { user, response } = await requireCliAdmin(makeRequest());
    expect(user).toBeNull();
    expect(response?.status).toBe(401);
    expect(await response?.json()).toEqual({ error: "UNAUTHORIZED" });
  });

  it("returns 403 FORBIDDEN for a logged-in non-admin", async () => {
    mockGetSession.mockResolvedValue(SESSION);
    mockDbQueryUsers.findFirst.mockResolvedValue({
      id: "user-1",
      email: "u@cuhk.edu.hk",
      nickname: "N",
      role: "user",
      banned: false,
    });
    const { user, response } = await requireCliAdmin(makeRequest());
    expect(user).toBeNull();
    expect(response?.status).toBe(403);
    expect(await response?.json()).toEqual({ error: "FORBIDDEN" });
  });

  it("returns the user for an admin", async () => {
    mockGetSession.mockResolvedValue(SESSION);
    mockDbQueryUsers.findFirst.mockResolvedValue({
      id: "user-1",
      email: "u@cuhk.edu.hk",
      nickname: "N",
      role: "admin",
      banned: false,
    });
    const { user, response } = await requireCliAdmin(makeRequest());
    expect(response).toBeNull();
    expect(user?.role).toBe("admin");
  });
});
