import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  canteenMenuItems,
  canteenMenuSources,
  canteenMenuSyncRuns,
  canteenMenuSyncSnapshotItems,
  canteenMenuSyncSnapshots,
  canteens,
} from "@/db/schema";
import type { MenuSyncInput, MenuSyncItemInput } from "@/lib/canteen-types";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const { fetchMenuFromProvider } = vi.hoisted(() => ({
  fetchMenuFromProvider: vi.fn(),
}));

vi.mock("@/lib/canteen-menu-source-adapters", () => ({
  fetchMenuFromProvider,
}));

import {
  syncCanteenMenuSource,
  syncNextDueMenuSource,
} from "@/lib/canteen-menu-source-sync";
import { compareMenuSyncSnapshots } from "@/lib/canteen-menu-sync-snapshots";

const hasDb = Boolean(process.env.DATABASE_URL);

function item(
  externalProductId: string,
  overrides: Partial<MenuSyncItemInput> = {},
): MenuSyncItemInput {
  return {
    externalProductId,
    name: `菜品 ${externalProductId}`,
    priceOptions: [
      {
        label: null,
        amountMinor: 2_000,
        currency: "HKD",
        sortOrder: 0,
      },
    ],
    mealPeriods: ["lunch"],
    sortOrder: 0,
    svgKey: "午餐",
    ...overrides,
  };
}

function snapshot(items: MenuSyncItemInput[]): MenuSyncInput {
  return {
    snapshotCompleteness: "partial",
    takeOverLegacyItems: false,
    items,
  };
}

async function insertSnapshotPair(
  sourceId: string,
  overrides: [
    Partial<typeof canteenMenuSyncSnapshots.$inferInsert>,
    Partial<typeof canteenMenuSyncSnapshots.$inferInsert>,
  ],
) {
  const olderRunId = randomUUID();
  const newerRunId = randomUUID();
  await db.insert(canteenMenuSyncRuns).values([
    { id: olderRunId, menuSourceId: sourceId, status: "unchanged" },
    { id: newerRunId, menuSourceId: sourceId, status: "unchanged" },
  ]);
  const base = {
    menuSourceId: sourceId,
    snapshotCompleteness: "partial" as const,
    itemCount: 0,
    mealPeriod: "lunch" as const,
    hktWeekday: 1,
    observedMinuteOfDay: 720,
    scopeEvidence: {},
  };
  await db.insert(canteenMenuSyncSnapshots).values([
    {
      ...base,
      syncWindowKey: "2026-08-17/lunch",
      observedAt: new Date("2026-08-17T04:00:00Z"),
      ...overrides[0],
      runId: olderRunId,
      menuSourceId: sourceId,
      snapshotHash: "a".repeat(64),
    },
    {
      ...base,
      syncWindowKey: "2026-08-24/lunch",
      observedAt: new Date("2026-08-24T04:00:00Z"),
      ...overrides[1],
      runId: newerRunId,
      menuSourceId: sourceId,
      snapshotHash: "b".repeat(64),
    },
  ]);
  return { olderRunId, newerRunId };
}

