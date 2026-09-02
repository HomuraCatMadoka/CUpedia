import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ upload: vi.fn(), viewer: vi.fn() }));

vi.mock("@/lib/auth-guard", () => ({
  getAuthenticatedUserForApi: mocks.viewer,
}));
vi.mock("@/lib/campus-map/place-photos", async () => {
  const actual = await vi.importActual<
    typeof import("@/lib/campus-map/place-photos")
  >("@/lib/campus-map/place-photos");
  return {
    CampusMapPlacePhotoError: actual.CampusMapPlacePhotoError,
    uploadCampusMapPlacePhoto: mocks.upload,
  };
});

import { POST } from "@/app/api/campus-map/place-photos/route";
import { CampusMapPlacePhotoError } from "@/lib/campus-map/place-photos";

const actorId = "10000000-0000-4000-8000-000000000818";
const assetId = "30000000-0000-4000-8000-000000000818";

function requestWith(form: FormData, origin = "http://localhost") {
  return new Request("http://localhost/api/campus-map/place-photos", {
    method: "POST",
    headers: { Origin: origin },
    body: form,
  });
}

function validForm() {
  const form = new FormData();
  form.set("assetId", assetId);
  form.set(
    "photo",
    new File([Buffer.from([0xff, 0xd8, 0xff, 0xd9])], "visit.jpg", {
      type: "image/jpeg",
    }),
  );
  return form;
}

describe("Campus Map Place photo upload route (#818)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.viewer.mockResolvedValue({ id: actorId });
    mocks.upload.mockResolvedValue({
      id: assetId,
      url: `/api/campus-map/place-photos/${assetId}/full`,
      thumbnailUrl: `/api/campus-map/place-photos/${assetId}/thumbnail`,
      width: 1200,
      height: 800,
      thumbnailWidth: 480,
      thumbnailHeight: 320,
    });
  });

  it("lets any signed-in non-banned user upload one bounded asset", async () => {
    const response = await POST(requestWith(validForm()));
    expect(response.status).toBe(200);
    expect(mocks.upload).toHaveBeenCalledWith(
      expect.objectContaining({ actorId, assetId, source: expect.any(Buffer) }),
    );
    await expect(response.json()).resolves.toMatchObject({
      status: "uploaded",
      asset: { id: assetId },
    });
  });

  it("rejects cross-origin and anonymous uploads before processing", async () => {
    const crossOrigin = await POST(
      requestWith(validForm(), "https://evil.test"),
    );
    expect(crossOrigin.status).toBe(403);
    expect(mocks.viewer).not.toHaveBeenCalled();

    mocks.viewer.mockResolvedValueOnce(null);
    const anonymous = await POST(requestWith(validForm()));
    expect(anonymous.status).toBe(401);
    expect(mocks.upload).not.toHaveBeenCalled();
  });

  it("returns a safe validation code for rejected image bytes", async () => {
    mocks.upload.mockRejectedValueOnce(
      new CampusMapPlacePhotoError("photo-type-unsupported"),
    );
    const response = await POST(requestWith(validForm()));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      status: "validation-failed",
      code: "photo-type-unsupported",
    });
  });

  it("rejects an oversized multipart payload before authentication or parsing", async () => {
    const response = await POST(
      new Request("http://localhost/api/campus-map/place-photos", {
        method: "POST",
        headers: {
          Origin: "http://localhost",
          "Content-Type": "multipart/form-data; boundary=test",
          "Content-Length": String(6 * 1024 * 1024),
        },
        body: new Uint8Array(),
      }),
    );
    expect(response.status).toBe(413);
    expect(mocks.viewer).not.toHaveBeenCalled();
    expect(mocks.upload).not.toHaveBeenCalled();
  });
});
