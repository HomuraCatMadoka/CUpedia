import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetProfessorDepartmentPortrait } = vi.hoisted(() => ({
  mockGetProfessorDepartmentPortrait: vi.fn(),
}));

vi.mock("@/lib/professor-portrait-source", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("@/lib/professor-portrait-source")>();
  return {
    ...original,
    getProfessorDepartmentPortrait: mockGetProfessorDepartmentPortrait,
  };
});

import { GET } from "@/app/api/professor-portraits/[publicId]/route";

const PUBLIC_ID = "59f96433-d56e-44da-becd-44a12ed2183f";

function params(publicId = PUBLIC_ID) {
  return { params: Promise.resolve({ publicId }) };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe("GET /api/professor-portraits/[publicId]", () => {
  it("rejects malformed public IDs before querying", async () => {
    const response = await GET(new Request("http://localhost"), params("bad"));

    expect(response.status).toBe(400);
    expect(mockGetProfessorDepartmentPortrait).not.toHaveBeenCalled();
  });

  it("returns 404 when no verified department portrait exists", async () => {
    mockGetProfessorDepartmentPortrait.mockResolvedValue(null);

    const response = await GET(new Request("http://localhost"), params());

    expect(response.status).toBe(404);
  });

  it("fetches an approved CUHK portrait with its verified profile as referer", async () => {
    mockGetProfessorDepartmentPortrait.mockResolvedValue({
      imageUrl:
        "https://www.peu.cuhk.edu.hk/wp-content/uploads/2026/01/photo.jpg",
      profileUrl: "https://www.peu.cuhk.edu.hk/en/staff/person/",
    });
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(new Uint8Array([1, 2, 3]), {
        headers: { "Content-Type": "image/jpeg" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await GET(new Request("http://localhost"), params());

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("image/jpeg");
    expect(response.headers.get("Cache-Control")).toContain("s-maxage=604800");
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(
      new Uint8Array([1, 2, 3]),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "https://www.peu.cuhk.edu.hk/wp-content/uploads/2026/01/photo.jpg",
      expect.objectContaining({
        headers: expect.objectContaining({
          Referer: "https://www.peu.cuhk.edu.hk/en/staff/person/",
        }),
        redirect: "error",
      }),
    );
  });

  it("refuses non-CUHK upstream URLs without fetching them", async () => {
    mockGetProfessorDepartmentPortrait.mockResolvedValue({
      imageUrl: "https://example.com/photo.jpg",
      profileUrl: "https://www.peu.cuhk.edu.hk/en/staff/person/",
    });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await GET(new Request("http://localhost"), params());

    expect(response.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not serve active SVG content from an approved host", async () => {
    mockGetProfessorDepartmentPortrait.mockResolvedValue({
      imageUrl: "https://www.peu.cuhk.edu.hk/photo.svg",
      profileUrl: "https://www.peu.cuhk.edu.hk/en/staff/person/",
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response("<svg><script>alert(1)</script></svg>", {
          headers: { "Content-Type": "image/svg+xml" },
        }),
      ),
    );

    const response = await GET(new Request("http://localhost"), params());

    expect(response.status).toBe(404);
  });
});
