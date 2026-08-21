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

import { syncCanteenMenuSource } from "@/lib/canteen-menu-source-sync";
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

  it("prunes expired snapshots by cascading existing run retention", async () => {
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
});
