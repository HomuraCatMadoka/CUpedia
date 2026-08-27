import { createHmac } from "node:crypto";
import { isIP } from "node:net";
import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { campusMapNoteRateLimits } from "@/db/schema";
import type { CampusMapNoteCommandResult } from "@/lib/campus-map/map-notes-contract";

type DatabaseTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
type NoteRateScope = "actor" | "ip";
type NoteRateWindow = "burst" | "sustained";

interface NoteRateRule {
  scope: NoteRateScope;
  subjectHash: string;
  policy: NoteRateWindow;
  limit: number;
  durationMs: number;
}

type LockedNoteRateRule = NoteRateRule & {
  windowStartedAt: Date;
  attemptCount: number;
};

export async function consumeMapNoteRate(
  transaction: DatabaseTransaction,
  actorId: string,
  clientIp: string,
  now: Date,
): Promise<Extract<
  CampusMapNoteCommandResult,
  { status: "rate-limited" }
> | null> {
  const actorHash = subjectHash("actor", actorId);
  const ipHash = subjectHash("ip", normalizeClientIp(clientIp));
  const actorRules = rulesFor(
    "actor",
    actorHash,
    "CAMPUS_MAP_NOTE_ACTOR",
    12,
    120,
  );
  const ipRules = rulesFor("ip", ipHash, "CAMPUS_MAP_NOTE_IP", 40, 400);

  const actorWindows = await lockRules(transaction, actorRules, now);
  const actorLimit = findLimit(actorWindows, now);
  if (actorLimit) return actorLimit;
  const ipWindows = await lockRules(transaction, ipRules, now);
  const ipLimit = findLimit(ipWindows, now);
  if (ipLimit) return ipLimit;

  for (const entry of [...actorWindows, ...ipWindows]) {
    await transaction
      .update(campusMapNoteRateLimits)
      .set({
        windowStartedAt: entry.windowStartedAt,
        attemptCount: entry.attemptCount + 1,
        updatedAt: now,
      })
      .where(
        and(
          eq(campusMapNoteRateLimits.scope, entry.scope),
          eq(campusMapNoteRateLimits.subjectHash, entry.subjectHash),
          eq(campusMapNoteRateLimits.windowKind, entry.policy),
        ),
      );
  }
  return null;
}

function rulesFor(
  scope: NoteRateScope,
  hash: string,
  envPrefix: string,
  burstFallback: number,
  sustainedFallback: number,
): NoteRateRule[] {
  return [
    {
      scope,
      subjectHash: hash,
      policy: "burst",
      limit: limitFromEnv(`${envPrefix}_BURST_LIMIT`, burstFallback),
      durationMs: 60_000,
    },
    {
      scope,
      subjectHash: hash,
      policy: "sustained",
      limit: limitFromEnv(`${envPrefix}_SUSTAINED_LIMIT`, sustainedFallback),
      durationMs: 3_600_000,
    },
  ];
}

async function lockRules(
  transaction: DatabaseTransaction,
  rules: NoteRateRule[],
  now: Date,
): Promise<LockedNoteRateRule[]> {
  const locked: LockedNoteRateRule[] = [];
  for (const rule of rules) {
    await transaction
      .insert(campusMapNoteRateLimits)
      .values({
        scope: rule.scope,
        subjectHash: rule.subjectHash,
        windowKind: rule.policy,
        windowStartedAt: now,
        attemptCount: 0,
        updatedAt: now,
      })
      .onConflictDoNothing();
    const [stored] = await transaction
      .select({
        windowStartedAt: campusMapNoteRateLimits.windowStartedAt,
        attemptCount: campusMapNoteRateLimits.attemptCount,
      })
      .from(campusMapNoteRateLimits)
      .where(
        and(
          eq(campusMapNoteRateLimits.scope, rule.scope),
          eq(campusMapNoteRateLimits.subjectHash, rule.subjectHash),
          eq(campusMapNoteRateLimits.windowKind, rule.policy),
        ),
      )
      .for("update")
      .limit(1);
    if (!stored) throw new Error("Campus Map Note rate state disappeared");
    const expired =
      now.getTime() - stored.windowStartedAt.getTime() >= rule.durationMs;
    locked.push({
      ...rule,
      windowStartedAt: expired ? now : stored.windowStartedAt,
      attemptCount: expired ? 0 : stored.attemptCount,
    });
  }
  return locked;
}

function findLimit(
  windows: LockedNoteRateRule[],
  now: Date,
): Extract<CampusMapNoteCommandResult, { status: "rate-limited" }> | null {
  const limited = windows.find((entry) => entry.attemptCount >= entry.limit);
  if (!limited) return null;
  return {
    status: "rate-limited",
    code: "map-note-rate-limit",
    scope: limited.scope,
    policy: limited.policy,
    retryAfter: Math.max(
      1,
      Math.ceil(
        (limited.windowStartedAt.getTime() +
          limited.durationMs -
          now.getTime()) /
          1_000,
      ),
    ),
  };
}

function normalizeClientIp(clientIp: string): string {
  const normalized = clientIp.trim().toLowerCase();
  const version = isIP(normalized);
  if (version === 0)
    throw new Error("Map Note context has an invalid client IP");
  if (version === 4) return normalized;
  return new URL(`http://[${normalized}]/`).hostname.slice(1, -1);
}

function subjectHash(scope: NoteRateScope, subject: string): string {
  const secret = process.env.AUTH_SECRET;
  if (!secret)
    throw new Error("AUTH_SECRET is required for Map Note rate policy");
  return createHmac("sha256", secret)
    .update(`campus-map-note:${scope}:${subject}`, "utf8")
    .digest("hex");
}

function limitFromEnv(name: string, fallback: number): number {
  const value = process.env[name];
  if (value === undefined) return fallback;
  if (!/^\d+$/.test(value))
    throw new Error(`${name} must be a positive integer`);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0 || parsed > 100_000) {
    throw new Error(`${name} must be between 1 and 100000`);
  }
  return parsed;
}
