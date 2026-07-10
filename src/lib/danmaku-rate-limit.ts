/**
 * Per-user danmaku rate limit (sliding 1-hour window).
 *
 * In-memory only — best-effort on serverless until persisted in Redis/KV.
 */
const danmakuTimestamps = new Map<string, number[]>();

export function getDanmakuRateLimitPerHour(): number {
  const raw = process.env.DANMAKU_RATE_LIMIT_PER_HOUR;
  const n = raw ? Number(raw) : 5;
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 5;
}

/** Returns true when allowed; false when hourly limit exceeded. */
export function checkDanmakuRateLimit(userId: string): boolean {
  const limit = getDanmakuRateLimitPerHour();
  const now = Date.now();
  const windowStart = now - 3_600_000;
  const recent = (danmakuTimestamps.get(userId) ?? []).filter(
    (t) => t > windowStart,
  );
  if (recent.length >= limit) return false;
  recent.push(now);
  danmakuTimestamps.set(userId, recent);
  return true;
}

export function resetDanmakuRateLimitForTests() {
  danmakuTimestamps.clear();
}