describe.skipIf(!hasDb)("canteen menu sync observation snapshots #724", () => {
  let canteenId: string;
  let sourceId: string;

  beforeEach(async () => {
    fetchMenuFromProvider.mockReset();
    canteenId = randomUUID();
    sourceId = randomUUID();
    await db.insert(canteens).values({ id: canteenId, name: "Snapshot 食堂" });
    await db.insert(canteenMenuSources).values({
      id: sourceId,
      canteenId,
      provider: "pinme",
      externalStoreId: randomUUID(),
      enabled: true,
    });
  });

  afterEach(async () => {
    await db.delete(canteens).where(eq(canteens.id, canteenId));
  });

  it("captures applied and unchanged observations and compares item deltas", async () => {
    const first = snapshot([item("a"), item("b", { sortOrder: 1 })]);
    const second = snapshot([
      item("a", {
        name: "更新菜品 a",
        priceOptions: [
          {
            label: "大",
            amountMinor: 2_500,
            currency: "HKD",
            sortOrder: 0,
          },
        ],
        svgKey: "特餐",
      }),
      item("c", { sortOrder: 1 }),
    ]);
    fetchMenuFromProvider
      .mockResolvedValueOnce(first)
      .mockResolvedValueOnce(second)
      .mockResolvedValueOnce(second);

    const firstResult = await syncCanteenMenuSource(sourceId);
    const secondResult = await syncCanteenMenuSource(sourceId);
    const unchangedResult = await syncCanteenMenuSource(sourceId);
    expect(firstResult.status).toBe("applied");
    expect(secondResult.status).toBe("applied");
    expect(unchangedResult.status).toBe("unchanged");

    const snapshots = await db
      .select()
      .from(canteenMenuSyncSnapshots)
      .where(eq(canteenMenuSyncSnapshots.menuSourceId, sourceId))
      .orderBy(asc(canteenMenuSyncSnapshots.observedAt));
    expect(snapshots).toHaveLength(3);
    expect(snapshots.map((entry) => entry.snapshotCompleteness)).toEqual([
      "partial",
      "partial",
      "partial",
    ]);
    expect(snapshots.map((entry) => entry.itemCount)).toEqual([2, 2, 2]);
    expect(snapshots[1].snapshotHash).toBe(snapshots[2].snapshotHash);
    expect(snapshots[0]).toMatchObject({
      syncWindowKey: expect.stringMatching(
        /^\d{4}-\d{2}-\d{2}\/(breakfast|lunch|dinner)$/,
      ),
      mealPeriod: expect.stringMatching(/^(breakfast|lunch|dinner)$/),
      hktWeekday: expect.any(Number),
      observedMinuteOfDay: expect.any(Number),
      scopeEvidence: {},
    });

    const comparison = await compareMenuSyncSnapshots(
      sourceId,
      firstResult.runId!,
      secondResult.runId!,
    );
    expect(comparison.added.map((entry) => entry.externalProductId)).toEqual([
      "c",
    ]);
    expect(comparison.missing.map((entry) => entry.externalProductId)).toEqual([
      "b",
    ]);
    expect(comparison.changed).toEqual([
      expect.objectContaining({
        externalProductId: "a",
        fields: ["name", "priceOptions", "svgKey"],
      }),
    ]);
  });

  it("does not record failed or review-blocked attempts", async () => {
    fetchMenuFromProvider
      .mockRejectedValueOnce(new Error("UPSTREAM_HTTP_503"))
      .mockResolvedValueOnce(snapshot([item("old", { name: "同名菜品" })]))
      .mockResolvedValueOnce(snapshot([item("new", { name: "同名菜品" })]));

    await expect(syncCanteenMenuSource(sourceId)).resolves.toMatchObject({
      status: "provider-failure",
    });
    await expect(syncCanteenMenuSource(sourceId)).resolves.toMatchObject({
      status: "applied",
    });
    await expect(syncCanteenMenuSource(sourceId)).resolves.toMatchObject({
      status: "blocked",
      code: "MENU_SYNC_IDENTITY_CHURN",
    });

    const snapshots = await db
      .select({ runId: canteenMenuSyncSnapshots.runId })
      .from(canteenMenuSyncSnapshots)
      .where(eq(canteenMenuSyncSnapshots.menuSourceId, sourceId));
    expect(snapshots).toHaveLength(1);
  });

  it("records an adapter-accepted empty observation", async () => {
    const externalStoreId = randomUUID();
    await db
      .update(canteenMenuSources)
      .set({ provider: "aigens", externalStoreId })
      .where(eq(canteenMenuSources.id, sourceId));
    fetchMenuFromProvider.mockResolvedValueOnce({
      ...snapshot([]),
      scopeEvidence: {
        provider: "aigens",
        externalStoreId,
        storeName: "Snapshot 食堂",
        menuName: "堂食菜单",
        providerPeriodCodes: ["LUNCH"],
        categoryPeriodCodes: ["LUNCH"],
        categoryCount: 0,
        groupCount: 0,
      },
    });

    const result = await syncCanteenMenuSource(sourceId);

    expect(result).toMatchObject({
      status: "unchanged",
      code: "MENU_SYNC_UNCHANGED",
      itemCount: 0,
    });
    await expect(
      db
        .select({ itemCount: canteenMenuSyncSnapshots.itemCount })
        .from(canteenMenuSyncSnapshots)
        .where(eq(canteenMenuSyncSnapshots.runId, result.runId!)),
    ).resolves.toEqual([{ itemCount: 0 }]);
  });

  it("rejects comparison across non-equivalent meal windows", async () => {
    const { olderRunId, newerRunId } = await insertSnapshotPair(sourceId, [
      {
        syncWindowKey: "2026-08-17/breakfast",
        mealPeriod: "breakfast",
        observedMinuteOfDay: 480,
        observedAt: new Date("2026-08-17T00:00:00Z"),
      },
      {
        syncWindowKey: "2026-08-17/dinner",
        mealPeriod: "dinner",
        observedMinuteOfDay: 1080,
        observedAt: new Date("2026-08-17T10:00:00Z"),
      },
    ]);

    await expect(
      compareMenuSyncSnapshots(sourceId, olderRunId, newerRunId),
    ).rejects.toThrow("MENU_SYNC_SNAPSHOT_WINDOW_MISMATCH");
  });

  it("compares the same configured window despite completion-minute drift", async () => {
    const scopeEvidence = {
      provider: "pinme",
      serviceWindows: [{ startTime: "11:00", endTime: "14:00" }],
    };
    const { olderRunId, newerRunId } = await insertSnapshotPair(sourceId, [
      {
        observedMinuteOfDay: 720,
        scopeEvidence,
      },
      {
        observedMinuteOfDay: 723,
        scopeEvidence,
        observedAt: new Date("2026-08-24T04:03:00Z"),
      },
    ]);

    await expect(
      compareMenuSyncSnapshots(sourceId, olderRunId, newerRunId),
    ).resolves.toMatchObject({
      sourceId,
      olderRunId,
      newerRunId,
      added: [],
      missing: [],
      changed: [],
    });
  });

  it("rejects comparison across different provider service contexts", async () => {
    const context = {
      provider: "aigens",
      externalStoreId: "store-1",
      storeName: "Snapshot 食堂",
      menuName: "堂食菜单",
      categoryPeriodCodes: ["LUNCH"],
      categoryCount: 2,
      groupCount: 3,
    };
    const { olderRunId, newerRunId } = await insertSnapshotPair(sourceId, [
      {
        scopeEvidence: { ...context, providerPeriodCodes: ["LUNCH"] },
      },
      {
        scopeEvidence: { ...context, providerPeriodCodes: ["TEA"] },
      },
    ]);

    await expect(
      compareMenuSyncSnapshots(sourceId, olderRunId, newerRunId),
    ).rejects.toThrow("MENU_SYNC_SNAPSHOT_WINDOW_MISMATCH");
  });

  it("rolls back menu writes when snapshot persistence fails", async () => {
    fetchMenuFromProvider.mockResolvedValueOnce(
      snapshot([item("a", { svgKey: "x".repeat(201) })]),
    );

    const result = await syncCanteenMenuSource(sourceId);
    expect(result).toMatchObject({
      status: "internal-failure",
    });
    const [items, snapshots, snapshotItems] = await Promise.all([
      db
        .select({ id: canteenMenuItems.id })
        .from(canteenMenuItems)
        .where(eq(canteenMenuItems.menuSourceId, sourceId)),
      db
        .select({ runId: canteenMenuSyncSnapshots.runId })
        .from(canteenMenuSyncSnapshots)
        .where(eq(canteenMenuSyncSnapshots.menuSourceId, sourceId)),
      db
        .select({ runId: canteenMenuSyncSnapshotItems.runId })
        .from(canteenMenuSyncSnapshotItems)
        .where(eq(canteenMenuSyncSnapshotItems.runId, result.runId!)),
    ]);
    expect(items).toEqual([]);
    expect(snapshots).toEqual([]);
    expect(snapshotItems).toEqual([]);
  });

  it("prunes snapshots older than 30 days and their items", async () => {
    const runId = randomUUID();
    const old = new Date(Date.now() - 31 * 24 * 60 * 60 * 1_000);
    await db.insert(canteenMenuSyncRuns).values({
      id: runId,
      menuSourceId: sourceId,
      status: "unchanged",
      startedAt: old,
      completedAt: old,
    });
    await db.insert(canteenMenuSyncSnapshots).values({
      runId,
      menuSourceId: sourceId,
      snapshotHash: "a".repeat(64),
      snapshotCompleteness: "partial",
      itemCount: 1,
      syncWindowKey: "2026-07-01/lunch",
      mealPeriod: "lunch",
      hktWeekday: 3,
      observedMinuteOfDay: 720,
      observedAt: old,
    });
    await db.insert(canteenMenuSyncSnapshotItems).values({
      runId,
      externalProductId: "expired",
      name: "过期证据",
      priceOptions: [],
      mealPeriods: ["lunch"],
      sortOrder: 0,
      svgKey: "午餐",
    });
    fetchMenuFromProvider.mockResolvedValueOnce(snapshot([item("current")]));

    await syncCanteenMenuSource(sourceId);

    const [expiredSnapshots, expiredItems] = await Promise.all([
      db
        .select({ runId: canteenMenuSyncSnapshots.runId })
        .from(canteenMenuSyncSnapshots)
        .where(eq(canteenMenuSyncSnapshots.runId, runId)),
      db
        .select({ runId: canteenMenuSyncSnapshotItems.runId })
        .from(canteenMenuSyncSnapshotItems)
        .where(eq(canteenMenuSyncSnapshotItems.runId, runId)),
    ]);
    expect(expiredSnapshots).toEqual([]);
    expect(expiredItems).toEqual([]);
  });

  it("retains snapshots observed within the last 30 days", async () => {
    const runId = randomUUID();
    const oldStart = new Date(Date.now() - 31 * 24 * 60 * 60 * 1_000);
    const recentObservation = new Date(Date.now() - 29 * 24 * 60 * 60 * 1_000);
    await db.insert(canteenMenuSyncRuns).values({
      id: runId,
      menuSourceId: sourceId,
      status: "unchanged",
      startedAt: oldStart,
      completedAt: recentObservation,
    });
    await db.insert(canteenMenuSyncSnapshots).values({
      runId,
      menuSourceId: sourceId,
      snapshotHash: "a".repeat(64),
      snapshotCompleteness: "partial",
      itemCount: 0,
      syncWindowKey: "2026-07-23/lunch",
      mealPeriod: "lunch",
      hktWeekday: 4,
      observedMinuteOfDay: 720,
      observedAt: recentObservation,
    });
    fetchMenuFromProvider.mockResolvedValueOnce(snapshot([item("current")]));

    await syncCanteenMenuSource(sourceId);

    await expect(
      db
        .select({ runId: canteenMenuSyncSnapshots.runId })
        .from(canteenMenuSyncSnapshots)
        .where(eq(canteenMenuSyncSnapshots.runId, runId)),
    ).resolves.toEqual([{ runId }]);
  });

  it("prunes expired snapshots for disabled sources in a bounded scheduled cleanup", async () => {
    const old = new Date(Date.now() - 31 * 24 * 60 * 60 * 1_000);
    const expiredRunIds = Array.from({ length: 101 }, () => randomUUID());
    await db
      .update(canteenMenuSources)
      .set({ enabled: false })
      .where(eq(canteenMenuSources.id, sourceId));
    await db.insert(canteenMenuSyncRuns).values(
      expiredRunIds.map((id) => ({
        id,
        menuSourceId: sourceId,
        status: "unchanged" as const,
        startedAt: old,
        completedAt: old,
      })),
    );
    await db.insert(canteenMenuSyncSnapshots).values(
      expiredRunIds.map((runId) => ({
        runId,
        menuSourceId: sourceId,
        snapshotHash: "a".repeat(64),
        snapshotCompleteness: "partial" as const,
        itemCount: 0,
        syncWindowKey: "2026-07-01/lunch",
        mealPeriod: "lunch" as const,
        hktWeekday: 3,
        observedMinuteOfDay: 720,
        observedAt: old,
      })),
    );

    const enabledCanteenId = randomUUID();
    const enabledSourceId = randomUUID();
    await db.insert(canteens).values({
      id: enabledCanteenId,
      name: "Scheduled Snapshot 食堂",
    });
    await db.insert(canteenMenuSources).values({
      id: enabledSourceId,
      canteenId: enabledCanteenId,
      provider: "pinme",
      externalStoreId: randomUUID(),
      enabled: true,
    });
    fetchMenuFromProvider.mockResolvedValueOnce(snapshot([item("current")]));

    try {
      await syncNextDueMenuSource();
      await expect(
        db
          .select({ runId: canteenMenuSyncSnapshots.runId })
          .from(canteenMenuSyncSnapshots)
          .where(eq(canteenMenuSyncSnapshots.menuSourceId, sourceId)),
      ).resolves.toHaveLength(1);
    } finally {
      await db.delete(canteens).where(eq(canteens.id, enabledCanteenId));
    }
  });
});
