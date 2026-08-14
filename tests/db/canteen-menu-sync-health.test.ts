import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { canteenMenuSources, canteenMenuSyncRuns, canteens } from "@/db/schema";

vi.mock("@/lib/auth-guard", () => ({
  requireAdmin: vi.fn().mockResolvedValue({ id: "admin" }),
}));

import { adminListCanteenMenuSourceHealth } from "@/lib/canteen-menu-sync-health";

const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)("canteen menu sync health database", () => {
  const canteenId = randomUUID();
  const sourceId = randomUUID();
  const recentRunIds = Array.from({ length: 5 }, () => randomUUID());
  const overdueRunId = randomUUID();
  const now = new Date("2026-08-14T04:00:00.000Z");

  beforeAll(async () => {
    await db.insert(canteens).values({
      id: canteenId,
      name: `同步健康测试 ${canteenId}`,
    });
    await db.insert(canteenMenuSources).values({
      id: sourceId,
      canteenId,
      provider: "pinme",
      externalStoreId: `health-${sourceId}`,
      config: { token: "CANARY_SYNC_SECRET" },
      lastAttemptId: recentRunIds[0],
      lastAttemptAt: now,
      lastSuccessAt: now,
      lastError: "https://private.example/CANARY_SYNC_SECRET",
    });
    await db.insert(canteenMenuSyncRuns).values([
      ...recentRunIds.map((id, index) => ({
        id,
        menuSourceId: sourceId,
        status: "unchanged" as const,
        itemCount: 10,
        createdCount: 0,
        updatedCount: 0,
        deactivatedCount: 0,
        startedAt: new Date(now.getTime() - index * 60_000),
        completedAt: new Date(now.getTime() - index * 60_000 + 2_000),
      })),
      {
        id: overdueRunId,
        menuSourceId: sourceId,
        status: "running" as const,
        startedAt: new Date(now.getTime() - 24 * 60 * 60 * 1_000),
      },
    ]);
  });

  afterAll(async () => {
    await db.delete(canteens).where(eq(canteens.id, canteenId));
  });

  it("keeps recent history bounded while detecting an older overdue run", async () => {
    const sources = await adminListCanteenMenuSourceHealth(now);
    const source = sources.find((candidate) => candidate.id === sourceId);

    expect(source).toBeDefined();
    expect(source?.recentRuns.map((run) => run.id)).toEqual(recentRunIds);
    expect(source?.recentRuns).toHaveLength(5);
    expect(source?.recentRuns.some((run) => run.id === overdueRunId)).toBe(
      false,
    );
    expect(source?.hasOverdueRun).toBe(true);
    expect(JSON.stringify(source)).not.toContain("CANARY_SYNC_SECRET");
  });
});
