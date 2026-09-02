import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getPhoto: vi.fn(),
  viewer: vi.fn(),
}));

vi.mock("@/lib/auth-guard", () => ({
  getAuthenticatedUserForApi: mocks.viewer,
}));
vi.mock("@/lib/campus-map/place-photos", () => ({
  getCampusMapPlacePhotoObject: mocks.getPhoto,
}));

import { GET } from "@/app/api/campus-map/place-photos/[photoId]/[variant]/route";

const photoId = "10000000-0000-4000-8000-000000000818";

function storedObject() {
  return {
    key: "private-key",
    read: vi.fn().mockResolvedValue({
      Body: {
        transformToWebStream: () =>
          new ReadableStream({
            start(controller) {
              controller.enqueue(new Uint8Array([1, 2, 3]));
              controller.close();
            },
          }),
      },
    }),
  };
}

describe("Campus Map Place photo read route (#818)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.viewer.mockResolvedValue(null);
  });

  it("serves public WebP without reading a session and forbids caching/sniffing", async () => {
    mocks.getPhoto.mockResolvedValue(storedObject());
    const response = await GET(new Request("http://localhost/photo"), {
      params: Promise.resolve({ photoId, variant: "thumbnail" }),
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/webp");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(mocks.viewer).not.toHaveBeenCalled();
  });

  it("retries a non-public lookup only for the signed-in owner", async () => {
    mocks.getPhoto
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(storedObject());
    mocks.viewer.mockResolvedValue({ id: "owner" });
    const response = await GET(new Request("http://localhost/photo"), {
      params: Promise.resolve({ photoId, variant: "full" }),
    });
    expect(response.status).toBe(200);
    expect(mocks.getPhoto).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ actorId: "owner" }),
    );
  });

  it("returns the same 404 for invalid variants and unavailable objects", async () => {
    const invalid = await GET(new Request("http://localhost/photo"), {
      params: Promise.resolve({ photoId, variant: "original" }),
    });
    expect(invalid.status).toBe(404);
    mocks.getPhoto.mockResolvedValue(null);
    const missing = await GET(new Request("http://localhost/photo"), {
      params: Promise.resolve({ photoId, variant: "full" }),
    });
    expect(missing.status).toBe(404);
  });
});
