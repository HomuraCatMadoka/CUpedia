import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockRevalidateTag } = vi.hoisted(() => ({
  mockRevalidateTag: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidateTag: (...args: unknown[]) => mockRevalidateTag(...args),
}));

import { POST } from "@/app/api/internal/revalidate-wiki/route";

describe("POST /api/internal/revalidate-wiki", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.WIKI_REVALIDATE_SECRET = "test-secret";
  });

  afterEach(() => {
    delete process.env.WIKI_REVALIDATE_SECRET;
  });

  it("reports missing server configuration", async () => {
    delete process.env.WIKI_REVALIDATE_SECRET;
    const response = await POST(
      new Request("http://localhost/api/internal/revalidate-wiki", {
        method: "POST",
      }),
    );

    expect(response.status).toBe(503);
    expect(mockRevalidateTag).not.toHaveBeenCalled();
  });

  it("rejects an invalid bearer token", async () => {
    const response = await POST(
      new Request("http://localhost/api/internal/revalidate-wiki", {
        method: "POST",
        headers: { authorization: "Bearer wrong-secret" },
      }),
    );

    expect(response.status).toBe(401);
    expect(mockRevalidateTag).not.toHaveBeenCalled();
  });

  it("revalidates wiki content and search caches", async () => {
    const response = await POST(
      new Request("http://localhost/api/internal/revalidate-wiki", {
        method: "POST",
        headers: { authorization: "Bearer test-secret" },
      }),
    );

    expect(response.status).toBe(200);
    expect(mockRevalidateTag).toHaveBeenNthCalledWith(1, "wiki-pages", {
      expire: 0,
    });
    expect(mockRevalidateTag).toHaveBeenNthCalledWith(2, "wiki-search-corpus", {
      expire: 0,
    });
  });
});
