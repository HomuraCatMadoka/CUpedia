import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { count, desc, eq, inArray, sql } from "drizzle-orm";
import { Client } from "pg";
import { db } from "@/db";
import {
  canteenDishComments,
  canteenDishVotes,
  canteenMenuItemPrices,
  canteenMenuItems,
  canteenMenuSources,
  canteenMenuSyncRuns,
  canteens,
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
import {
  commitClaimedRecurringMenuSync,
  previewMenuSync,
} from "@/lib/canteen-menu-sync-store";
import type { MenuSourceClaim } from "@/lib/canteen-menu-source-sync-runtime";

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
        name: canteenMenuItems.name,
        isAvailable: canteenMenuItems.isAvailable,
      })
      .from(canteenMenuItems)
      .where(eq(canteenMenuItems.menuSourceId, sourceId));
    expect(items).toEqual([
      {
        externalProductId: "425657",
        name: "喇沙魚旦烏冬",
        isAvailable: true,
      },
    ]);

    const [run] = await db
      .select({
        status: canteenMenuSyncRuns.status,
        itemCount: canteenMenuSyncRuns.itemCount,
        createdCount: canteenMenuSyncRuns.createdCount,
      })
      .from(canteenMenuSyncRuns)
      .where(eq(canteenMenuSyncRuns.menuSourceId, sourceId));
    expect(run).toEqual({ status: "applied", itemCount: 1, createdCount: 1 });
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

  it("rejects a structurally forged recurring commit capability", async () => {
    const [source] = await db
      .select()
      .from(canteenMenuSources)
      .where(eq(canteenMenuSources.id, sourceId));
    const forgedClaim = {
      source: { ...source, externalStoreId: "caller-controlled-store" },
      runId: randomUUID(),
      sourceFingerprint: "caller-controlled-fingerprint",
    } as MenuSourceClaim;

    await expect(
      commitClaimedRecurringMenuSync(
        buildPinmeMenuSyncPayload(pinmeCurrent),
        "caller-controlled-preview-token",
        {
          claim: forgedClaim,
          snapshotHash: "caller-controlled-snapshot",
          itemCount: 1,
        },
      ),
    ).rejects.toThrow("MENU_SYNC_SUPERSEDED");
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
      externalSource: "pinme:9900636",
      externalKey: "425657#period=dinner+lunch",
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
      syncClaimToken: null,
    });
    expect(run).toEqual({
      status: "failed",
      errorCode: "MENU_SYNC_SUPERSEDED",
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
      externalSource: "pinme:9900636",
      externalKey: "425657#period=dinner+lunch",
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

  it("blocks a same-name identity replacement without changing menu history", async () => {
    const itemId = randomUUID();
    await db.insert(canteenMenuItems).values({
      id: itemId,
      canteenId,
      name: "同名示例菜品",
      menuSourceId: sourceId,
      externalProductId: "secret-old-id",
      externalSource: "pinme:9900636",
      externalKey: "secret-old-id#period=allday",
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
    const expectedPreview = await previewMenuSync(sourceId, {
      ...buildPinmeMenuSyncPayload(replacement),
      takeOverLegacyItems: false,
    });
    expect(expectedPreview.blockingDecision).toMatchObject({
      blocked: true,
      code: "MENU_SYNC_IDENTITY_CHURN",
    });
    stubPinmeFetch(replacement);

    await expect(syncCanteenMenuSource(sourceId)).resolves.toMatchObject({
      status: "blocked",
      code: "MENU_SYNC_IDENTITY_CHURN",
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
});
