import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockRequireEditor, mockUploadAsset } = vi.hoisted(() => ({
  mockRequireEditor: vi.fn(),
  mockUploadAsset: vi.fn(),
}));

vi.mock("@/lib/auth-guard", () => ({ requireEditor: mockRequireEditor }));
vi.mock("@/lib/minio", () => ({ uploadAsset: mockUploadAsset }));

import { POST } from "@/app/api/upload/route";

const images = {
  jpeg: Buffer.from("ffd8ffe000104a4649460001", "hex"),
  png: Buffer.from("89504e470d0a1a0a0000000d49484452", "hex"),
  gif: Buffer.from("47494638396101000100", "hex"),
  webp: Buffer.from("52494646040000005745425056503820", "hex"),
};

function uploadRequest(file?: File) {
  const form = new FormData();
  if (file) form.set("file", file);
  return new Request("http://localhost/api/upload", {
    method: "POST",
    body: form,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireEditor.mockResolvedValue({ id: "editor" });
  mockUploadAsset.mockResolvedValue({
    key: "wiki-assets/id.png",
    url: "/api/wiki-assets/wiki-assets/id.png",
  });
});

describe("POST /api/upload", () => {
  it("rejects unauthorized uploads before storage", async () => {
    mockRequireEditor.mockRejectedValue(new Error("forbidden"));
    const response = await POST(
      uploadRequest(new File([images.png], "image.png", { type: "image/png" })),
    );
    expect(response.status).toBe(403);
    expect(mockUploadAsset).not.toHaveBeenCalled();
  });

  it("rejects a missing file", async () => {
    expect((await POST(uploadRequest())).status).toBe(400);
    expect(mockUploadAsset).not.toHaveBeenCalled();
  });

  it("rejects files over 5 MB", async () => {
    const file = new File([new Uint8Array(5 * 1024 * 1024 + 1)], "large.png", {
      type: "image/png",
    });
    const response = await POST(uploadRequest(file));
    expect(response.status).toBe(400);
    expect(mockUploadAsset).not.toHaveBeenCalled();
  });

  it("rejects content disguised as an image", async () => {
    const response = await POST(
      uploadRequest(
        new File(["not an image"], "fake.png", { type: "image/png" }),
      ),
    );
    expect(response.status).toBe(400);
    expect(mockUploadAsset).not.toHaveBeenCalled();
  });

  it.each([
    ["jpeg", "image/jpeg", "jpg"],
    ["png", "image/png", "png"],
    ["gif", "image/gif", "gif"],
    ["webp", "image/webp", "webp"],
  ] as const)(
    "stores detected %s type and safe extension",
    async (kind, mime, ext) => {
      await POST(
        uploadRequest(
          new File([images[kind]], "attacker.exe", {
            type: "application/octet-stream",
          }),
        ),
      );
      expect(mockUploadAsset).toHaveBeenCalledWith(
        expect.any(Buffer),
        `upload.${ext}`,
        mime,
      );
    },
  );
});
