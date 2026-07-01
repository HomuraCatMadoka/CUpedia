const voteTimestamps = new Map<string, number[]>();

export function getVoteRateLimitPerMin(): number {
  const raw = process.env.CANTEEN_VOTE_RATE_LIMIT_PER_MIN;
  const n = raw ? Number(raw) : 60;
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 60;
}

/** Returns true when the request is allowed; false when rate limit exceeded. */
export function checkVoteRateLimit(key: string): boolean {
  const limit = getVoteRateLimitPerMin();
  const now = Date.now();
  const windowStart = now - 60_000;
  const recent = (voteTimestamps.get(key) ?? []).filter((t) => t > windowStart);
  if (recent.length >= limit) return false;
  recent.push(now);
  voteTimestamps.set(key, recent);
  return true;
}

/** Reset in-memory buckets between tests. */
export function resetVoteRateLimitForTests() {
  voteTimestamps.clear();
}
