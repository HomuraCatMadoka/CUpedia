import { createHmac } from "node:crypto";
import { isIP } from "node:net";
import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { campusMapPublishRateLimits } from "@/db/schema";
import type { CampusMapPublishResult } from "@/lib/campus-map/publish-contract";

type DatabaseTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
type CampusMapRateScope = "actor" | "ip";
type CampusMapRateWindow = "burst" | "sustained";

interface CampusMapRateRule {
  scope: CampusMapRateScope;
  subjectHash: string;
  policy: CampusMapRateWindow;
  limit: number;
  durationMs: number;
}

export async function consumePublishRate(
  transaction: DatabaseTransaction,
  actorId: string,
  clientIp: string,
  now: Date,
): Promise<Extract<CampusMapPublishResult, { status: "rate-limited" }> | null> {
  const normalizedIp = normalizeClientIp(clientIp);
  const actorHash = privateSubjectHash("actor", actorId);
  const ipHash = privateSubjectHash("ip", normalizedIp);
  const rules: CampusMapRateRule[] = [
    {
      scope: "actor",
      subjectHash: actorHash,
      policy: "burst",
      limit: rateLimitFromEnv("CAMPUS_MAP_PUBLISH_ACTOR_BURST_LIMIT", 10),
      durationMs: 60_000,
    },
    {
      scope: "actor",
      subjectHash: actorHash,
      policy: "sustained",
      limit: rateLimitFromEnv("CAMPUS_MAP_PUBLISH_ACTOR_SUSTAINED_LIMIT", 100),
      durationMs: 3_600_000,
    },
    {
      scope: "ip",
      subjectHash: ipHash,
      policy: "burst",
      limit: rateLimitFromEnv("CAMPUS_MAP_PUBLISH_IP_BURST_LIMIT", 30),
      durationMs: 60_000,
    },
    {
      scope: "ip",
      subjectHash: ipHash,
      policy: "sustained",
      limit: rateLimitFromEnv("CAMPUS_MAP_PUBLISH_IP_SUSTAINED_LIMIT", 300),
      durationMs: 3_600_000,
    },
  ];
  const locked: Array<
    CampusMapRateRule & { windowStartedAt: Date; attemptCount: number }
  > = [];
  for (const rule of rules) {
    await transaction
      .insert(campusMapPublishRateLimits)
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
        windowStartedAt: campusMapPublishRateLimits.windowStartedAt,
        attemptCount: campusMapPublishRateLimits.attemptCount,
      })
      .from(campusMapPublishRateLimits)
      .where(
        and(
          eq(campusMapPublishRateLimits.scope, rule.scope),
          eq(campusMapPublishRateLimits.subjectHash, rule.subjectHash),
          eq(campusMapPublishRateLimits.windowKind, rule.policy),
        ),
      )
      .for("update")
      .limit(1);
    if (!stored) throw new Error("Campus Map rate state disappeared");
    const expired =
      now.getTime() - stored.windowStartedAt.getTime() >= rule.durationMs;
    locked.push({
      ...rule,
      windowStartedAt: expired ? now : stored.windowStartedAt,
      attemptCount: expired ? 0 : stored.attemptCount,
    });
  }

  const limited = locked.find((entry) => entry.attemptCount >= entry.limit);
  if (limited) {
    return {
      status: "rate-limited",
      code: "publish-rate-limit",
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

  for (const entry of locked) {
    await transaction
      .update(campusMapPublishRateLimits)
      .set({
        windowStartedAt: entry.windowStartedAt,
        attemptCount: entry.attemptCount + 1,
        updatedAt: now,
      })
      .where(
        and(
          eq(campusMapPublishRateLimits.scope, entry.scope),
          eq(campusMapPublishRateLimits.subjectHash, entry.subjectHash),
          eq(campusMapPublishRateLimits.windowKind, entry.policy),
        ),
      );
  }
  return null;
}

function normalizeClientIp(clientIp: string): string {
  const normalized = clientIp.trim().toLowerCase();
  const version = isIP(normalized);
  if (version === 0) {
    throw new Error("Campus Map publish context has an invalid client IP");
  }
  if (version === 4) return normalized;
  const hostname = new URL(`http://[${normalized}]/`).hostname;
  const canonical = hostname.slice(1, -1);
  const mappedIpv4 = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(canonical);
  if (!mappedIpv4) return canonical;
  const high = Number.parseInt(mappedIpv4[1], 16);
  const low = Number.parseInt(mappedIpv4[2], 16);
  return `${high >>> 8}.${high & 0xff}.${low >>> 8}.${low & 0xff}`;
}

function privateSubjectHash(
  scope: CampusMapRateScope,
  subject: string,
): string {
  const secret = process.env.AUTH_SECRET;
  if (!secret)
    throw new Error("AUTH_SECRET is required for publish rate policy");
  return createHmac("sha256", secret)
    .update(`${scope}:${subject}`, "utf8")
    .digest("hex");
}

function rateLimitFromEnv(name: string, fallback: number): number {
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
