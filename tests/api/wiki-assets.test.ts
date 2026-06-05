import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockGetObject } = vi.hoisted(() => ({
  mockGetObject: vi.fn(),
}));

vi.mock("@/lib/minio", () => ({
  getObject: (...args: unknown[]) => mockGetObject(...args),
}));

import { GET } from "@/app/api/wiki-assets/[...key]/route";

function makeParams(segments: string[]) {
  return { params: Promise.resolve({ key: segments }) };
}

function streamOf(text: string) {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(text));
      controller.close();
    },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/wiki-assets/[...key]", () => {
  it("serves assets anonymously with immutable CDN cache headers", async () => {
    mockGetObject.mockResolvedValue({
      Body: { transformToWebStream: () => streamOf("png-bytes") },
      ContentType: "image/png",
    });

    const res = await GET(
      new Request("http://localhost:3000/api/wiki-assets/wiki-assets/a.png"),
      makeParams(["wiki-assets", "a.png"]),
    );

    expect(res.status).toBe(200);
    expect(await res.text()).toBe("png-bytes");
    expect(res.headers.get("Content-Type")).toBe("image/png");
    expect(res.headers.get("Cache-Control")).toBe(
      "public, max-age=31536000, immutable, s-maxage=31536000",
    );
    expect(mockGetObject).toHaveBeenCalledWith("wiki-assets/a.png");
  });

  it("rejects keys outside the wiki-assets prefix without touching storage", async () => {
    const res = await GET(
      new Request("http://localhost:3000/api/wiki-assets/other/a.png"),
      makeParams(["other", "a.png"]),
    );

    expect(res.status).toBe(400);
    expect(mockGetObject).not.toHaveBeenCalled();
  });

  it("rejects path traversal without touching storage", async () => {
    const res = await GET(
      new Request("http://localhost:3000/api/wiki-assets/wiki-assets/../x"),
      makeParams(["wiki-assets", "..", "x"]),
    );

    expect(res.status).toBe(400);
    expect(mockGetObject).not.toHaveBeenCalled();
  });

  it("returns 404 when the object does not exist", async () => {
    mockGetObject.mockRejectedValue(new Error("NoSuchKey"));

    const res = await GET(
      new Request("http://localhost:3000/api/wiki-assets/wiki-assets/gone.png"),
      makeParams(["wiki-assets", "gone.png"]),
    );

    expect(res.status).toBe(404);
  });

  it("returns 404 when the object has no body", async () => {
    mockGetObject.mockResolvedValue({ Body: undefined });

    const res = await GET(
      new Request("http://localhost:3000/api/wiki-assets/wiki-assets/x.png"),
      makeParams(["wiki-assets", "x.png"]),
    );

    expect(res.status).toBe(404);
  });
});
