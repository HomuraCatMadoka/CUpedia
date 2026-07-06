import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  CANTEEN_ANON_SESSION_COOKIE,
  createAnonSessionCookieValue,
  encodeAnonSessionCookie,
  getAnonSessionTtlSeconds,
  parseAnonSessionCookie,
} from "@/lib/canteen-anon-session";

describe("canteen-anon-session", () => {
  const prevSecret = process.env.AUTH_SECRET;

  beforeEach(() => {
    process.env.AUTH_SECRET = "test-secret";
  });

  afterEach(() => {
    process.env.AUTH_SECRET = prevSecret;
  });

  it("round-trips a signed cookie before expiry", () => {
    const sessionId = "11111111-1111-4111-8111-111111111111";
    const expiresAt = Date.now() + 60_000;
    const value = encodeAnonSessionCookie(sessionId, expiresAt);
    expect(parseAnonSessionCookie(value)).toBe(sessionId);
  });

  it("rejects tampered signature", () => {
    const sessionId = "11111111-1111-4111-8111-111111111111";
    const expiresAt = Date.now() + 60_000;
    const value = encodeAnonSessionCookie(sessionId, expiresAt);
    expect(parseAnonSessionCookie(`${value}x`)).toBeNull();
  });

  it("rejects expired cookie", () => {
    const sessionId = "11111111-1111-4111-8111-111111111111";
    const expiresAt = Date.now() - 1;
    const value = encodeAnonSessionCookie(sessionId, expiresAt);
    expect(parseAnonSessionCookie(value)).toBeNull();
  });

  it("createAnonSessionCookieValue uses default TTL", () => {
    delete process.env.CANTEEN_ANON_SESSION_TTL_SECONDS;
    expect(getAnonSessionTtlSeconds()).toBe(3600);
    const created = createAnonSessionCookieValue();
    expect(created.maxAge).toBe(3600);
    expect(parseAnonSessionCookie(created.value)).toBe(created.sessionId);
  });

  it("exports stable cookie name", () => {
    expect(CANTEEN_ANON_SESSION_COOKIE).toBe("canteen_anon_session");
  });
});
