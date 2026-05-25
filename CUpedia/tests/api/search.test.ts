import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockSearchWikiPages } = vi.hoisted(() => ({
  mockSearchWikiPages: vi.fn(),
}));

vi.mock("@/lib/wiki-actions", () => ({
  searchWikiPages: (...args: unknown[]) => mockSearchWikiPages(...args),
}));

import { GET } from "@/app/api/search/route";
import { NextRequest } from "next/server";

function makeRequest(url: string) {
  return new NextRequest(new URL(url, "http://localhost:3000"));
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/search", () => {
  it("returns results for valid query", async () => {
    mockSearchWikiPages.mockResolvedValue([
      {
        id: "1",
        slug: "衣",
        title: "衣",
        snippet: "穿<mark>正装</mark>的场合",
      },
    ]);

    const res = await GET(makeRequest("/api/search?q=正装"));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.results).toHaveLength(1);
    expect(json.results[0].id).toBe("1");
    expect(json.results[0].snippet).toContain("<mark>正装</mark>");
  });

  it("returns empty results when q is missing", async () => {
    mockSearchWikiPages.mockResolvedValue([]);

    const res = await GET(makeRequest("/api/search"));
    const json = await res.json();

    expect(json.results).toEqual([]);
  });

  it("returns empty results when q is empty string", async () => {
    mockSearchWikiPages.mockResolvedValue([]);

    const res = await GET(makeRequest("/api/search?q="));
    const json = await res.json();

    expect(json.results).toEqual([]);
  });

  it("returns empty results when q is single character", async () => {
    mockSearchWikiPages.mockResolvedValue([]);

    const res = await GET(makeRequest("/api/search?q=衣"));
    const json = await res.json();

    expect(json.results).toEqual([]);
  });

  it("passes query to searchWikiPages", async () => {
    mockSearchWikiPages.mockResolvedValue([]);

    await GET(makeRequest("/api/search?q=正装"));

    expect(mockSearchWikiPages).toHaveBeenCalledWith("正装");
  });
});
