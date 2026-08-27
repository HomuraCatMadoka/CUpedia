import { createHmac } from "node:crypto";
import { isIP } from "node:net";

import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { campusMapModerationRateLimits } from "@/db/schema";
import type { CampusMapModerationCommandResult } from "./moderation-governance-contract";

type DatabaseTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
type RateScope = "actor" | "ip";
type RateWindow = "burst" | "sustained";

type Rule = {
  scope: RateScope;
  subjectHash: string;
  policy: RateWindow;
  limit: number;
  durationMs: number;
};

type LockedRule = Rule & { windowStartedAt: Date; attemptCount: number };

export async function consumeCampusMapReportRate(
  transaction: DatabaseTransaction,
  actorId: string,
  clientIp: string,
  now: Date,
): Promise<Extract<
  CampusMapModerationCommandResult,
  { status: "rate-limited" }
> | null> {
  const rules = [
    ...rulesFor("actor", hashSubject("actor", actorId), 6, 30),
    ...rulesFor("ip", hashSubject("ip", normalizeIp(clientIp)), 20, 100),
  ];
  const locked: LockedRule[] = [];
  for (const rule of rules) {
    await transaction
      .insert(campusMapModerationRateLimits)
      .values({
        scope: rule.scope,
        subjectHash: rule.subjectHash,
        windowKind: rule.policy,
        windowStartedAt: now,
        attemptCount: 0,
        updatedAt: now,
      })
      .onConflictDoNothing();
    const [row] = await transaction
      .select({
        windowStartedAt: campusMapModerationRateLimits.windowStartedAt,
        attemptCount: campusMapModerationRateLimits.attemptCount,
      })
      .from(campusMapModerationRateLimits)
      .where(
        and(
          eq(campusMapModerationRateLimits.scope, rule.scope),
          eq(campusMapModerationRateLimits.subjectHash, rule.subjectHash),
          eq(campusMapModerationRateLimits.windowKind, rule.policy),
        ),
      )
      .for("update")
      .limit(1);
    if (!row) throw new Error("Campus Map report rate state disappeared");
    const expired =
      now.getTime() - row.windowStartedAt.getTime() >= rule.durationMs;
    locked.push({
      ...rule,
      windowStartedAt: expired ? now : row.windowStartedAt,
      attemptCount: expired ? 0 : row.attemptCount,
    });
  }
  const limited = locked.find((rule) => rule.attemptCount >= rule.limit);
  if (limited) {
    return {
      status: "rate-limited",
      code: "moderation-report-rate-limit",
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
  for (const rule of locked) {
    await transaction
      .update(campusMapModerationRateLimits)
      .set({
        windowStartedAt: rule.windowStartedAt,
        attemptCount: rule.attemptCount + 1,
        updatedAt: now,
      })
      .where(
        and(
          eq(campusMapModerationRateLimits.scope, rule.scope),
          eq(campusMapModerationRateLimits.subjectHash, rule.subjectHash),
          eq(campusMapModerationRateLimits.windowKind, rule.policy),
        ),
      );
  }
  return null;
}

function rulesFor(
  scope: RateScope,
  subjectHash: string,
  burstFallback: number,
  sustainedFallback: number,
): Rule[] {
  const prefix = `CAMPUS_MAP_REPORT_${scope.toUpperCase()}`;
  return [
    {
      scope,
      subjectHash,
      policy: "burst",
      limit: readLimit(`${prefix}_BURST_LIMIT`, burstFallback),
      durationMs: 60_000,
    },
    {
      scope,
      subjectHash,
      policy: "sustained",
      limit: readLimit(`${prefix}_SUSTAINED_LIMIT`, sustainedFallback),
      durationMs: 3_600_000,
    },
  ];
}

function hashSubject(scope: RateScope, subject: string): string {
  const secret = process.env.AUTH_SECRET;
  if (!secret)
    throw new Error("AUTH_SECRET is required for report rate policy");
  return createHmac("sha256", secret)
    .update(`campus-map-report:${scope}:${subject}`, "utf8")
    .digest("hex");
}

function normalizeIp(value: string): string {
  const ip = value.trim().toLowerCase();
  if (isIP(ip) === 0)
    throw new Error("Campus Map report context has invalid IP");
  return ip;
}

function readLimit(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  if (!/^\d+$/.test(raw)) throw new Error(`${name} must be a positive integer`);
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 1 || value > 100_000) {
    throw new Error(`${name} must be between 1 and 100000`);
  }
  return value;
}
