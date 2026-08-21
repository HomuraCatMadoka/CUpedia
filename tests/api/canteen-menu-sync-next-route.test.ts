import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { syncNextDueMenuSource } = vi.hoisted(() => ({
  syncNextDueMenuSource: vi.fn(),
}));

vi.mock("@/lib/canteen-menu-source-sync", () => ({
  syncNextDueMenuSource,
}));

import { POST } from "@/app/api/internal/canteen-menu-sync/next/route";

function request(authorization?: string, body?: unknown) {
  return new Request("http://localhost/api/internal/canteen-menu-sync/next", {
    method: "POST",
    headers: {
      ...(authorization ? { authorization } : {}),
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

describe("POST /api/internal/canteen-menu-sync/next", () => {
  beforeEach(() => {
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("MENU_SYNC_TRIGGER_SECRET", "dedicated-menu-secret");
    syncNextDueMenuSource.mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("is unavailable outside production", async () => {
    vi.stubEnv("VERCEL_ENV", "preview");

    const response = await POST(request("Bearer dedicated-menu-secret"));

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "NOT_AVAILABLE" });
    expect(syncNextDueMenuSource).not.toHaveBeenCalled();
  });

  it("fails closed when the dedicated secret is missing", async () => {
    vi.stubEnv("MENU_SYNC_TRIGGER_SECRET", "");

    const response = await POST(request());

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "NOT_CONFIGURED" });
    expect(syncNextDueMenuSource).not.toHaveBeenCalled();
  });

  it("rejects a request without the dedicated bearer secret", async () => {
    const response = await POST(request("Bearer wrong-secret"));

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "UNAUTHORIZED" });
    expect(syncNextDueMenuSource).not.toHaveBeenCalled();
  });

  it("runs once without accepting caller scheduling input", async () => {
    syncNextDueMenuSource.mockResolvedValue({
      disposition: "no-work",
      window: "2026-08-20/lunch",
    });

    const response = await POST(
      request("Bearer dedicated-menu-secret", {
        sourceId: "ignored",
        provider: "ignored",
        now: "1999-01-01T00:00:00Z",
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      disposition: "no-work",
      window: "2026-08-20/lunch",
    });
    expect(syncNextDueMenuSource).toHaveBeenCalledOnce();
    expect(syncNextDueMenuSource).toHaveBeenCalledWith();
  });
});
