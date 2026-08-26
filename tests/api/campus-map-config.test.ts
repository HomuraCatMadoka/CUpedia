import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetOptionalUser } = vi.hoisted(() => ({
  mockGetOptionalUser: vi.fn(),
}));

vi.mock("@/lib/auth-guard", () => ({
  getOptionalUser: mockGetOptionalUser,
}));

import { GET } from "@/app/api/campus-map/config/route";

const originalKey = process.env.AMAP_WEB_KEY;
const originalSecurityCode = process.env.AMAP_SECURITY_JS_CODE;

afterEach(() => {
  if (originalKey === undefined) delete process.env.AMAP_WEB_KEY;
  else process.env.AMAP_WEB_KEY = originalKey;
  if (originalSecurityCode === undefined)
    delete process.env.AMAP_SECURITY_JS_CODE;
  else process.env.AMAP_SECURITY_JS_CODE = originalSecurityCode;
});

beforeEach(() => {
  mockGetOptionalUser.mockReset();
  mockGetOptionalUser.mockResolvedValue({ id: "user-1" });
});

describe("campus map AMap config", () => {
  it("does not disclose browser credentials to an anonymous request", async () => {
    mockGetOptionalUser.mockResolvedValueOnce(null);
    process.env.AMAP_WEB_KEY = "web-key";
    process.env.AMAP_SECURITY_JS_CODE = "security-code";

    const response = await GET();

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ configured: false });
  });

  it("does not disguise an authentication backend failure as a logout", async () => {
    mockGetOptionalUser.mockRejectedValueOnce(new Error("AUTH_UNAVAILABLE"));

    await expect(GET()).rejects.toThrow("AUTH_UNAVAILABLE");
  });

  it("fails closed when either browser credential is missing", async () => {
    delete process.env.AMAP_WEB_KEY;
    delete process.env.AMAP_SECURITY_JS_CODE;

    const response = await GET();
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ configured: false });
  });

  it("returns configured browser credentials without caching", async () => {
    process.env.AMAP_WEB_KEY = "web-key";
    process.env.AMAP_SECURITY_JS_CODE = "security-code";

    const response = await GET();
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({
      configured: true,
      key: "web-key",
      securityCode: "security-code",
    });
  });
});
