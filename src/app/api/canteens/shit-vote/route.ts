import {
  appendShameVote,
  type ShameVoteErrorCode,
} from "@/lib/canteen-shame-actions";
import { requireCliAuth } from "@/lib/cli-api/auth";
import { ERROR_CODES } from "@/lib/cli-api/errors";
import {
  DEFAULT_WRITE_LIMIT,
  checkRateLimit,
} from "@/lib/cli-api/rate-limit";
import { fail, ok, parseJsonBody } from "@/lib/cli-api/respond";

const VOTE_ERROR_STATUS: Record<ShameVoteErrorCode, number> = {
  ANON_SESSION_REQUIRED: 403,
  USER_BANNED: 403,
  RATE_LIMIT_EXCEEDED: 429,
  DAILY_LIMIT_EXCEEDED: 429,
  SHAME_VOTING_CLOSED: 403,
  CANTEEN_NOT_FOUND: 404,
};

/**
 * 💩堂榜 vote: append one dislike for a canteen (CLI API).
 *
 * POST /api/canteens/shit-vote  body: { canteenId: string }
 *
 * Login is required: CLI callers authenticate with a bearer token and have no
 * cookie jar, so appendShameVote's anonymous-session fallback cannot persist
 * an identity across CLI invocations. Requiring a logged-in user attributes
 * the vote to a real account (banned users are rejected early) and keeps the
 * per-user rate limit meaningful.
 */
export async function POST(request: Request) {
  const auth = await requireCliAuth(request);
  if (auth.response) return auth.response;

  // Per-user write budget: a logged-in caller's bearer identity is the rate
  // limit key (CLI callers have no stable IP under Vercel).
  const rl = checkRateLimit(`canteen:shit-vote:${auth.user.id}`, DEFAULT_WRITE_LIMIT);
  if (!rl.allowed) {
    return fail(ERROR_CODES.RATE_LIMIT_EXCEEDED, 429);
  }

  const body = await parseJsonBody(request);
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return fail(ERROR_CODES.INVALID_JSON, 400);
  }
  const canteenId = (body as Record<string, unknown>).canteenId;
  if (typeof canteenId !== "string" || !canteenId.trim()) {
    return fail(ERROR_CODES.INVALID_PARAMS, 400);
  }

  const result = await appendShameVote(canteenId.trim());
  if (result.ok) {
    return ok({ ok: true, canteenId: result.canteenId, voteDate: result.voteDate });
  }
  return fail(result.code, VOTE_ERROR_STATUS[result.code]);
}
