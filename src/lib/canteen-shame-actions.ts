"use server";

import { cookies } from "next/headers";
import { unstable_cache } from "next/cache";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { canteens, canteenShameVotes } from "@/db/schema";
import { getSessionVoterUser } from "@/lib/auth-guard";
import {
  CANTEEN_ANON_SESSION_COOKIE,
  createAnonSessionCookieValue,
  parseAnonSessionCookie,
} from "@/lib/canteen-anon-session";
import {
  isCanteenMockMode,
  mockAppendShameVote,
  mockCanteenExists,
  mockEnsureAnonSession,
  mockGetRateLimitKey,
  mockGetShameVoteCountsForDate,
  mockSetVoterUserId,
} from "@/lib/canteen-mock";
import { hktCalendarDate, CANTEEN_SHAME_COUNTS_TAG } from "@/lib/canteen-shame-rank";
import { checkVoteRateLimit } from "@/lib/canteen-vote-rate-limit";

type VoterIdentity = { userId: string } | { anonymousSessionId: string };

async function readAnonSessionId(): Promise<string | null> {
  const cookieStore = await cookies();
  return parseAnonSessionCookie(
    cookieStore.get(CANTEEN_ANON_SESSION_COOKIE)?.value,
  );
}

async function ensureAnonSession(): Promise<string> {
  if (isCanteenMockMode()) return mockEnsureAnonSession();

  const cookieStore = await cookies();
  const existing = parseAnonSessionCookie(
    cookieStore.get(CANTEEN_ANON_SESSION_COOKIE)?.value,
  );
  if (existing) return existing;

  const { sessionId, value, maxAge } = createAnonSessionCookieValue();
  cookieStore.set(CANTEEN_ANON_SESSION_COOKIE, value, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge,
  });
  return sessionId;
}

async function resolveVoterIdentityForWrite(): Promise<VoterIdentity> {
  const sessionUser = await getSessionVoterUser();
  if (sessionUser?.banned) throw new Error("USER_BANNED");
  if (sessionUser) return { userId: sessionUser.id };

  const anonId = (await readAnonSessionId()) ?? (await ensureAnonSession());
  return { anonymousSessionId: anonId };
}

function rateLimitKey(identity: VoterIdentity): string {
  return "userId" in identity
    ? `user:${identity.userId}`
    : `anon:${identity.anonymousSessionId}`;
}

async function syncMockVoterFromSession(): Promise<{
  id: string;
  banned: boolean;
} | null> {
  const sessionUser = await getSessionVoterUser();
  mockSetVoterUserId(sessionUser?.banned ? null : (sessionUser?.id ?? null));
  return sessionUser;
}

async function assertCanteenExists(canteenId: string): Promise<void> {
  if (isCanteenMockMode()) {
    if (!mockCanteenExists(canteenId)) throw new Error("CANTEEN_NOT_FOUND");
    return;
  }
  const row = await db
    .select({ id: canteens.id })
    .from(canteens)
    .where(eq(canteens.id, canteenId))
    .limit(1);
  if (!row[0]) throw new Error("CANTEEN_NOT_FOUND");
}

const getCachedShameCounts = unstable_cache(
  async (voteDate: string): Promise<Record<string, number>> => {
    const rows = await db
      .select({
        canteenId: canteenShameVotes.canteenId,
        dislikes: sql<number>`count(*)::int`,
      })
      .from(canteenShameVotes)
      .where(eq(canteenShameVotes.voteDate, voteDate))
      .groupBy(canteenShameVotes.canteenId);

    return Object.fromEntries(
      rows.map((row) => [row.canteenId, row.dislikes]),
    );
  },
  ["canteen-shame-counts"],
  { tags: [CANTEEN_SHAME_COUNTS_TAG], revalidate: 60 },
);

export async function getShameVoteCountsForDate(
  voteDate: string,
): Promise<Record<string, number>> {
  if (isCanteenMockMode()) return mockGetShameVoteCountsForDate(voteDate);
  return getCachedShameCounts(voteDate);
}

export async function getTodayShameVoteCounts(): Promise<Record<string, number>> {
  return getShameVoteCountsForDate(hktCalendarDate());
}

/** Append one dislike. Never cancels; repeat clicks add more votes. */
export async function appendShameVote(
  canteenId: string,
): Promise<{ canteenId: string; voteDate: string }> {
  await assertCanteenExists(canteenId);
  const voteDate = hktCalendarDate();

  if (isCanteenMockMode()) {
    const sessionUser = await syncMockVoterFromSession();
    if (sessionUser?.banned) throw new Error("USER_BANNED");
    if (!sessionUser) mockEnsureAnonSession();
    const key = mockGetRateLimitKey();
    if (!key) throw new Error("ANON_SESSION_REQUIRED");
    if (!checkVoteRateLimit(key)) throw new Error("RATE_LIMIT_EXCEEDED");
    return mockAppendShameVote(canteenId, voteDate);
  }

  const identity = await resolveVoterIdentityForWrite();
  if (!checkVoteRateLimit(rateLimitKey(identity))) {
    throw new Error("RATE_LIMIT_EXCEEDED");
  }

  await db.insert(canteenShameVotes).values({
    canteenId,
    voteDate,
    userId: "userId" in identity ? identity.userId : null,
    anonymousSessionId:
      "anonymousSessionId" in identity ? identity.anonymousSessionId : null,
  });

  // Skip revalidateTag: it refreshes the route and jumps scroll to top.
  // Optimistic client counts cover the voter; cache TTL refreshes others.
  return { canteenId, voteDate };
}
