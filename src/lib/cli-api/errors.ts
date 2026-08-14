/**
 * Shared error vocabulary for the CLI API surface.
 *
 * Codes are stable string identifiers the cupedia CLI can switch on; the
 * numeric `status` is the HTTP status to pair with them. Routes use cliError
 * like so:
 *
 *   const { error, status } = cliError(ERROR_CODES.NOT_FOUND, 404);
 *   return NextResponse.json({ error }, { status });
 */

export const ERROR_CODES = {
  /** No/invalid Authorization header or session. */
  UNAUTHORIZED: "UNAUTHORIZED",
  /** Authenticated but the account is banned. */
  USER_BANNED: "USER_BANNED",
  /** Authenticated but lacks the required role. */
  FORBIDDEN: "FORBIDDEN",
  /** Logged-in but the account needs setup before this action. */
  ACCOUNT_SETUP_REQUIRED: "ACCOUNT_SETUP_REQUIRED",
  /** Request body was not valid JSON (or not a JSON object). */
  INVALID_JSON: "INVALID_JSON",
  /** Body/query fields failed schema validation. */
  INVALID_PARAMS: "INVALID_PARAMS",
  /** Vote value outside the allowed set. */
  INVALID_VOTE: "INVALID_VOTE",
  /** Danmaku/message content failed content rules. */
  INVALID_DANMAKU: "INVALID_DANMAKU",
  /** Referenced resource does not exist. */
  NOT_FOUND: "NOT_FOUND",
  /** Per-key rate limit hit; pair with 429 + Retry-After. */
  RATE_LIMIT_EXCEEDED: "RATE_LIMIT_EXCEEDED",
  /** Unexpected server failure. */
  INTERNAL_ERROR: "INTERNAL_ERROR",
} as const;

export type CliErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

export type CliErrorPayload = {
  error: CliErrorCode;
  status: number;
  message?: string;
};

/** Build a `{ error, status, message? }` payload for an error response. */
export function cliError(
  code: CliErrorCode,
  status: number,
  message?: string,
): CliErrorPayload {
  return message === undefined
    ? { error: code, status }
    : { error: code, status, message };
}
