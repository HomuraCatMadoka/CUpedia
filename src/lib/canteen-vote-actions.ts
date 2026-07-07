"use server";

import { cookies } from "next/headers";
import { revalidateTag, unstable_cache } from "next/cache";
import { and, eq, isNotNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { canteenDishVotes, canteenMenuItems } from "@/db/schema";
import { getSessionVoterUser } from "@/lib/auth-guard";
import {
  CANTEEN_ANON_SESSION_COOKIE,
  createAnonSessionCookieValue,
  parseAnonSessionCookie,
} from "@/lib/canteen-anon-session";
import {
  isCanteenMockMode,
  mockEnsureAnonSession,
  mockGetRateLimitKey,
  mockGetMyVotesForCanteen,
  mockGetVoteCountsForCanteen,
  mockMenuItemExists,
  mockSetVoterUserId,
  mockUpsertDishVote,
} from "@/lib/canteen-mock";
import type { MenuItemVoteCounts, VoteChoice } from "@/lib/canteen-types";
import { parseVote } from "@/lib/canteen-types";
import { checkVoteRateLimit } from "@/lib/canteen-vote-rate-limit";
import { CANTEEN_VOTE_COUNTS_TAG } from "@/lib/canteen-vote-queries";

type VoterIdentity =
  | { userId: string }
  | { anonymousSessionId: string };

async function readAnonSessionId(): Promise<string | null> {
  const cookieStore = await cookies();
  return parseAnonSessionCookie(
    cookieStore.get(CANTEEN_ANON_SESSION_COOKIE)?.value,
  );
}

async function resolveVoterIdentityForWrite(): Promise<VoterIdentity> {
  const sessionUser = await getSessionVoterUser();
  if (sessionUser?.banned) throw new Error("USER_BANNED");
  if (sessionUser) return { userId: sessionUser.id };

  const anonId =
    (await readAnonSessionId()) ?? (await ensureCanteenAnonSession());
  return { anonymousSessionId: anonId };
}

function rateLimitKey(identity: VoterIdentity): string {
  return "userId" in identity
    ? `user:${identity.userId}`
    : `anon:${identity.anonymousSessionId}`;
}

async function syncMockVoterFromSession(): Promise<void> {
  const sessionUser = await getSessionVoterUser();
  if (sessionUser?.banned) {
    mockSetVoterUserId(null);
    return;
  }
  mockSetVoterUserId(sessionUser?.id ?? null);
}

async function resolveVoterIdentityForRead(): Promise<VoterIdentity | null> {
  const sessionUser = await getSessionVoterUser();
  if (sessionUser?.banned) return null;
  if (sessionUser) return { userId: sessionUser.id };

  const anonId = await readAnonSessionId();
  if (!anonId) return null;
  return { anonymousSessionId: anonId };
}

async function assertMenuItemExists(menuItemId: string): Promise<void> {
  if (isCanteenMockMode()) {
    if (!mockMenuItemExists(menuItemId)) {
      throw new Error("MENU_ITEM_NOT_FOUND");
    }
    return;
  }

  const items = await db
    .select({ id: canteenMenuItems.id })
    .from(canteenMenuItems)
    .where(eq(canteenMenuItems.id, menuItemId))
    .limit(1);
  if (!items[0]) throw new Error("MENU_ITEM_NOT_FOUND");
}

async function upsertVoteRow(
  menuItemId: string,
  identity: VoterIdentity,
  vote: VoteChoice,
): Promise<void> {
  const now = new Date();
  const base = { menuItemId, vote, updatedAt: now };

  if ("userId" in identity) {
    await db
      .insert(canteenDishVotes)
      .values({
        ...base,
        userId: identity.userId,
        anonymousSessionId: null,
      })
      .onConflictDoUpdate({
        target: [canteenDishVotes.userId, canteenDishVotes.menuItemId],
        targetWhere: isNotNull(canteenDishVotes.userId),
        set: { vote, updatedAt: now },
      });
    return;
  }

  await db
    .insert(canteenDishVotes)
    .values({
      ...base,
      userId: null,
      anonymousSessionId: identity.anonymousSessionId,
    })
    .onConflictDoUpdate({
      target: [
        canteenDishVotes.anonymousSessionId,
        canteenDishVotes.menuItemId,
      ],
      targetWhere: isNotNull(canteenDishVotes.anonymousSessionId),
      set: { vote, updatedAt: now },
    });
}

const getCachedVoteCounts = unstable_cache(
  async (canteenId: string): Promise<Record<string, MenuItemVoteCounts>> => {
    const rows = await db
      .select({
        menuItemId: canteenDishVotes.menuItemId,
        likes: sql<number>`count(*) filter (where ${canteenDishVotes.vote} = 'like')::int`,
        dislikes: sql<number>`count(*) filter (where ${canteenDishVotes.vote} = 'dislike')::int`,
      })
      .from(canteenDishVotes)
      .innerJoin(
        canteenMenuItems,
        eq(canteenDishVotes.menuItemId, canteenMenuItems.id),
      )
      .where(
        and(
          eq(canteenMenuItems.canteenId, canteenId),
          isNotNull(canteenDishVotes.vote),
        ),
      )
      .groupBy(canteenDishVotes.menuItemId);

    return Object.fromEntries(
      rows.map((row) => [
        row.menuItemId,
        { likes: row.likes, dislikes: row.dislikes },
      ]),
    );
  },
  ["canteen-vote-counts"],
  { tags: [CANTEEN_VOTE_COUNTS_TAG], revalidate: 60 },
);

export async function ensureCanteenAnonSession(): Promise<string> {
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

export async function getMenuItemVoteCounts(
  canteenId: string,
): Promise<Record<string, MenuItemVoteCounts>> {
  if (isCanteenMockMode()) return mockGetVoteCountsForCanteen(canteenId);
  return getCachedVoteCounts(canteenId);
}

export async function getMyVotesForCanteen(
  canteenId: string,
): Promise<Record<string, VoteChoice>> {
  if (isCanteenMockMode()) {
    await syncMockVoterFromSession();
    return mockGetMyVotesForCanteen(canteenId);
  }

  const identity = await resolveVoterIdentityForRead();
  if (!identity) return {};

  const where =
    "userId" in identity
      ? eq(canteenDishVotes.userId, identity.userId)
      : eq(canteenDishVotes.anonymousSessionId, identity.anonymousSessionId);

  const rows = await db
    .select({
      menuItemId: canteenDishVotes.menuItemId,
      vote: canteenDishVotes.vote,
    })
    .from(canteenDishVotes)
    .innerJoin(
      canteenMenuItems,
      eq(canteenDishVotes.menuItemId, canteenMenuItems.id),
    )
    .where(and(eq(canteenMenuItems.canteenId, canteenId), where));

  const result: Record<string, VoteChoice> = {};
  for (const row of rows) {
    if (row.vote === "like" || row.vote === "dislike") {
      result[row.menuItemId] = row.vote;
    }
  }
  return result;
}

export async function upsertDishVote(
  menuItemId: string,
  voteInput: unknown,
): Promise<{ menuItemId: string; vote: VoteChoice }> {
  const vote = parseVote(voteInput);

  await assertMenuItemExists(menuItemId);

  if (isCanteenMockMode()) {
    await syncMockVoterFromSession();
    const sessionUser = await getSessionVoterUser();
    if (sessionUser?.banned) throw new Error("USER_BANNED");
    if (!sessionUser) mockEnsureAnonSession();
    const key = mockGetRateLimitKey();
    if (!key) throw new Error("ANON_SESSION_REQUIRED");
    if (!checkVoteRateLimit(key)) throw new Error("RATE_LIMIT_EXCEEDED");
    return mockUpsertDishVote(menuItemId, vote);
  }

  const identity = await resolveVoterIdentityForWrite();
  if (!checkVoteRateLimit(rateLimitKey(identity))) {
    throw new Error("RATE_LIMIT_EXCEEDED");
  }

  await upsertVoteRow(menuItemId, identity, vote);
  revalidateTag(CANTEEN_VOTE_COUNTS_TAG, "max");

  return { menuItemId, vote };
}
