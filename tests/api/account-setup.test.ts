import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockRequireAuth,
  mockAccountFindFirst,
  mockUserFindFirst,
  mockSetPassword,
  mockUpdateWhere,
} = vi.hoisted(() => ({
  mockRequireAuth: vi.fn(),
  mockAccountFindFirst: vi.fn(),
  mockUserFindFirst: vi.fn(),
  mockSetPassword: vi.fn(),
  mockUpdateWhere: vi.fn(),
}));

vi.mock("@/lib/auth-guard", () => ({
  requireAuth: mockRequireAuth,
}));

vi.mock("@/db", () => ({
  db: {
    query: {
      accounts: { findFirst: mockAccountFindFirst },
      users: { findFirst: mockUserFindFirst },
    },
    update: vi.fn(() => ({
      set: vi.fn(() => ({ where: mockUpdateWhere })),
    })),
  },
}));

vi.mock("next/headers", () => ({
  headers: vi.fn().mockResolvedValue(new Headers()),
}));

vi.mock("@/lib/auth", () => ({
  auth: { api: { setPassword: mockSetPassword } },
}));

import { GET, POST } from "@/app/api/auth/account-setup/route";

describe("/api/auth/account-setup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAuth.mockResolvedValue({
      id: "otp-user",
      email: "1155000000@link.cuhk.edu.hk",
      nickname: "",
    });
    mockAccountFindFirst.mockResolvedValue(undefined);
    mockUserFindFirst.mockResolvedValue({ id: "otp-user", nickname: "新昵称" });
    mockSetPassword.mockResolvedValue({ status: true });
    mockUpdateWhere.mockResolvedValue(undefined);
  });

  it("reports every missing contributor field", async () => {
    const response = await GET();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      complete: false,
      needs: { nickname: true, password: true },
    });
  });

  it("completes both missing fields in one recoverable request", async () => {
    mockAccountFindFirst
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({ id: "credential-account" });
    const request = new Request("http://localhost/api/auth/account-setup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        nickname: "新昵称",
        password: "password123",
      }),
    });

    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      complete: true,
      needs: { nickname: false, password: false },
    });
    expect(mockSetPassword).toHaveBeenCalledWith(
      expect.objectContaining({ body: { newPassword: "password123" } }),
    );
  });

  it("never overwrites an existing password while completing a nickname", async () => {
    mockAccountFindFirst.mockResolvedValue({ id: "credential-account" });
    const request = new Request("http://localhost/api/auth/account-setup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        nickname: "新昵称",
        password: "replacement-password",
      }),
    });

    const response = await POST(request);

    expect(response.status).toBe(200);
    expect((await response.json()).complete).toBe(true);
    expect(mockSetPassword).not.toHaveBeenCalled();
  });

  it("sets only a password when the nickname is already complete", async () => {
    mockRequireAuth.mockResolvedValue({
      id: "otp-user",
      email: "1155000000@link.cuhk.edu.hk",
      nickname: "已有昵称",
    });
    mockUserFindFirst.mockResolvedValue({
      id: "otp-user",
      nickname: "已有昵称",
    });
    mockAccountFindFirst
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({ id: "credential-account" });
    const request = new Request("http://localhost/api/auth/account-setup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: "password123" }),
    });

    const response = await POST(request);

    expect(response.status).toBe(200);
    expect((await response.json()).complete).toBe(true);
    expect(mockSetPassword).toHaveBeenCalledOnce();
    expect(mockUpdateWhere).not.toHaveBeenCalled();
  });

  it("rejects a password longer than Better Auth accepts before mutation", async () => {
    const request = new Request("http://localhost/api/auth/account-setup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        nickname: "新昵称",
        password: "x".repeat(129),
      }),
    });

    const response = await POST(request);

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "密码最多 128 个字符" });
    expect(mockSetPassword).not.toHaveBeenCalled();
    expect(mockUpdateWhere).not.toHaveBeenCalled();
  });

  it("validates every missing field before making either change", async () => {
    const request = new Request("http://localhost/api/auth/account-setup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nickname: "x", password: "password123" }),
    });

    const response = await POST(request);

    expect(response.status).toBe(400);
    expect(mockSetPassword).not.toHaveBeenCalled();
    expect(mockUpdateWhere).not.toHaveBeenCalled();
  });

  it("returns a validation error for malformed JSON without changing the account", async () => {
    const request = new Request("http://localhost/api/auth/account-setup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not-json",
    });

    const response = await POST(request);

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "请求格式不正确" });
    expect(mockSetPassword).not.toHaveBeenCalled();
    expect(mockUpdateWhere).not.toHaveBeenCalled();
  });

  it("rejects a non-object JSON body", async () => {
    const request = new Request("http://localhost/api/auth/account-setup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "null",
    });

    const response = await POST(request);

    expect(response.status).toBe(400);
    expect(mockSetPassword).not.toHaveBeenCalled();
    expect(mockUpdateWhere).not.toHaveBeenCalled();
  });

  it("does not mutate an account that is already complete", async () => {
    mockRequireAuth.mockResolvedValue({
      id: "complete-user",
      nickname: "已有昵称",
    });
    mockAccountFindFirst.mockResolvedValue({ id: "credential-account" });
    mockUserFindFirst.mockResolvedValue({
      id: "complete-user",
      nickname: "已有昵称",
    });
    const request = new Request("http://localhost/api/auth/account-setup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nickname: "覆盖昵称", password: "new-password" }),
    });

    const response = await POST(request);

    expect(response.status).toBe(200);
    expect((await response.json()).complete).toBe(true);
    expect(mockSetPassword).not.toHaveBeenCalled();
    expect(mockUpdateWhere).not.toHaveBeenCalled();
  });

  it("recovers when another request sets the password concurrently", async () => {
    mockSetPassword.mockRejectedValueOnce({ code: "PASSWORD_ALREADY_SET" });
    mockAccountFindFirst
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({ id: "credential-account" })
      .mockResolvedValueOnce({ id: "credential-account" });
    const request = new Request("http://localhost/api/auth/account-setup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nickname: "新昵称", password: "password123" }),
    });

    const response = await POST(request);

    expect(response.status).toBe(200);
    expect((await response.json()).complete).toBe(true);
    expect(mockUpdateWhere).toHaveBeenCalledOnce();
  });

  it("can retry nickname completion after the password succeeded but the database update failed", async () => {
    mockAccountFindFirst
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({ id: "credential-account" })
      .mockResolvedValueOnce({ id: "credential-account" });
    mockUpdateWhere
      .mockRejectedValueOnce(new Error("database unavailable"))
      .mockResolvedValueOnce(undefined);
    const makeRequest = () =>
      new Request("http://localhost/api/auth/account-setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nickname: "新昵称", password: "password123" }),
      });

    await expect(POST(makeRequest())).rejects.toThrow("database unavailable");
    const retry = await POST(makeRequest());

    expect(retry.status).toBe(200);
    expect((await retry.json()).complete).toBe(true);
    expect(mockSetPassword).toHaveBeenCalledOnce();
    expect(mockUpdateWhere).toHaveBeenCalledTimes(2);
  });

  it("returns 404 if the authenticated user disappears during completion", async () => {
    mockRequireAuth.mockResolvedValue({
      id: "deleted-user",
      email: "1155000000@link.cuhk.edu.hk",
      nickname: "已有昵称",
    });
    mockAccountFindFirst.mockResolvedValue({ id: "credential-account" });
    mockUserFindFirst.mockResolvedValue(undefined);
    const request = new Request("http://localhost/api/auth/account-setup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    const response = await POST(request);

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "账号不存在" });
  });
});
