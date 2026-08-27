import { createHash, randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { and, count, desc, eq, inArray, sql } from "drizzle-orm";
import { Client } from "pg";
import { db } from "@/db";
import {
  canteenDishComments,
  canteenDishVotes,
  canteenMenuItemPrices,
  canteenMenuIdentityTransitions,
  canteenMenuItems,
  canteenMenuProviderOfferings,
  canteenMenuSources,
  canteenMenuSyncRuns,
  canteens,
  siteSettings,
  users,
} from "@/db/schema";
import pinmeCurrent from "../lib/fixtures/canteen-providers/pinme-current.json";
import { buildPinmeMenuSyncPayload } from "@/lib/canteen-pinme-menu";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const { fetchMenuFromProvider } = vi.hoisted(() => ({
  fetchMenuFromProvider: vi.fn(),
}));

vi.mock("@/lib/canteen-menu-source-adapters", () => ({
  fetchMenuFromProvider,
}));

import { syncCanteenMenuSource } from "@/lib/canteen-menu-source-sync";
import { previewMenuSync } from "@/lib/canteen-menu-sync-store";
import { getCanteenMenuItems } from "@/lib/canteen-actions";

const hasDb = Boolean(process.env.DATABASE_URL);

function stubPinmeFetch(menuPayload: unknown): void {
  try {
    fetchMenuFromProvider.mockResolvedValueOnce(
      buildPinmeMenuSyncPayload(menuPayload),
    );
  } catch (error) {
    fetchMenuFromProvider.mockRejectedValueOnce(error);
  }
}

describe.skipIf(!hasDb)("scheduled canteen menu source sync", () => {
  let canteenId: string;
  let sourceId: string;
  let userId: string;

  beforeEach(async () => {
    fetchMenuFromProvider.mockReset();
    canteenId = randomUUID();
    sourceId = randomUUID();
    userId = randomUUID();
    await db.insert(users).values({
      id: userId,
      email: `${userId}@test.com`,
      nickname: "同步测试",
      role: "user",
    });
    await db.insert(canteens).values({ id: canteenId, name: "同步测试食堂" });
    await db.insert(canteenMenuSources).values({
      id: sourceId,
      canteenId,
      provider: "pinme",
      externalStoreId: "9900636",
      enabled: true,
    });
  });

  afterEach(async () => {
    await db.delete(canteens).where(eq(canteens.id, canteenId));
    await db.delete(users).where(eq(users.id, userId));
    await db
      .delete(siteSettings)
      .where(eq(siteSettings.key, "canteen_menu_identity_evolution"));
  });

  it("persists a sanitized provider fixture and records a successful run", async () => {
    stubPinmeFetch(pinmeCurrent);

    await expect(syncCanteenMenuSource(sourceId)).resolves.toMatchObject({
      sourceId,
      canteenId,
      status: "applied",
      itemCount: 1,
    });

    const items = await db
      .select({
        externalProductId: canteenMenuItems.externalProductId,
        externalSource: canteenMenuItems.externalSource,
        externalKey: canteenMenuItems.externalKey,
        name: canteenMenuItems.name,
        isAvailable: canteenMenuItems.isAvailable,
        updatedAt: canteenMenuItems.updatedAt,
      })
      .from(canteenMenuItems)
      .where(eq(canteenMenuItems.menuSourceId, sourceId));
    expect(items).toEqual([
      {
        externalProductId: "425657",
        externalSource: null,
        externalKey: null,
        name: "喇沙魚旦烏冬",
        isAvailable: true,
        updatedAt: expect.any(Date),
      },
    ]);

    const [[source], [run]] = await Promise.all([
      db
        .select({
          lastSuccessAt: canteenMenuSources.lastSuccessAt,
          observedState: canteenMenuSources.observedState,
          lastErrorCode: canteenMenuSources.lastErrorCode,
          syncClaimToken: canteenMenuSources.syncClaimToken,
          syncClaimExpiresAt: canteenMenuSources.syncClaimExpiresAt,
          updatedAt: canteenMenuSources.updatedAt,
        })
        .from(canteenMenuSources)
        .where(eq(canteenMenuSources.id, sourceId)),
      db
        .select({
          status: canteenMenuSyncRuns.status,
          itemCount: canteenMenuSyncRuns.itemCount,
          createdCount: canteenMenuSyncRuns.createdCount,
          completedAt: canteenMenuSyncRuns.completedAt,
        })
        .from(canteenMenuSyncRuns)
        .where(eq(canteenMenuSyncRuns.menuSourceId, sourceId)),
    ]);
    expect(source).toMatchObject({
      lastSuccessAt: expect.any(Date),
      observedState: "available",
      lastErrorCode: null,
      syncClaimToken: null,
      syncClaimExpiresAt: null,
    });
    expect(run).toMatchObject({
      status: "applied",
      itemCount: 1,
      createdCount: 1,
      completedAt: expect.any(Date),
    });
    expect(source.lastSuccessAt?.getTime()).toBe(source.updatedAt.getTime());
    expect(run.completedAt?.getTime()).toBe(source.updatedAt.getTime());
    expect(items[0].updatedAt.getTime()).toBe(source.updatedAt.getTime());
  });

  it("returns already-running without fetching while a claim is active", async () => {
    let releaseFirstMenu!: (
      snapshot: ReturnType<typeof buildPinmeMenuSyncPayload>,
    ) => void;
    let markFirstMenuRequested!: () => void;
    const firstMenuRequested = new Promise<void>((resolve) => {
      markFirstMenuRequested = resolve;
    });
    const firstMenuResponse = new Promise<
      ReturnType<typeof buildPinmeMenuSyncPayload>
    >((resolve) => {
      releaseFirstMenu = resolve;
    });
    fetchMenuFromProvider.mockImplementationOnce(async () => {
      markFirstMenuRequested();
      return firstMenuResponse;
    });

    const firstSync = syncCanteenMenuSource(sourceId);
    await firstMenuRequested;
    await expect(syncCanteenMenuSource(sourceId)).resolves.toMatchObject({
      status: "already-running",
      code: "MENU_SYNC_ALREADY_RUNNING",
    });
    expect(fetchMenuFromProvider).toHaveBeenCalledOnce();
    const [[claimedSource], runningRuns] = await Promise.all([
      db
        .select({
          lastAttemptId: canteenMenuSources.lastAttemptId,
          syncClaimToken: canteenMenuSources.syncClaimToken,
          syncClaimExpiresAt: canteenMenuSources.syncClaimExpiresAt,
        })
        .from(canteenMenuSources)
        .where(eq(canteenMenuSources.id, sourceId)),
      db
        .select({ id: canteenMenuSyncRuns.id })
        .from(canteenMenuSyncRuns)
        .where(eq(canteenMenuSyncRuns.menuSourceId, sourceId)),
    ]);
    expect(runningRuns).toHaveLength(1);
    expect(claimedSource).toMatchObject({
      lastAttemptId: runningRuns[0].id,
      syncClaimToken: runningRuns[0].id,
      syncClaimExpiresAt: expect.any(Date),
    });
    releaseFirstMenu(buildPinmeMenuSyncPayload(pinmeCurrent));
    await expect(firstSync).resolves.toMatchObject({
      status: "applied",
    });
  });

  it("returns a bounded source-unavailable result for a disabled source", async () => {
    await db
      .update(canteenMenuSources)
      .set({ enabled: false })
      .where(eq(canteenMenuSources.id, sourceId));

    await expect(syncCanteenMenuSource(sourceId)).resolves.toEqual({
      sourceId,
      status: "source-unavailable",
      code: "MENU_SOURCE_DISABLED",
    });
    expect(fetchMenuFromProvider).not.toHaveBeenCalled();
  });

  it("reclaims an expired claim and fences the stale worker from menu and health", async () => {
    let releaseStale!: (
      snapshot: ReturnType<typeof buildPinmeMenuSyncPayload>,
    ) => void;
    let markStaleFetchStarted!: () => void;
    const staleFetchStarted = new Promise<void>((resolve) => {
      markStaleFetchStarted = resolve;
    });
    const staleSnapshot = structuredClone(pinmeCurrent);
    staleSnapshot.data.group[0].products[0].local_name = "过期 worker 菜单";
    const freshSnapshot = structuredClone(pinmeCurrent);
    freshSnapshot.data.group[0].products[0].local_name = "回收后新菜单";
    fetchMenuFromProvider
      .mockImplementationOnce(async () => {
        markStaleFetchStarted();
        return new Promise((resolve) => {
          releaseStale = resolve;
        });
      })
      .mockResolvedValueOnce(buildPinmeMenuSyncPayload(freshSnapshot));

    const staleWorker = syncCanteenMenuSource(sourceId);
    await staleFetchStarted;
    await db
      .update(canteenMenuSources)
      .set({ syncClaimExpiresAt: sql`now() - interval '1 second'` })
      .where(eq(canteenMenuSources.id, sourceId));

    const freshResult = await syncCanteenMenuSource(sourceId);
    expect(freshResult).toMatchObject({
      status: "applied",
      code: "MENU_SYNC_APPLIED",
      runId: expect.any(String),
    });
    releaseStale(buildPinmeMenuSyncPayload(staleSnapshot));
    await expect(staleWorker).resolves.toMatchObject({
      status: "superseded",
      code: "MENU_SYNC_SUPERSEDED",
    });

    const [item] = await db
      .select({ name: canteenMenuItems.name })
      .from(canteenMenuItems)
      .where(eq(canteenMenuItems.menuSourceId, sourceId));
    expect(item.name).toBe("回收后新菜单");
    const [source] = await db
      .select({
        lastAttemptId: canteenMenuSources.lastAttemptId,
        observedState: canteenMenuSources.observedState,
        lastErrorCode: canteenMenuSources.lastErrorCode,
        syncClaimToken: canteenMenuSources.syncClaimToken,
        syncClaimExpiresAt: canteenMenuSources.syncClaimExpiresAt,
      })
      .from(canteenMenuSources)
      .where(eq(canteenMenuSources.id, sourceId));
    expect(source).toEqual({
      lastAttemptId: freshResult.runId,
      observedState: "available",
      lastErrorCode: null,
      syncClaimToken: null,
      syncClaimExpiresAt: null,
    });
    const runs = await db
      .select({
        id: canteenMenuSyncRuns.id,
        status: canteenMenuSyncRuns.status,
        errorCode: canteenMenuSyncRuns.errorCode,
      })
      .from(canteenMenuSyncRuns)
      .where(eq(canteenMenuSyncRuns.menuSourceId, sourceId));
    expect(runs).toEqual(
      expect.arrayContaining([
        { id: freshResult.runId, status: "applied", errorCode: null },
        expect.objectContaining({
          status: "failed",
          errorCode: "MENU_SYNC_SUPERSEDED",
        }),
      ]),
    );
  });

  it("leaves an expired unreclaimed lease untouched when the stale worker returns", async () => {
    let releaseFetch!: (
      snapshot: ReturnType<typeof buildPinmeMenuSyncPayload>,
    ) => void;
    let markFetchStarted!: () => void;
    const fetchStarted = new Promise<void>((resolve) => {
      markFetchStarted = resolve;
    });
    fetchMenuFromProvider.mockImplementationOnce(async () => {
      markFetchStarted();
      return new Promise((resolve) => {
        releaseFetch = resolve;
      });
    });

    const staleSync = syncCanteenMenuSource(sourceId);
    await fetchStarted;
    const [claimedSource] = await db
      .select({ syncClaimToken: canteenMenuSources.syncClaimToken })
      .from(canteenMenuSources)
      .where(eq(canteenMenuSources.id, sourceId));
    expect(claimedSource.syncClaimToken).toEqual(expect.any(String));
    await db
      .update(canteenMenuSources)
      .set({ syncClaimExpiresAt: sql`now() - interval '1 second'` })
      .where(eq(canteenMenuSources.id, sourceId));
    releaseFetch(buildPinmeMenuSyncPayload(pinmeCurrent));

    await expect(staleSync).resolves.toMatchObject({
      runId: claimedSource.syncClaimToken,
      status: "superseded",
      code: "MENU_SYNC_SUPERSEDED",
    });
    const [[source], [run], items] = await Promise.all([
      db
        .select({
          observedState: canteenMenuSources.observedState,
          lastErrorCode: canteenMenuSources.lastErrorCode,
          syncClaimToken: canteenMenuSources.syncClaimToken,
          claimExpired: sql<boolean>`${canteenMenuSources.syncClaimExpiresAt} <= now()`,
        })
        .from(canteenMenuSources)
        .where(eq(canteenMenuSources.id, sourceId)),
      db
        .select({
          status: canteenMenuSyncRuns.status,
          errorCode: canteenMenuSyncRuns.errorCode,
          completedAt: canteenMenuSyncRuns.completedAt,
        })
        .from(canteenMenuSyncRuns)
        .where(eq(canteenMenuSyncRuns.id, claimedSource.syncClaimToken!)),
      db
        .select({ id: canteenMenuItems.id })
        .from(canteenMenuItems)
        .where(eq(canteenMenuItems.menuSourceId, sourceId)),
    ]);
    expect(source).toEqual({
      observedState: null,
      lastErrorCode: null,
      syncClaimToken: claimedSource.syncClaimToken,
      claimExpired: true,
    });
    expect(run).toEqual({
      status: "running",
      errorCode: null,
      completedAt: null,
    });
    expect(items).toEqual([]);
  });

  it("finalizes provider failure, run, health, and claim atomically", async () => {
    fetchMenuFromProvider.mockRejectedValueOnce(
      new Error("UPSTREAM_HTTP_503: unavailable"),
    );

    const result = await syncCanteenMenuSource(sourceId);
    expect(result).toMatchObject({
      status: "provider-failure",
      code: "UPSTREAM_HTTP_503",
      runId: expect.any(String),
    });
    const [[source], [run]] = await Promise.all([
      db
        .select({
          lastAttemptId: canteenMenuSources.lastAttemptId,
          observedState: canteenMenuSources.observedState,
          lastErrorCode: canteenMenuSources.lastErrorCode,
          syncClaimToken: canteenMenuSources.syncClaimToken,
          syncClaimExpiresAt: canteenMenuSources.syncClaimExpiresAt,
          updatedAt: canteenMenuSources.updatedAt,
        })
        .from(canteenMenuSources)
        .where(eq(canteenMenuSources.id, sourceId)),
      db
        .select({
          id: canteenMenuSyncRuns.id,
          status: canteenMenuSyncRuns.status,
          errorCode: canteenMenuSyncRuns.errorCode,
          completedAt: canteenMenuSyncRuns.completedAt,
        })
        .from(canteenMenuSyncRuns)
        .where(eq(canteenMenuSyncRuns.id, result.runId!)),
    ]);
    expect(source).toMatchObject({
      lastAttemptId: result.runId,
      observedState: "error",
      lastErrorCode: "UPSTREAM_HTTP_503",
      syncClaimToken: null,
      syncClaimExpiresAt: null,
    });
    expect(run).toMatchObject({
      id: result.runId,
      status: "failed",
      errorCode: "UPSTREAM_HTTP_503",
    });
    expect(run.completedAt?.getTime()).toBe(source.updatedAt.getTime());
  });

  it("preserves UUID-bound prices, votes, and comments on success", async () => {
    const itemId = randomUUID();
    await db.insert(canteenMenuItems).values({
      id: itemId,
      canteenId,
      name: "旧名称",
      menuSourceId: sourceId,
      externalProductId: "425657",
      isAvailable: true,
    });
    await db.insert(canteenMenuItemPrices).values({
      menuItemId: itemId,
      label: "旧价",
      amountMinor: 3000,
    });
    await db.insert(canteenDishVotes).values({
      menuItemId: itemId,
      userId,
      vote: "like",
    });
    await db.insert(canteenDishComments).values({
      menuItemId: itemId,
      userId,
      content: "保留历史",
    });
    const input = buildPinmeMenuSyncPayload(pinmeCurrent);
    input.items[0].name = "更新名称";
    input.items[0].priceOptions = [
      {
        label: "新价",
        amountMinor: 4200,
        currency: "HKD",
        sortOrder: 0,
      },
    ];
    input.items[0].occurrences = input.items[0].occurrences?.map(
      (occurrence) => ({
        ...occurrence,
        priceOptions: input.items[0].priceOptions,
      }),
    );
    fetchMenuFromProvider.mockResolvedValueOnce(input);

    await expect(syncCanteenMenuSource(sourceId)).resolves.toMatchObject({
      status: "applied",
    });
    const [item] = await db
      .select({ id: canteenMenuItems.id, name: canteenMenuItems.name })
      .from(canteenMenuItems)
      .where(eq(canteenMenuItems.menuSourceId, sourceId));
    expect(item).toEqual({ id: itemId, name: "更新名称" });
    const [prices, votes, comments] = await Promise.all([
      db
        .select({
          label: canteenMenuItemPrices.label,
          amountMinor: canteenMenuItemPrices.amountMinor,
        })
        .from(canteenMenuItemPrices)
        .where(eq(canteenMenuItemPrices.menuItemId, itemId)),
      db
        .select()
        .from(canteenDishVotes)
        .where(eq(canteenDishVotes.menuItemId, itemId)),
      db
        .select()
        .from(canteenDishComments)
        .where(eq(canteenDishComments.menuItemId, itemId)),
    ]);
    expect(prices).toEqual([{ label: "新价", amountMinor: 4200 }]);
    expect(votes).toHaveLength(1);
    expect(comments).toHaveLength(1);
  });

  it("applies a partial PinMe window without deactivating absent managed rows", async () => {
    const absentItemId = randomUUID();
    const returningItemId = randomUUID();
    await db.insert(canteenMenuItems).values([
      {
        id: absentItemId,
        canteenId,
        name: "不在当前时段但仍有效",
        menuSourceId: sourceId,
        externalProductId: "outside-current-window",
        externalSource: "pinme:9900636",
        externalKey: "outside-current-window#period=lunch",
        isAvailable: true,
      },
      {
        id: returningItemId,
        canteenId,
        name: "之前停供的菜品",
        menuSourceId: sourceId,
        externalProductId: "425657",
        externalSource: "pinme:9900636",
        externalKey: "425657#period=dinner+lunch",
        isAvailable: false,
      },
    ]);
    await db.insert(canteenDishVotes).values({
      menuItemId: returningItemId,
      userId,
      vote: "like",
    });
    const partialInput = buildPinmeMenuSyncPayload(pinmeCurrent);
    await expect(
      previewMenuSync(sourceId, {
        ...partialInput,
        snapshotCompleteness: "complete",
        takeOverLegacyItems: false,
      }),
    ).rejects.toThrow("MENU_SNAPSHOT_COMPLETENESS_MISMATCH");
    await expect(
      previewMenuSync(sourceId, {
        ...partialInput,
        takeOverLegacyItems: false,
      }),
    ).resolves.toMatchObject({
      plan: expect.any(Object),
      previewToken: expect.any(String),
    });
    fetchMenuFromProvider.mockResolvedValueOnce(partialInput);

    await expect(syncCanteenMenuSource(sourceId)).resolves.toMatchObject({
      status: "applied",
      itemCount: 1,
    });

    const items = await db
      .select({
        id: canteenMenuItems.id,
        isAvailable: canteenMenuItems.isAvailable,
      })
      .from(canteenMenuItems)
      .where(eq(canteenMenuItems.menuSourceId, sourceId));
    expect(items).toEqual(
      expect.arrayContaining([
        { id: absentItemId, isAvailable: true },
        { id: returningItemId, isAvailable: true },
      ]),
    );
    const [run] = await db
      .select({
        deactivatedCount: canteenMenuSyncRuns.deactivatedCount,
        snapshotHash: canteenMenuSyncRuns.snapshotHash,
      })
      .from(canteenMenuSyncRuns)
      .where(eq(canteenMenuSyncRuns.menuSourceId, sourceId))
      .orderBy(desc(canteenMenuSyncRuns.startedAt))
      .limit(1);
    expect(run.deactivatedCount).toBe(0);
    expect(run.snapshotHash).toBe(
      createHash("sha256").update(JSON.stringify(partialInput)).digest("hex"),
    );
    expect(
      await db
        .select({ count: count() })
        .from(canteenDishVotes)
        .where(eq(canteenDishVotes.menuItemId, returningItemId)),
    ).toEqual([{ count: 1 }]);
  });

  it.each([
    {
      storeId: "4898",
      existingCount: 117,
      incomingCount: 111,
      overlapCount: 57,
      newCount: 54,
    },
    {
      storeId: "5198",
      existingCount: 148,
      incomingCount: 88,
      overlapCount: 76,
      newCount: 12,
    },
  ])(
    "preserves history and apparent removals for PinMe $storeId ($existingCount -> $incomingCount)",
    async ({
      storeId,
      existingCount,
      incomingCount,
      overlapCount,
      newCount,
    }) => {
      const testStoreId = `${storeId}-shape-${sourceId}`;
      await db
        .update(canteenMenuSources)
        .set({ externalStoreId: testStoreId })
        .where(eq(canteenMenuSources.id, sourceId));

      const existingRows = Array.from(
        { length: existingCount },
        (_, index) => ({
          id: randomUUID(),
          canteenId,
          name: `Existing ${index}`,
          mealPeriods: ["allday"],
          menuSourceId: sourceId,
          externalProductId: `existing-${index}`,
          externalSource: `pinme:${testStoreId}`,
          externalKey: `existing-${index}#period=allday`,
          isAvailable: true,
        }),
      );
      await db.insert(canteenMenuItems).values(existingRows);

      const historicalItem = existingRows.at(-1)!;
      await db.insert(canteenDishVotes).values({
        menuItemId: historicalItem.id,
        userId,
        vote: "like",
      });
      await db.insert(canteenDishComments).values({
        menuItemId: historicalItem.id,
        userId,
        content: "partial snapshot must preserve this history",
      });

      const partialInput = {
        snapshotCompleteness: "partial" as const,
        items: [
          ...existingRows.slice(0, overlapCount).map((row, index) => ({
            externalProductId: row.externalProductId,
            name: row.name,
            priceOptions: [],
            mealPeriods: ["allday" as const],
            sortOrder: index,
            svgKey: "default",
          })),
          ...Array.from({ length: newCount }, (_, index) => ({
            externalProductId: `new-${index}`,
            name: `New ${index}`,
            priceOptions: [],
            mealPeriods: ["allday" as const],
            sortOrder: overlapCount + index,
            svgKey: "default",
          })),
        ],
      };
      expect(partialInput.items).toHaveLength(incomingCount);
      fetchMenuFromProvider.mockResolvedValueOnce(partialInput);

      await expect(syncCanteenMenuSource(sourceId)).resolves.toMatchObject({
        status: "applied",
        itemCount: incomingCount,
      });

      const persisted = await db
        .select({
          id: canteenMenuItems.id,
          isAvailable: canteenMenuItems.isAvailable,
        })
        .from(canteenMenuItems)
        .where(eq(canteenMenuItems.menuSourceId, sourceId));
      expect(persisted).toHaveLength(existingCount + newCount);
      expect(persisted.every((item) => item.isAvailable)).toBe(true);
      expect(persisted).toContainEqual({
        id: historicalItem.id,
        isAvailable: true,
      });

      const [run] = await db
        .select({
          createdCount: canteenMenuSyncRuns.createdCount,
          deactivatedCount: canteenMenuSyncRuns.deactivatedCount,
          observation: canteenMenuSyncRuns.observation,
        })
        .from(canteenMenuSyncRuns)
        .where(eq(canteenMenuSyncRuns.menuSourceId, sourceId))
        .orderBy(desc(canteenMenuSyncRuns.startedAt))
        .limit(1);
      expect(run).toMatchObject({
        createdCount: newCount,
        deactivatedCount: 0,
        observation: {
          newProductCount: newCount,
          missingProductCount: existingCount - overlapCount,
        },
      });

      const history = await Promise.all([
        db
          .select({ value: count() })
          .from(canteenDishVotes)
          .where(eq(canteenDishVotes.menuItemId, historicalItem.id)),
        db
          .select({ value: count() })
          .from(canteenDishComments)
          .where(eq(canteenDishComments.menuItemId, historicalItem.id)),
      ]);
      expect(history.map(([row]) => row.value)).toEqual([1, 1]);
    },
  );

  it("loads the persisted locator and mutates only the source-owned canteen", async () => {
    const otherCanteenId = randomUUID();
    const otherItemId = randomUUID();
    await db
      .insert(canteens)
      .values({ id: otherCanteenId, name: "不属于该来源的食堂" });
    await db.insert(canteenMenuItems).values({
      id: otherItemId,
      canteenId: otherCanteenId,
      name: "不可变更的人工菜品",
      isAvailable: true,
    });
    fetchMenuFromProvider.mockImplementationOnce(async (persistedSource) => {
      expect(persistedSource).toMatchObject({
        id: sourceId,
        canteenId,
        provider: "pinme",
        externalStoreId: "9900636",
      });
      return buildPinmeMenuSyncPayload(pinmeCurrent);
    });

    try {
      await expect(syncCanteenMenuSource(sourceId)).resolves.toMatchObject({
        status: "applied",
      });
      const managed = await db
        .select({ canteenId: canteenMenuItems.canteenId })
        .from(canteenMenuItems)
        .where(eq(canteenMenuItems.menuSourceId, sourceId));
      expect(managed).toEqual([{ canteenId }]);
      const [otherItem] = await db
        .select({
          name: canteenMenuItems.name,
          isAvailable: canteenMenuItems.isAvailable,
          menuSourceId: canteenMenuItems.menuSourceId,
        })
        .from(canteenMenuItems)
        .where(eq(canteenMenuItems.id, otherItemId));
      expect(otherItem).toEqual({
        name: "不可变更的人工菜品",
        isAvailable: true,
        menuSourceId: null,
      });
    } finally {
      await db.delete(canteens).where(eq(canteens.id, otherCanteenId));
    }
  });

  it("fences a snapshot fetched from a locator that changes during HTTP", async () => {
    let releaseFetch!: (
      snapshot: ReturnType<typeof buildPinmeMenuSyncPayload>,
    ) => void;
    let markFetchStarted!: () => void;
    const fetchStarted = new Promise<void>((resolve) => {
      markFetchStarted = resolve;
    });
    fetchMenuFromProvider.mockImplementationOnce(async (persistedSource) => {
      expect(persistedSource.externalStoreId).toBe("9900636");
      markFetchStarted();
      return new Promise((resolve) => {
        releaseFetch = resolve;
      });
    });

    const staleSync = syncCanteenMenuSource(sourceId);
    await fetchStarted;
    const [claimedSource] = await db
      .select({ syncClaimToken: canteenMenuSources.syncClaimToken })
      .from(canteenMenuSources)
      .where(eq(canteenMenuSources.id, sourceId));
    expect(claimedSource.syncClaimToken).toEqual(expect.any(String));
    await db
      .update(canteenMenuSources)
      .set({ externalStoreId: "new-store-after-claim" })
      .where(eq(canteenMenuSources.id, sourceId));
    releaseFetch(buildPinmeMenuSyncPayload(pinmeCurrent));

    await expect(staleSync).resolves.toMatchObject({
      status: "superseded",
      code: "MENU_SYNC_SUPERSEDED",
    });
    const [items, [source], [run]] = await Promise.all([
      db
        .select({ id: canteenMenuItems.id })
        .from(canteenMenuItems)
        .where(eq(canteenMenuItems.menuSourceId, sourceId)),
      db
        .select({
          observedState: canteenMenuSources.observedState,
          lastErrorCode: canteenMenuSources.lastErrorCode,
          syncClaimToken: canteenMenuSources.syncClaimToken,
        })
        .from(canteenMenuSources)
        .where(eq(canteenMenuSources.id, sourceId)),
      db
        .select({
          status: canteenMenuSyncRuns.status,
          errorCode: canteenMenuSyncRuns.errorCode,
        })
        .from(canteenMenuSyncRuns)
        .where(eq(canteenMenuSyncRuns.menuSourceId, sourceId)),
    ]);
    expect(items).toEqual([]);
    expect(source).toEqual({
      observedState: null,
      lastErrorCode: null,
      syncClaimToken: claimedSource.syncClaimToken,
    });
    expect(run).toEqual({
      status: "running",
      errorCode: null,
    });
  });

  it("retains unfinished runs while pruning expired completed history", async () => {
    const olderThanRetention = new Date(Date.now() - 31 * 24 * 60 * 60 * 1_000);
    const oldRunningRunId = randomUUID();
    const oldTerminalRuns = [
      { id: randomUUID(), status: "applied" as const },
      { id: randomUUID(), status: "unchanged" as const },
      { id: randomUUID(), status: "failed" as const },
    ];
    await db.insert(canteenMenuSyncRuns).values([
      {
        id: oldRunningRunId,
        menuSourceId: sourceId,
        status: "running",
        startedAt: olderThanRetention,
      },
      ...oldTerminalRuns.map(({ id, status }) => ({
        id,
        menuSourceId: sourceId,
        status,
        startedAt: olderThanRetention,
        completedAt: new Date(olderThanRetention.getTime() + 1_000),
      })),
    ]);
    stubPinmeFetch(pinmeCurrent);

    await syncCanteenMenuSource(sourceId);

    const retained = await db
      .select({ id: canteenMenuSyncRuns.id })
      .from(canteenMenuSyncRuns)
      .where(
        inArray(canteenMenuSyncRuns.id, [
          oldRunningRunId,
          ...oldTerminalRuns.map((run) => run.id),
        ]),
      );
    expect(retained.map((run) => run.id)).toEqual([oldRunningRunId]);
  });

  it("prunes run history before the short source-claim transaction", async () => {
    const oldRunId = randomUUID();
    await db.insert(canteenMenuSyncRuns).values({
      id: oldRunId,
      menuSourceId: sourceId,
      status: "failed",
      startedAt: sql`now() - interval '31 days'`,
      completedAt: sql`now() - interval '31 days'`,
    });
    stubPinmeFetch(pinmeCurrent);

    const blocker = new Client({ connectionString: process.env.DATABASE_URL });
    const observer = new Client({ connectionString: process.env.DATABASE_URL });
    const contender = new Client({
      connectionString: process.env.DATABASE_URL,
    });
    await Promise.all([
      blocker.connect(),
      observer.connect(),
      contender.connect(),
    ]);
    let sync: Promise<
      Awaited<ReturnType<typeof syncCanteenMenuSource>>
    > | null = null;
    try {
      await blocker.query("begin");
      await blocker.query(
        "lock table canteen_menu_sync_runs in access exclusive mode",
      );
      const blockerPid = await blocker.query<{ pid: number }>(
        "select pg_backend_pid() as pid",
      );
      sync = syncCanteenMenuSource(sourceId);

      await vi.waitFor(
        async () => {
          const waiting = await observer.query<{ waiting: string }>(
            `select exists (
               select 1
                 from pg_stat_activity
                where $1 = any(pg_blocking_pids(pid))
                  and query like 'delete from "canteen_menu_sync_runs"%'
             )::text as waiting`,
            [blockerPid.rows[0]?.pid],
          );
          expect(waiting.rows[0]?.waiting).toBe("true");
        },
        { timeout: 2_000, interval: 20 },
      );

      await contender.query("begin");
      await expect(
        contender.query(
          "select id from canteen_menu_sources where id = $1 for update nowait",
          [sourceId],
        ),
      ).resolves.toMatchObject({ rowCount: 1 });
      await contender.query("rollback");
    } finally {
      await contender.query("rollback").catch(() => undefined);
      await blocker.query("rollback").catch(() => undefined);
      await Promise.all([blocker.end(), observer.end(), contender.end()]);
      if (sync) await sync;
    }
  });

  it("keeps the last successful menu when a provider fixture has duplicates", async () => {
    const lastSuccessAt = new Date("2026-08-01T00:00:00.000Z");
    await db
      .update(canteenMenuSources)
      .set({ lastSuccessAt, lastSnapshotHash: "last-good-snapshot" })
      .where(eq(canteenMenuSources.id, sourceId));
    const itemId = randomUUID();
    await db.insert(canteenMenuItems).values({
      id: itemId,
      canteenId,
      name: "最近成功菜品",
      mealPeriods: ["lunch", "dinner"],
      menuSourceId: sourceId,
      externalProductId: "425657",
      isAvailable: true,
    });
    await db.insert(canteenDishVotes).values({
      menuItemId: itemId,
      userId,
      vote: "like",
    });
    await db.insert(canteenDishComments).values({
      menuItemId: itemId,
      userId,
      content: "必须保留的历史",
    });
    const duplicate = structuredClone(pinmeCurrent);
    duplicate.data.group[0].products.push(
      structuredClone(duplicate.data.group[0].products[0]),
    );
    stubPinmeFetch(duplicate);

    const result = await syncCanteenMenuSource(sourceId);
    expect(result).toMatchObject({
      sourceId,
      canteenId,
      status: "provider-failure",
      code: "DUPLICATE_IDENTITY",
    });

    const items = await db
      .select({
        id: canteenMenuItems.id,
        name: canteenMenuItems.name,
        isAvailable: canteenMenuItems.isAvailable,
      })
      .from(canteenMenuItems)
      .where(eq(canteenMenuItems.menuSourceId, sourceId));
    expect(items).toEqual([
      { id: itemId, name: "最近成功菜品", isAvailable: true },
    ]);
    const [source] = await db
      .select({
        lastSuccessAt: canteenMenuSources.lastSuccessAt,
        lastSnapshotHash: canteenMenuSources.lastSnapshotHash,
        lastErrorCode: canteenMenuSources.lastErrorCode,
        lastError: canteenMenuSources.lastError,
      })
      .from(canteenMenuSources)
      .where(eq(canteenMenuSources.id, sourceId));
    expect(source).toMatchObject({
      lastSuccessAt,
      lastSnapshotHash: "last-good-snapshot",
      lastErrorCode: "DUPLICATE_IDENTITY",
      lastError: expect.stringContaining("DUPLICATE_IDENTITY"),
    });
    expect(source.lastError).not.toContain("425657");
    expect(source.lastError).not.toContain("喇沙魚旦烏冬");
    const [run] = await db
      .select({
        status: canteenMenuSyncRuns.status,
        errorCode: canteenMenuSyncRuns.errorCode,
      })
      .from(canteenMenuSyncRuns)
      .where(eq(canteenMenuSyncRuns.menuSourceId, sourceId));
    expect(run).toEqual({ status: "failed", errorCode: "DUPLICATE_IDENTITY" });
    const history = await Promise.all([
      db
        .select({ value: count() })
        .from(canteenDishVotes)
        .where(eq(canteenDishVotes.menuItemId, itemId)),
      db
        .select({ value: count() })
        .from(canteenDishComments)
        .where(eq(canteenDishComments.menuItemId, itemId)),
    ]);
    expect(history.map(([row]) => row.value)).toEqual([1, 1]);
  });

  it("maps a same-name provider replacement onto the existing UUID", async () => {
    const itemId = randomUUID();
    await db.insert(canteenMenuItems).values({
      id: itemId,
      canteenId,
      name: "同名示例菜品",
      menuSourceId: sourceId,
      externalProductId: "secret-old-id",
      isAvailable: true,
    });
    await db.insert(canteenDishVotes).values({
      menuItemId: itemId,
      userId,
      vote: "like",
    });
    await db.insert(canteenDishComments).values({
      menuItemId: itemId,
      userId,
      content: "必须保留的历史",
    });
    const replacement = structuredClone(pinmeCurrent);
    replacement.data.group[0].products[0].local_name = "同名示例菜品";
    const replacementPayload = buildPinmeMenuSyncPayload(replacement);
    const expectedPreview = await previewMenuSync(sourceId, {
      ...replacementPayload,
      takeOverLegacyItems: false,
    });
    expect(expectedPreview.blockingDecision.blocked).toBe(false);
    stubPinmeFetch(replacement);

    await expect(syncCanteenMenuSource(sourceId)).resolves.toMatchObject({
      status: "applied",
    });

    const items = await db
      .select({
        id: canteenMenuItems.id,
        externalProductId: canteenMenuItems.externalProductId,
        isAvailable: canteenMenuItems.isAvailable,
      })
      .from(canteenMenuItems)
      .where(eq(canteenMenuItems.canteenId, canteenId));
    expect(items).toEqual([
      { id: itemId, externalProductId: "secret-old-id", isAvailable: true },
    ]);
    const offerings = await db
      .select({
        externalProductId: canteenMenuProviderOfferings.externalProductId,
        menuItemId: canteenMenuProviderOfferings.menuItemId,
        isAvailable: canteenMenuProviderOfferings.isAvailable,
      })
      .from(canteenMenuProviderOfferings)
      .where(eq(canteenMenuProviderOfferings.menuSourceId, sourceId));
    expect(offerings).toEqual(
      expect.arrayContaining([
        {
          externalProductId: "secret-old-id",
          menuItemId: itemId,
          // The first scoped read cannot retire evidence in unobserved periods.
          isAvailable: true,
        },
        {
          externalProductId: replacementPayload.items[0].externalProductId,
          menuItemId: itemId,
          isAvailable: true,
        },
      ]),
    );
    const [run] = await db
      .select({ observation: canteenMenuSyncRuns.observation })
      .from(canteenMenuSyncRuns)
      .where(eq(canteenMenuSyncRuns.menuSourceId, sourceId))
      .orderBy(desc(canteenMenuSyncRuns.startedAt))
      .limit(1);
    expect(run.observation).toEqual(expectedPreview.identityObservation);
    expect(JSON.stringify(run.observation)).not.toContain("secret");
    expect(JSON.stringify(run.observation)).not.toContain("同名示例菜品");
    const history = await Promise.all([
      db
        .select({ value: count() })
        .from(canteenDishVotes)
        .where(eq(canteenDishVotes.menuItemId, itemId)),
      db
        .select({ value: count() })
        .from(canteenDishComments)
        .where(eq(canteenDishComments.menuItemId, itemId)),
    ]);
    expect(history.map(([row]) => row.value)).toEqual([1, 1]);
  });

  it("gates then transactionally merges converged UUIDs with latest-vote history", async () => {
    const earliestItemId = randomUUID();
    const laterItemId = randomUUID();
    const anonymousSessionId = randomUUID();
    const createdEarly = new Date("2025-01-01T00:00:00Z");
    const createdLater = new Date("2026-01-01T00:00:00Z");
    await db.insert(canteenMenuItems).values([
      {
        id: earliestItemId,
        canteenId,
        name: "紙包飲品",
        normalizedName: "紙包飲品",
        menuSourceId: sourceId,
        externalProductId: "old-drink",
        isAvailable: false,
        createdAt: createdEarly,
      },
      {
        id: laterItemId,
        canteenId,
        name: "紙包飲品",
        normalizedName: "紙包飲品",
        menuSourceId: sourceId,
        externalProductId: "current-drink",
        isAvailable: true,
        createdAt: createdLater,
      },
    ]);
    await db.insert(canteenMenuProviderOfferings).values([
      {
        canteenId,
        menuSourceId: sourceId,
        menuItemId: earliestItemId,
        externalProductId: "old-drink",
        providerName: "紙包飲品",
        normalizedName: "紙包飲品",
        isAvailable: false,
        createdAt: createdEarly,
      },
      {
        canteenId,
        menuSourceId: sourceId,
        menuItemId: laterItemId,
        externalProductId: "current-drink",
        providerName: "紙包飲品",
        normalizedName: "紙包飲品",
        isAvailable: true,
        createdAt: createdLater,
      },
    ]);
    await db.insert(canteenDishComments).values([
      { menuItemId: earliestItemId, userId, content: "较早 UUID 评论" },
      { menuItemId: laterItemId, userId, content: "较晚 UUID 评论" },
    ]);
    await db.insert(canteenDishVotes).values([
      {
        menuItemId: earliestItemId,
        userId,
        vote: "like",
        createdAt: new Date("2026-01-01T00:00:00Z"),
        updatedAt: new Date("2026-01-01T00:00:00Z"),
      },
      {
        menuItemId: laterItemId,
        userId,
        vote: "dislike",
        createdAt: new Date("2026-02-01T00:00:00Z"),
        updatedAt: new Date("2026-02-02T00:00:00Z"),
      },
      {
        menuItemId: laterItemId,
        anonymousSessionId,
        vote: "like",
        createdAt: new Date("2026-03-01T00:00:00Z"),
        updatedAt: new Date("2026-03-01T00:00:00Z"),
      },
    ]);
    const current = structuredClone(pinmeCurrent);
    current.data.group[0].products[0].product_id = "current-drink";
    current.data.group[0].products[0].local_name = "紙包飲品";

    stubPinmeFetch(current);
    await expect(syncCanteenMenuSource(sourceId)).resolves.toMatchObject({
      status: "blocked",
      code: "MENU_SYNC_CONFLICT",
    });
    expect(
      await db
        .select()
        .from(canteenMenuIdentityTransitions)
        .where(eq(canteenMenuIdentityTransitions.canteenId, canteenId)),
    ).toEqual([]);

    await db.insert(siteSettings).values({
      key: "canteen_menu_identity_evolution",
      value: "enabled",
    });
    stubPinmeFetch(current);
    await expect(syncCanteenMenuSource(sourceId)).resolves.toMatchObject({
      status: "applied",
    });

    const items = await db
      .select({
        id: canteenMenuItems.id,
        menuSourceId: canteenMenuItems.menuSourceId,
        isAvailable: canteenMenuItems.isAvailable,
      })
      .from(canteenMenuItems)
      .where(inArray(canteenMenuItems.id, [earliestItemId, laterItemId]));
    expect(items).toEqual(
      expect.arrayContaining([
        {
          id: earliestItemId,
          menuSourceId: sourceId,
          isAvailable: true,
        },
        { id: laterItemId, menuSourceId: null, isAvailable: false },
      ]),
    );
    const offerings = await db
      .select({
        externalProductId: canteenMenuProviderOfferings.externalProductId,
        menuItemId: canteenMenuProviderOfferings.menuItemId,
      })
      .from(canteenMenuProviderOfferings)
      .where(eq(canteenMenuProviderOfferings.menuSourceId, sourceId));
    expect(offerings).toEqual(
      expect.arrayContaining([
        { externalProductId: "old-drink", menuItemId: earliestItemId },
        { externalProductId: "current-drink", menuItemId: earliestItemId },
      ]),
    );
    const comments = await db
      .select({ menuItemId: canteenDishComments.menuItemId })
      .from(canteenDishComments)
      .where(eq(canteenDishComments.userId, userId));
    expect(comments).toEqual([
      { menuItemId: earliestItemId },
      { menuItemId: earliestItemId },
    ]);
    const votes = await db
      .select({
        menuItemId: canteenDishVotes.menuItemId,
        vote: canteenDishVotes.vote,
        updatedAt: canteenDishVotes.updatedAt,
      })
      .from(canteenDishVotes)
      .where(eq(canteenDishVotes.userId, userId));
    expect(votes).toEqual([
      {
        menuItemId: earliestItemId,
        vote: "dislike",
        updatedAt: new Date("2026-02-02T00:00:00Z"),
      },
    ]);
    await expect(
      db
        .select({
          menuItemId: canteenDishVotes.menuItemId,
          vote: canteenDishVotes.vote,
        })
        .from(canteenDishVotes)
        .where(eq(canteenDishVotes.anonymousSessionId, anonymousSessionId)),
    ).resolves.toEqual([{ menuItemId: earliestItemId, vote: "like" }]);
    const transitions = await db
      .select({
        kind: canteenMenuIdentityTransitions.kind,
        fromMenuItemId: canteenMenuIdentityTransitions.fromMenuItemId,
        toMenuItemId: canteenMenuIdentityTransitions.toMenuItemId,
        externalProductIds: canteenMenuIdentityTransitions.externalProductIds,
      })
      .from(canteenMenuIdentityTransitions)
      .where(eq(canteenMenuIdentityTransitions.canteenId, canteenId));
    expect(transitions).toEqual([
      {
        kind: "merge",
        fromMenuItemId: laterItemId,
        toMenuItemId: earliestItemId,
        externalProductIds: ["current-drink"],
      },
    ]);
    const publicItems = await getCanteenMenuItems(canteenId);
    expect(publicItems.some((item) => item.id === earliestItemId)).toBe(true);
    expect(publicItems.some((item) => item.id === laterItemId)).toBe(false);

    stubPinmeFetch(current);
    await syncCanteenMenuSource(sourceId);
    const [transitionCount] = await db
      .select({ value: count() })
      .from(canteenMenuIdentityTransitions)
      .where(eq(canteenMenuIdentityTransitions.canteenId, canteenId));
    expect(transitionCount.value).toBe(1);
  });

  it("splits a renamed alias from now on without moving old UUID history", async () => {
    const originalItemId = randomUUID();
    await db.insert(siteSettings).values({
      key: "canteen_menu_identity_evolution",
      value: "enabled",
    });
    await db.insert(canteenMenuItems).values({
      id: originalItemId,
      canteenId,
      name: "凍檸茶",
      normalizedName: "凍檸茶",
      menuSourceId: sourceId,
      externalProductId: "a",
      isAvailable: true,
      createdAt: new Date("2026-01-01T00:00:00Z"),
    });
    await db.insert(canteenMenuProviderOfferings).values([
      {
        canteenId,
        menuSourceId: sourceId,
        menuItemId: originalItemId,
        externalProductId: "a",
        providerName: "凍檸茶",
        normalizedName: "凍檸茶",
        isAvailable: true,
        createdAt: new Date("2026-01-01T00:00:00Z"),
      },
      {
        canteenId,
        menuSourceId: sourceId,
        menuItemId: originalItemId,
        externalProductId: "b",
        providerName: "凍檸茶",
        normalizedName: "凍檸茶",
        isAvailable: true,
        createdAt: new Date("2026-01-02T00:00:00Z"),
      },
      {
        canteenId,
        menuSourceId: sourceId,
        menuItemId: originalItemId,
        externalProductId: "c",
        providerName: "凍檸茶",
        normalizedName: "凍檸茶",
        isAvailable: true,
        createdAt: new Date("2026-01-03T00:00:00Z"),
      },
    ]);
    await db.insert(canteenDishComments).values({
      menuItemId: originalItemId,
      userId,
      content: "拆分前历史仍属于原菜品",
    });
    await db.insert(canteenDishVotes).values({
      menuItemId: originalItemId,
      userId,
      vote: "like",
    });
    const renamedAlias = structuredClone(pinmeCurrent);
    const template = renamedAlias.data.group[0].products[0];
    renamedAlias.data.group[0].products = [
      { ...structuredClone(template), product_id: "a", local_name: "熱檸茶" },
      { ...structuredClone(template), product_id: "b", local_name: "凍檸茶" },
      { ...structuredClone(template), product_id: "c", local_name: "凍檸茶" },
    ];
    stubPinmeFetch(renamedAlias);

    await expect(syncCanteenMenuSource(sourceId)).resolves.toMatchObject({
      status: "applied",
    });
    const items = await db
      .select({ id: canteenMenuItems.id, name: canteenMenuItems.name })
      .from(canteenMenuItems)
      .where(
        and(
          eq(canteenMenuItems.menuSourceId, sourceId),
          eq(canteenMenuItems.isAvailable, true),
        ),
      );
    expect(items).toHaveLength(2);
    expect(items).toEqual(
      expect.arrayContaining([
        { id: originalItemId, name: "凍檸茶" },
        { id: expect.not.stringMatching(originalItemId), name: "熱檸茶" },
      ]),
    );
    const splitItemId = items.find((item) => item.name === "熱檸茶")!.id;
    const [splitAudit] = await db
      .select({
        kind: canteenMenuIdentityTransitions.kind,
        fromMenuItemId: canteenMenuIdentityTransitions.fromMenuItemId,
        toMenuItemId: canteenMenuIdentityTransitions.toMenuItemId,
        externalProductIds: canteenMenuIdentityTransitions.externalProductIds,
      })
      .from(canteenMenuIdentityTransitions)
      .where(eq(canteenMenuIdentityTransitions.kind, "split"));
    expect(splitAudit).toEqual({
      kind: "split",
      fromMenuItemId: originalItemId,
      toMenuItemId: splitItemId,
      externalProductIds: ["a"],
    });
    const history = await Promise.all([
      db
        .select({ value: count() })
        .from(canteenDishComments)
        .where(eq(canteenDishComments.menuItemId, originalItemId)),
      db
        .select({ value: count() })
        .from(canteenDishVotes)
        .where(eq(canteenDishVotes.menuItemId, originalItemId)),
      db
        .select({ value: count() })
        .from(canteenDishComments)
        .where(eq(canteenDishComments.menuItemId, splitItemId)),
    ]);
    expect(history.map(([row]) => row.value)).toEqual([1, 1, 0]);

    stubPinmeFetch(renamedAlias);
    await syncCanteenMenuSource(sourceId);
    const [[activeCount], [auditCount]] = await Promise.all([
      db
        .select({ value: count() })
        .from(canteenMenuItems)
        .where(
          and(
            eq(canteenMenuItems.menuSourceId, sourceId),
            eq(canteenMenuItems.isAvailable, true),
          ),
        ),
      db
        .select({ value: count() })
        .from(canteenMenuIdentityTransitions)
        .where(eq(canteenMenuIdentityTransitions.canteenId, canteenId)),
    ]);
    expect(activeCount.value).toBe(2);
    expect(auditCount.value).toBe(1);

    const secondSplit = structuredClone(renamedAlias);
    secondSplit.data.group[0].products[2].local_name = "熱檸茶";
    stubPinmeFetch(secondSplit);
    await expect(syncCanteenMenuSource(sourceId)).resolves.toMatchObject({
      status: "unchanged",
    });
    const splitAudits = await db
      .select({
        externalProductIds: canteenMenuIdentityTransitions.externalProductIds,
        eventKey: canteenMenuIdentityTransitions.eventKey,
      })
      .from(canteenMenuIdentityTransitions)
      .where(eq(canteenMenuIdentityTransitions.kind, "split"));
    expect(splitAudits).toEqual(
      expect.arrayContaining([
        {
          externalProductIds: ["a"],
          eventKey: expect.stringMatching(/^[0-9a-f]{64}$/),
        },
        {
          externalProductIds: ["c"],
          eventKey: expect.stringMatching(/^[0-9a-f]{64}$/),
        },
      ]),
    );
    expect(splitAudits).toHaveLength(2);
    expect(new Set(splitAudits.map((audit) => audit.eventKey)).size).toBe(2);
  });

  it("renames a single-offering dish in place and audits the stable UUID", async () => {
    const stableItemId = randomUUID();
    await db.insert(siteSettings).values({
      key: "canteen_menu_identity_evolution",
      value: "enabled",
    });
    await db.insert(canteenMenuItems).values({
      id: stableItemId,
      canteenId,
      name: "舊菜名",
      normalizedName: "舊菜名",
      menuSourceId: sourceId,
      externalProductId: "stable-product",
      isAvailable: true,
    });
    await db.insert(canteenMenuProviderOfferings).values({
      canteenId,
      menuSourceId: sourceId,
      menuItemId: stableItemId,
      externalProductId: "stable-product",
      providerName: "舊菜名",
      normalizedName: "舊菜名",
      isAvailable: true,
    });
    await db.insert(canteenDishComments).values({
      menuItemId: stableItemId,
      userId,
      content: "改名前历史",
    });
    const renamed = structuredClone(pinmeCurrent);
    renamed.data.group[0].products[0].product_id = "stable-product";
    renamed.data.group[0].products[0].local_name = "新菜名";
    stubPinmeFetch(renamed);

    await expect(syncCanteenMenuSource(sourceId)).resolves.toMatchObject({
      status: "applied",
    });
    const [item] = await db
      .select({ id: canteenMenuItems.id, name: canteenMenuItems.name })
      .from(canteenMenuItems)
      .where(eq(canteenMenuItems.canteenId, canteenId));
    expect(item).toEqual({ id: stableItemId, name: "新菜名" });
    const [comment] = await db
      .select({ menuItemId: canteenDishComments.menuItemId })
      .from(canteenDishComments)
      .where(eq(canteenDishComments.userId, userId));
    expect(comment.menuItemId).toBe(stableItemId);
    const [audit] = await db
      .select({
        kind: canteenMenuIdentityTransitions.kind,
        fromMenuItemId: canteenMenuIdentityTransitions.fromMenuItemId,
        toMenuItemId: canteenMenuIdentityTransitions.toMenuItemId,
        fromNormalizedName: canteenMenuIdentityTransitions.fromNormalizedName,
        toNormalizedName: canteenMenuIdentityTransitions.toNormalizedName,
      })
      .from(canteenMenuIdentityTransitions)
      .where(eq(canteenMenuIdentityTransitions.canteenId, canteenId));
    expect(audit).toEqual({
      kind: "rename",
      fromMenuItemId: stableItemId,
      toMenuItemId: stableItemId,
      fromNormalizedName: "舊菜名",
      toNormalizedName: "新菜名",
    });
  });
});
