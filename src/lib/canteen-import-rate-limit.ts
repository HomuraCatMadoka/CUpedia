/**
 * Per-admin OCR rate limit (sliding 1-hour window).
 *
 * This map lives in process memory, so on Vercel serverless it only throttles
 * within a warm instance — not globally across all lambdas. Treat it as
 * best-effort abuse protection until we persist counters in Redis / Vercel KV
 * (keyed by admin user id).
 */
const ocrTimestamps = new Map<string, number[]>();

export function getOcrRateLimitPerHour(): number {
  const raw = process.env.CANTEEN_OCR_RATE_LIMIT_PER_HOUR;
  const n = raw ? Number(raw) : 20;
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 20;
}

/** Returns true when the request is allowed; false when rate limit exceeded. */
export function checkOcrRateLimit(adminUserId: string): boolean {
  const limit = getOcrRateLimitPerHour();
  const now = Date.now();
  const windowStart = now - 3_600_000;
  const recent = (ocrTimestamps.get(adminUserId) ?? []).filter(
    (t) => t > windowStart,
  );
  if (recent.length >= limit) return false;
  recent.push(now);
  ocrTimestamps.set(adminUserId, recent);
  return true;
}

export function resetOcrRateLimitForTests() {
  ocrTimestamps.clear();
}
