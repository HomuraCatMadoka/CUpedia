import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const { mockSearchWikiPages, mockGetWikiPage } = vi.hoisted(() => ({
  mockSearchWikiPages: vi.fn(),
  mockGetWikiPage: vi.fn(),
}));

vi.mock("@/lib/wiki-actions", () => ({
  searchWikiPages: (...args: unknown[]) => mockSearchWikiPages(...args),
  getWikiPage: (...args: unknown[]) => mockGetWikiPage(...args),
}));

import { GET } from "@/app/api/wiki/[slug]/route";

function makeRequest(slug: string) {
  return new NextRequest(
    new URL(`http://localhost:3000/api/wiki/${encodeURIComponent(slug)}`),
  );
}

function makeParams(slug: string) {
  // Next.js decodes route params before handing them to the handler.
  return Promise.resolve({ slug });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/wiki/[slug]", () => {
  it("resolves a title via search and returns { title, content }", async () => {
    mockSearchWikiPages.mockResolvedValue([{ id: "page-1", title: "衣" }]);
    mockGetWikiPage.mockResolvedValue({
      id: "page-1",
      title: "衣",
      content: "<p>内容</p>",
      parentId: null,
    });

    const res = await GET(makeRequest("衣"), { params: makeParams("衣") });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ title: "衣", content: "<p>内容</p>" });

    expect(mockSearchWikiPages).toHaveBeenCalledWith("衣");
    expect(mockGetWikiPage).toHaveBeenCalledWith("page-1");
  });

  it("takes the first search result's id", async () => {
    mockSearchWikiPages.mockResolvedValue([
      { id: "page-a", title: "宿舍" },
      { id: "page-b", title: "宿舍生活" },
    ]);
    mockGetWikiPage.mockResolvedValue({ id: "page-a", title: "宿舍", content: "" });

    await GET(makeRequest("宿舍"), { params: makeParams("宿舍") });

    expect(mockGetWikiPage).toHaveBeenCalledWith("page-a");
  });

  it("returns 404 NOT_FOUND when search has no matches", async () => {
    mockSearchWikiPages.mockResolvedValue([]);

    const res = await GET(makeRequest("不存在的页面"), {
      params: makeParams("不存在的页面"),
    });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "NOT_FOUND" });
    expect(mockGetWikiPage).not.toHaveBeenCalled();
  });

  it("returns 404 NOT_FOUND when the matched page is gone", async () => {
    mockSearchWikiPages.mockResolvedValue([{ id: "page-1", title: "旧页面" }]);
    mockGetWikiPage.mockResolvedValue(null);

    const res = await GET(makeRequest("旧页面"), {
      params: makeParams("旧页面"),
    });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "NOT_FOUND" });
  });
});
