import { createHmac, timingSafeEqual } from "crypto";

export const CANTEEN_ANON_SESSION_COOKIE = "canteen_anon_session";

export function getAnonSessionTtlSeconds(): number {
  const raw = process.env.CANTEEN_ANON_SESSION_TTL_SECONDS;
  const n = raw ? Number(raw) : 3600;
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 3600;
}

function getSigningSecret(): string {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET_MISSING");
  return secret;
}

function signPayload(sessionId: string, expiresAt: number): string {
  return createHmac("sha256", getSigningSecret())
    .update(`${sessionId}.${expiresAt}`)
    .digest("base64url");
}

export function encodeAnonSessionCookie(
  sessionId: string,
  expiresAt: number,
): string {
  const sig = signPayload(sessionId, expiresAt);
  return `${sessionId}.${expiresAt}.${sig}`;
}

/** Returns anonymous session id when cookie is valid and unexpired. */
export function parseAnonSessionCookie(
  value: string | undefined,
): string | null {
  if (!value) return null;
  const parts = value.split(".");
  if (parts.length !== 3) return null;
  const [sessionId, expiresRaw, sig] = parts;
  if (!sessionId || !expiresRaw || !sig) return null;
  const expiresAt = Number(expiresRaw);
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) return null;
  const expected = signPayload(sessionId, expiresAt);
  try {
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  } catch {
    return null;
  }
  return sessionId;
}

export function createAnonSessionCookieValue(): {
  sessionId: string;
  value: string;
  maxAge: number;
} {
  const sessionId = crypto.randomUUID();
  const maxAge = getAnonSessionTtlSeconds();
  const expiresAt = Date.now() + maxAge * 1000;
  return {
    sessionId,
    value: encodeAnonSessionCookie(sessionId, expiresAt),
    maxAge,
  };
}
