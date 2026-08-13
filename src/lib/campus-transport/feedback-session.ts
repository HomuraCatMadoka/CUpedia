import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";

export const CAMPUS_BUS_FEEDBACK_SESSION_COOKIE = "campus_bus_feedback_session";
const CAMPUS_BUS_FEEDBACK_SESSION_TTL_SECONDS = 60 * 60;

function signingSecret() {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET_MISSING");
  return secret;
}

function signature(sessionId: string, expiresAt: number) {
  return createHmac("sha256", signingSecret())
    .update(`campus-bus-feedback\0${sessionId}.${expiresAt}`)
    .digest("base64url");
}

export function parseCampusBusFeedbackSession(
  value: string | undefined,
  now = Date.now(),
) {
  if (!value) return null;
  const [sessionId, expiresRaw, suppliedSignature, ...extra] = value.split(".");
  if (!sessionId || !expiresRaw || !suppliedSignature || extra.length > 0) {
    return null;
  }
  const expiresAt = Number(expiresRaw);
  if (!Number.isFinite(expiresAt) || expiresAt <= now) return null;

  try {
    const expectedSignature = Buffer.from(
      signature(sessionId, expiresAt),
      "utf8",
    );
    const actualSignature = Buffer.from(suppliedSignature, "utf8");
    if (
      expectedSignature.length !== actualSignature.length ||
      !timingSafeEqual(expectedSignature, actualSignature)
    ) {
      return null;
    }
    return sessionId;
  } catch {
    return null;
  }
}

export function createCampusBusFeedbackSession(now = Date.now()) {
  const sessionId = randomUUID();
  const maxAge = CAMPUS_BUS_FEEDBACK_SESSION_TTL_SECONDS;
  const expiresAt = now + maxAge * 1000;
  return {
    maxAge,
    sessionId,
    value: `${sessionId}.${expiresAt}.${signature(sessionId, expiresAt)}`,
  };
}

export function getCampusBusFeedbackSession(request: Request) {
  const cookieHeader = request.headers.get("cookie") ?? "";
  const encodedName = `${CAMPUS_BUS_FEEDBACK_SESSION_COOKIE}=`;
  const cookieValue = cookieHeader
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(encodedName))
    ?.slice(encodedName.length);
  const existing = parseCampusBusFeedbackSession(cookieValue);
  if (existing) return { cookie: null, sessionId: existing };

  const created = createCampusBusFeedbackSession();
  return {
    cookie: { maxAge: created.maxAge, value: created.value },
    sessionId: created.sessionId,
  };
}
