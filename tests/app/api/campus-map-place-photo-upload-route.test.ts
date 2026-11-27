import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  discard: vi.fn(),
  upload: vi.fn(),
  viewer: vi.fn(),
}));

vi.mock("@/lib/auth-guard", () => ({
  getAuthenticatedUserForApi: mocks.viewer,
}));
vi.mock("@/lib/campus-map/place-photos", async () => {
  const actual = await vi.importActual<
    typeof import("@/lib/campus-map/place-photos")
  >("@/lib/campus-map/place-photos");
  return {
    CampusMapPlacePhotoError: actual.CampusMapPlacePhotoError,
    discardCampusMapPlacePhotoAssets: mocks.discard,
    uploadCampusMapPlacePhoto: mocks.upload,
  };
});

import { DELETE, POST } from "@/app/api/campus-map/place-photos/route";
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

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("AUTH_URL", "http://localhost");
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
  mocks.discard.mockResolvedValue({ deleted: 1 });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("Campus Map Place photo upload route (#818)", () => {
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

describe("Campus Map Place photo discard route (#862)", () => {
  function discardRequest(body: unknown, origin = "http://localhost"): Request {
    return new Request("http://localhost/api/campus-map/place-photos", {
      method: "DELETE",
      headers: { "Content-Type": "application/json", Origin: origin },
      body: JSON.stringify(body),
    });
  }

  it("immediately discards the signed-in owner's unbound assets", async () => {
    const response = await DELETE(discardRequest({ assetIds: [assetId] }));

    expect(response.status).toBe(200);
    expect(mocks.discard).toHaveBeenCalledWith({
      actorId,
      assetIds: [assetId],
    });
    await expect(response.json()).resolves.toEqual({
      status: "discarded",
      deleted: 1,
    });
  });

  it("rejects cross-origin, anonymous, and malformed discard requests", async () => {
    const crossOrigin = await DELETE(
      discardRequest({ assetIds: [assetId] }, "https://evil.test"),
    );
    expect(crossOrigin.status).toBe(403);
    expect(mocks.viewer).not.toHaveBeenCalled();

    mocks.viewer.mockResolvedValueOnce(null);
    const anonymous = await DELETE(discardRequest({ assetIds: [assetId] }));
    expect(anonymous.status).toBe(401);

    const malformed = await DELETE(discardRequest({ assetIds: ["bad-id"] }));
    expect(malformed.status).toBe(400);
    expect(mocks.discard).not.toHaveBeenCalled();
  });
});

describe.each([
  { method: "POST", handle: POST, write: mocks.upload },
  { method: "DELETE", handle: DELETE, write: mocks.discard },
])(
  "Campus Map Place photo $method behind a reverse proxy (#943)",
  ({ method, handle, write }) => {
    const publicOrigin = "https://cupedia.org";
    const internalOrigin = "https://0.0.0.0:3000";

    beforeEach(() => {
      vi.stubEnv("AUTH_URL", `${publicOrigin}/`);
    });

    function proxiedRequest(origin?: string, forwardedHost = "cupedia.org") {
      const headers = new Headers({
        Host: forwardedHost,
        "X-Forwarded-Host": forwardedHost,
        "X-Forwarded-Proto": "https",
      });
      if (origin !== undefined) headers.set("Origin", origin);

      if (method === "DELETE") headers.set("Content-Type", "application/json");
      const body =
        method === "POST"
          ? validForm()
          : JSON.stringify({ assetIds: [assetId] });
      return new Request(`${internalOrigin}/api/campus-map/place-photos`, {
        method,
        headers,
        body,
      });
    }

    it("allows a signed-in request from the configured public origin", async () => {
      const response = await handle(proxiedRequest(publicOrigin));

      expect(response.status).toBe(200);
      expect(write).toHaveBeenCalledOnce();
    });

    it("requires authentication for requests from the configured origin", async () => {
      mocks.viewer.mockResolvedValue(null);

      const response = await handle(proxiedRequest(publicOrigin));

      expect(response.status).toBe(401);
      await expect(response.json()).resolves.toEqual({
        status: "authentication-required",
      });
      expect(write).not.toHaveBeenCalled();
    });

    it.each([
      { label: "missing", origin: undefined },
      { label: "null", origin: "null" },
      { label: "the internal server", origin: internalOrigin },
      {
        label: "a foreign host matching the forwarded headers",
        origin: "https://unrelated.test",
        forwardedHost: "unrelated.test",
      },
    ])(
      "rejects an origin of $label before authentication",
      async ({ origin, forwardedHost }) => {
        const response = await handle(proxiedRequest(origin, forwardedHost));

        expect(response.status).toBe(403);
        await expect(response.json()).resolves.toEqual({
          error: "invalid-origin",
        });
        expect(mocks.viewer).not.toHaveBeenCalled();
        expect(write).not.toHaveBeenCalled();
      },
    );

    it.each([
      { label: "unset", authUrl: undefined, origin: internalOrigin },
      { label: "malformed", authUrl: "invalid-url", origin: internalOrigin },
      {
        label: "a non-HTTP URL",
        authUrl: "ftp://cupedia.org",
        origin: "ftp://cupedia.org",
      },
    ])(
      "rejects the request when AUTH_URL is $label",
      async ({ authUrl, origin }) => {
        vi.stubEnv("AUTH_URL", authUrl);

        const response = await handle(proxiedRequest(origin));

        expect(response.status).toBe(403);
        await expect(response.json()).resolves.toEqual({
          error: "invalid-origin",
        });
        expect(mocks.viewer).not.toHaveBeenCalled();
        expect(write).not.toHaveBeenCalled();
      },
    );
  },
);
