/**
 * In-memory fixed-window rate limiter for the CLI API.
 *
 * Deliberately minimal: a single Map of per-key counters, no TTL sweeper, no
 * pluggable backend, no persistence. Stale buckets are only pruned lazily
 * when a key is next touched after its window expired — bounded by the number
 * of distinct keys, which for a campus CLI is small.
 */

/** Default read (GET) budget: requests per minute. */
export const DEFAULT_READ_LIMIT = 100;
/** Default write (POST/DELETE) budget: requests per minute. */
export const DEFAULT_WRITE_LIMIT = 30;
/** Default fixed window length in milliseconds (1 minute). */
export const DEFAULT_WINDOW_MS = 60_000;

type Bucket = {
  count: number;
  windowStart: number;
};

const buckets = new Map<string, Bucket>();

export type RateLimitResult = {
  allowed: boolean;
  /** Remaining requests in the current window (0 when blocked). */
  remaining: number;
  /** Milliseconds until the window resets (0 when allowed). */
  retryAfterMs: number;
};

/** Record one request for `key`; false once `max` is exceeded in a window. */
export function checkRateLimit(
  key: string,
  max: number,
  windowMs: number = DEFAULT_WINDOW_MS,
): RateLimitResult {
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || now - bucket.windowStart >= windowMs) {
    buckets.set(key, { count: 1, windowStart: now });
    return { allowed: true, remaining: max - 1, retryAfterMs: 0 };
  }

  if (bucket.count >= max) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterMs: bucket.windowStart + windowMs - now,
    };
  }

  bucket.count += 1;
  return { allowed: true, remaining: max - bucket.count, retryAfterMs: 0 };
}
