import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockPeek } = vi.hoisted(() => ({
  mockPeek: vi.fn(),
}));

vi.mock("@/lib/magic-link-rate-limit", () => ({
  peekMagicLinkRateLimit: mockPeek,
}));

import { POST } from "@/app/api/auth/magic-link/preflight/route";

beforeEach(() => {
  vi.clearAllMocks();
});

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/auth/magic-link/preflight", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/auth/magic-link/preflight", () => {
  it("returns INVALID_EMAIL when email is missing", async () => {
    const res = await POST(makeRequest({}));
    const data = await res.json();
    expect(data).toEqual({ ok: false, code: "INVALID_EMAIL" });
  });

  it("returns INVALID_EMAIL when email is not a string", async () => {
    const res = await POST(makeRequest({ email: 123 }));
    const data = await res.json();
    expect(data).toEqual({ ok: false, code: "INVALID_EMAIL" });
  });

  it("forwards ok result from peekMagicLinkRateLimit", async () => {
    mockPeek.mockResolvedValue({ ok: true });
    const res = await POST(makeRequest({ email: "user@cuhk.edu.hk" }));
    const data = await res.json();
    expect(data).toEqual({ ok: true });
    expect(mockPeek).toHaveBeenCalledWith("user@cuhk.edu.hk");
  });

  it("forwards RATE_LIMITED with retryAfterSeconds", async () => {
    mockPeek.mockResolvedValue({
      ok: false,
      code: "RATE_LIMITED",
      retryAfterSeconds: 42,
    });
    const res = await POST(makeRequest({ email: "user@cuhk.edu.hk" }));
    const data = await res.json();
    expect(data).toEqual({
      ok: false,
      code: "RATE_LIMITED",
      retryAfterSeconds: 42,
    });
  });

  it("forwards SUPPRESSED for banned users", async () => {
    mockPeek.mockResolvedValue({ ok: false, code: "SUPPRESSED" });
    const res = await POST(makeRequest({ email: "banned@cuhk.edu.hk" }));
    const data = await res.json();
    expect(data).toEqual({ ok: false, code: "SUPPRESSED" });
  });

  it("returns 500 JSON error when peekMagicLinkRateLimit throws", async () => {
    mockPeek.mockRejectedValue(new Error("DB connection lost"));
    const res = await POST(makeRequest({ email: "user@cuhk.edu.hk" }));
    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data).toEqual({ ok: false, code: "INTERNAL_ERROR" });
  });

  it("returns 400 JSON error when body is not valid JSON", async () => {
    const req = new Request("http://localhost/api/auth/magic-link/preflight", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not json",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data).toEqual({ ok: false, code: "INVALID_EMAIL" });
  });
});
