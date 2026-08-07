import { eq } from "drizzle-orm";
import type { NextResponse } from "next/server";

import { db } from "@/db";
import { users } from "@/db/schema";
import { auth } from "@/lib/auth";
import { ERROR_CODES } from "./errors";
import { fail } from "./respond";

/**
 * CLI API authentication. The better-auth `bearer()` plugin (enabled in
 * src/lib/auth.ts) turns an `Authorization: Bearer <sessionToken>` header
 * into a session, so `auth.api.getSession` works for non-browser callers.
 */

export type CliSessionUser = {
  id: string;
  email: string;
  nickname: string;
  role: "user" | "admin";
  banned: boolean;
};

/** Result of a require* guard: either the user, or a ready-made error response. */
export type CliAuthResult =
  | { user: CliSessionUser; response: null }
  | { user: null; response: NextResponse };

/**
 * Resolve the CLI caller from the request's Authorization header. Returns
 * null when anonymous. The user row is re-read from the DB (same pattern as
 * getAdminUserForApi) so role/banned changes take effect without session-cache
 * lag; `banned` is returned for the caller to enforce per-route.
 */
export async function getCliSessionUser(
  request: Request,
): Promise<CliSessionUser | null> {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user?.id) return null;

  const dbUser = await db.query.users.findFirst({
    where: eq(users.id, session.user.id),
    columns: {
      id: true,
      email: true,
      nickname: true,
      role: true,
      banned: true,
    },
  });
  if (!dbUser) return null;

  return {
    id: dbUser.id,
    email: dbUser.email ?? session.user.email,
    nickname: dbUser.nickname,
    role: dbUser.role as CliSessionUser["role"],
    banned: dbUser.banned,
  };
}

/** Require a logged-in, non-banned caller → 401 / 403 JSON otherwise. */
export async function requireCliAuth(request: Request): Promise<CliAuthResult> {
  const user = await getCliSessionUser(request);
  if (!user) {
    return { user: null, response: fail(ERROR_CODES.UNAUTHORIZED, 401) };
  }
  if (user.banned) {
    return { user: null, response: fail(ERROR_CODES.USER_BANNED, 403) };
  }
  return { user, response: null };
}

/** Require an admin caller → 401 anonymous / 403 non-admin JSON otherwise. */
export async function requireCliAdmin(request: Request): Promise<CliAuthResult> {
  const user = await getCliSessionUser(request);
  if (!user) {
    return { user: null, response: fail(ERROR_CODES.UNAUTHORIZED, 401) };
  }
  if (user.banned) {
    return { user: null, response: fail(ERROR_CODES.USER_BANNED, 403) };
  }
  if (user.role !== "admin") {
    return { user: null, response: fail(ERROR_CODES.FORBIDDEN, 403) };
  }
  return { user, response: null };
}
