import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq, inArray, sql } from "drizzle-orm";
import { Client } from "pg";
import { db } from "@/db";
import {
  canteenMenuItems,
  canteenMenuSources,
  canteenMenuSyncRuns,
  canteenMenuSyncSnapshots,
  canteens,
  type HktWeekday,
} from "@/db/schema";
import { buildPinmeMenuSyncPayload } from "@/lib/canteen-pinme-menu";
import { listMenuSourceScheduleCandidates } from "@/lib/canteen-menu-sync-scheduler";
import type { MenuSyncTransaction } from "@/lib/canteen-menu-sync-store";
import {
  menuSyncWindowAcceptsActivity,
  menuSyncWindowAt,
} from "@/lib/canteen-menu-sync-window";
import pinmeCurrent from "../lib/fixtures/canteen-providers/pinme-current.json";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const { fetchMenuFromProvider, readMenuSyncDatabaseNow } = vi.hoisted(() => ({
  fetchMenuFromProvider: vi.fn(),
  readMenuSyncDatabaseNow: vi.fn(),
}));

vi.mock("@/lib/canteen-menu-source-adapters", () => ({
  fetchMenuFromProvider,
}));

vi.mock("@/lib/canteen-menu-sync-clock", () => ({
  readMenuSyncDatabaseNow,
}));

import { syncNextDueMenuSource } from "@/lib/canteen-menu-source-sync";

const hasDb = Boolean(process.env.DATABASE_URL);
const TEST_CLAIM_OFFSET_MS = 10 * 60 * 1_000;

function claimableTestDatabaseNow(databaseNow: Date): Date {
  const window = menuSyncWindowAt(databaseNow);
  return databaseNow < window.claimsStartAt
    ? new Date(window.claimsStartAt.getTime() + TEST_CLAIM_OFFSET_MS)
    : databaseNow;
}

describe.skipIf(!hasDb)("scheduled due menu source sync", () => {
  const canteenIds: string[] = [];
  const previouslyEnabledSourceIds: string[] = [];

  beforeEach(async () => {
    fetchMenuFromProvider.mockReset();
    readMenuSyncDatabaseNow.mockReset();
    readMenuSyncDatabaseNow.mockImplementation(
      async (tx: MenuSyncTransaction) => {
        const result = await tx.execute<{ database_now: string | Date }>(
          sql`select now() as database_now`,
        );
        return claimableTestDatabaseNow(
          new Date(String(result.rows[0]?.database_now)),
        );
      },
    );
    const enabledSources = await db
      .select({ id: canteenMenuSources.id })
      .from(canteenMenuSources)
      .where(eq(canteenMenuSources.enabled, true));
    previouslyEnabledSourceIds.push(...enabledSources.map(({ id }) => id));
    if (previouslyEnabledSourceIds.length > 0) {
      await db
        .update(canteenMenuSources)
        .set({ enabled: false })
        .where(inArray(canteenMenuSources.id, previouslyEnabledSourceIds));
    }
  });

  afterEach(async () => {
    if (canteenIds.length > 0) {
      await db.delete(canteens).where(inArray(canteens.id, canteenIds));
      canteenIds.length = 0;
    }
    if (previouslyEnabledSourceIds.length > 0) {
      await db
        .update(canteenMenuSources)
        .set({ enabled: true })
        .where(inArray(canteenMenuSources.id, previouslyEnabledSourceIds));
      previouslyEnabledSourceIds.length = 0;
    }
  });

  async function currentTestDatabaseNow() {
    const databaseNow = await readMenuSyncDatabaseNow(
      db as unknown as MenuSyncTransaction,
    );
    if (Number.isNaN(databaseNow.getTime())) {
      throw new Error("DATABASE_NOW_MISSING");
    }
    return databaseNow;
  }

  async function currentDatabaseWindow() {
    const databaseNow = await currentTestDatabaseNow();
    return menuSyncWindowAt(databaseNow);
  }

  async function createEligibleSource(
    name: string,
    options: {
      closedWeekdays?: HktWeekday[];
      externalStoreId?: string;
      syncMealPeriods?: ("breakfast" | "lunch" | "dinner")[];
    } = {},
  ) {
    const currentWindow = await currentDatabaseWindow();
    const canteenId = randomUUID();
    const sourceId = randomUUID();
    canteenIds.push(canteenId);
    await db.insert(canteens).values({ id: canteenId, name });
    await db.insert(canteenMenuSources).values({
      id: sourceId,
      canteenId,
      provider: "pinme",
      externalStoreId: options.externalStoreId ?? `scheduler-${sourceId}`,
      closedWeekdays: options.closedWeekdays ?? [],
      syncMealPeriods: options.syncMealPeriods ?? [
        "breakfast",
        "lunch",
        "dinner",
      ],
    });
    return { canteenId, sourceId, currentWindow };
  }

  it("keeps the default test clock inside the claimable window", async () => {
    const databaseNow = await currentTestDatabaseNow();
    const window = menuSyncWindowAt(databaseNow);

    expect(menuSyncWindowAcceptsActivity(window, databaseNow)).toBe(true);
  });

  it("syncs enabled sources one at a time and does not rerun them in the window", async () => {
    const currentWindow = await currentDatabaseWindow();
    const firstCanteenId = randomUUID();
    const secondCanteenId = randomUUID();
    const firstSourceId = randomUUID();
    const secondSourceId = randomUUID();
    canteenIds.push(firstCanteenId, secondCanteenId);

    await db.insert(canteens).values([
      { id: firstCanteenId, name: "来源甲" },
      { id: secondCanteenId, name: "来源乙" },
    ]);
    await db.insert(canteenMenuSources).values([
      {
        id: firstSourceId,
        canteenId: firstCanteenId,
        provider: "pinme",
        externalStoreId: "scheduler-first",
      },
      {
        id: secondSourceId,
        canteenId: secondCanteenId,
        provider: "pinme",
        externalStoreId: "scheduler-second",
      },
    ]);
    fetchMenuFromProvider.mockResolvedValue(
      buildPinmeMenuSyncPayload(pinmeCurrent),
    );

    const firstResult = await syncNextDueMenuSource();
    const secondResult = await syncNextDueMenuSource();
    expect(firstResult).toMatchObject({
      disposition: "continue",
      result: { status: "applied", itemCount: 1 },
    });
    expect(secondResult).toMatchObject({
      disposition: "continue",
      result: { status: "applied", itemCount: 1 },
    });
    expect(
      new Set(
        [firstResult, secondResult].flatMap((result) =>
          "sourceId" in result ? [result.sourceId] : [],
        ),
      ),
    ).toEqual(new Set([firstSourceId, secondSourceId]));
    await expect(syncNextDueMenuSource()).resolves.toEqual({
      disposition: "no-work",
      window: currentWindow.key,
    });
    expect(fetchMenuFromProvider).toHaveBeenCalledTimes(2);

    const runs = await db
      .select({ sourceId: canteenMenuSyncRuns.menuSourceId })
      .from(canteenMenuSyncRuns)
      .where(
        inArray(canteenMenuSyncRuns.menuSourceId, [
          firstSourceId,
          secondSourceId,
        ]),
      );
    expect(runs).toHaveLength(2);
  });

  it("claims different sources when two invocations race", async () => {
    const first = await createEligibleSource("并发来源甲");
    const second = await createEligibleSource("并发来源乙");
    fetchMenuFromProvider.mockResolvedValue(
      buildPinmeMenuSyncPayload(pinmeCurrent),
    );

    const results = await Promise.all([
      syncNextDueMenuSource(),
      syncNextDueMenuSource(),
    ]);

    expect(results.map((result) => result.disposition)).toEqual([
      "continue",
      "continue",
    ]);
    expect(
      new Set(
        results.flatMap((result) =>
          "sourceId" in result ? [result.sourceId] : [],
        ),
      ),
    ).toEqual(new Set([first.sourceId, second.sourceId]));
    expect(fetchMenuFromProvider).toHaveBeenCalledTimes(2);

    const runs = await db
      .select({
        sourceId: canteenMenuSyncRuns.menuSourceId,
        startedAt: canteenMenuSyncRuns.startedAt,
      })
      .from(canteenMenuSyncRuns)
      .where(
        inArray(canteenMenuSyncRuns.menuSourceId, [
          first.sourceId,
          second.sourceId,
        ]),
      );
    expect(runs).toHaveLength(2);
    const contextsBySource = new Map(
      fetchMenuFromProvider.mock.calls.map(([source, context]) => [
        source.id,
        context,
      ]),
    );
    expect(contextsBySource.size).toBe(2);
    for (const run of runs) {
      const context = contextsBySource.get(run.sourceId);
      expect(context).toBeDefined();
      const window = menuSyncWindowAt(context!.observedAt);
      expect(context).toEqual({
        observedAt: run.startedAt,
        syncWindowKey: window.key,
        mealPeriod: window.period,
      });
    }
  });

  it("continues past a candidate changed by a concurrent claim commit", async () => {
    const first = await createEligibleSource("并发提交来源甲");
    const second = await createEligibleSource("并发提交来源乙");
    await db
      .update(canteenMenuSources)
      .set({ createdAt: new Date(Date.now() - 60_000) })
      .where(eq(canteenMenuSources.id, first.sourceId));
    fetchMenuFromProvider.mockResolvedValue(
      buildPinmeMenuSyncPayload(pinmeCurrent),
    );

    const claimant = new Client({ connectionString: process.env.DATABASE_URL });
    const observer = new Client({ connectionString: process.env.DATABASE_URL });
    await Promise.all([claimant.connect(), observer.connect()]);
    const runId = randomUUID();
    try {
      await claimant.query("begin");
      await claimant.query(
        "lock table canteen_menu_sync_runs in access exclusive mode",
      );
      const claimantPid = await claimant.query<{ pid: number }>(
        "select pg_backend_pid() as pid",
      );
      const sync = syncNextDueMenuSource();
      await vi.waitFor(
        async () => {
          const waiting = await observer.query<{ waiting: boolean }>(
            `select exists (
               select 1 from pg_stat_activity
               where $1 = any(pg_blocking_pids(pid))
             ) as waiting`,
            [claimantPid.rows[0]?.pid],
          );
          expect(waiting.rows[0]?.waiting).toBe(true);
        },
        { timeout: 2_000, interval: 20 },
      );
      await claimant.query(
        `update canteen_menu_sources
            set sync_claim_token = $2,
                sync_claim_expires_at = now() + interval '1 minute'
          where id = $1`,
        [first.sourceId, runId],
      );
      await claimant.query(
        `insert into canteen_menu_sync_runs (id, menu_source_id)
         values ($1, $2)`,
        [runId, first.sourceId],
      );
      await claimant.query("commit");

      await expect(sync).resolves.toMatchObject({
        disposition: "continue",
        sourceId: second.sourceId,
      });
    } finally {
      await claimant.query("rollback").catch(() => undefined);
      await Promise.all([claimant.end(), observer.end()]);
    }
  });

  it("returns retry-later while the only due source has an active claim", async () => {
    const { sourceId, currentWindow } =
      await createEligibleSource("正在同步的来源");
    const runId = randomUUID();
    await db
      .update(canteenMenuSources)
      .set({
        syncClaimToken: runId,
        syncClaimExpiresAt: new Date(Date.now() + 60_000),
      })
      .where(eq(canteenMenuSources.id, sourceId));
    await db.insert(canteenMenuSyncRuns).values({
      id: runId,
      menuSourceId: sourceId,
    });

    await expect(syncNextDueMenuSource()).resolves.toMatchObject({
      disposition: "retry-later",
      window: currentWindow.key,
      sourceId,
      code: "MENU_SYNC_ALREADY_RUNNING",
    });
    expect(fetchMenuFromProvider).not.toHaveBeenCalled();
  });

  it("supersedes an expired claim before retrying the source", async () => {
    const { sourceId } = await createEligibleSource("过期同步来源");
    const expiredRunId = randomUUID();
    await db
      .update(canteenMenuSources)
      .set({
        syncClaimToken: expiredRunId,
        syncClaimExpiresAt: new Date(Date.now() - 60_000),
      })
      .where(eq(canteenMenuSources.id, sourceId));
    await db.insert(canteenMenuSyncRuns).values({
      id: expiredRunId,
      menuSourceId: sourceId,
      startedAt: new Date(Date.now() - 3 * 60_000),
    });
    fetchMenuFromProvider.mockResolvedValue(
      buildPinmeMenuSyncPayload(pinmeCurrent),
    );

    await expect(syncNextDueMenuSource()).resolves.toMatchObject({
      disposition: "continue",
      sourceId,
      result: { status: "applied" },
    });
    const [expiredRun] = await db
      .select({
        status: canteenMenuSyncRuns.status,
        errorCode: canteenMenuSyncRuns.errorCode,
      })
      .from(canteenMenuSyncRuns)
      .where(eq(canteenMenuSyncRuns.id, expiredRunId));
    expect(expiredRun).toEqual({
      status: "failed",
      errorCode: "MENU_SYNC_SUPERSEDED",
    });
  });

  it("backs off transient failures and stops after three window attempts", async () => {
    const { sourceId, currentWindow } =
      await createEligibleSource("暂时失败的来源");
    const insertFailure = async () => {
      const completedAt = await currentTestDatabaseNow();
      await db.insert(canteenMenuSyncRuns).values({
        id: randomUUID(),
        menuSourceId: sourceId,
        status: "failed",
        errorCode: "PROVIDER_UNAVAILABLE",
        error: "PROVIDER_UNAVAILABLE",
        startedAt: completedAt,
        completedAt,
      });
    };
    await insertFailure();

    await expect(syncNextDueMenuSource()).resolves.toMatchObject({
      disposition: "retry-later",
      window: currentWindow.key,
      sourceId,
      code: "PROVIDER_UNAVAILABLE",
    });

    await insertFailure();
    await insertFailure();

    await expect(syncNextDueMenuSource()).resolves.toMatchObject({
      disposition: "stop-for-review",
      window: currentWindow.key,
      sourceId,
      code: "MENU_SYNC_RETRY_LIMIT",
    });
    expect(fetchMenuFromProvider).not.toHaveBeenCalled();
  });

  it("syncs an untouched source before retrying an earlier failed source", async () => {
    const databaseNow = new Date("2099-08-20T06:37:00.000Z");
    const retrying = await createEligibleSource("等待重试的来源");
    const untouched = await createEligibleSource("尚未尝试的来源");
    await db
      .update(canteenMenuSources)
      .set({ createdAt: new Date(Date.now() - 60_000) })
      .where(eq(canteenMenuSources.id, retrying.sourceId));
    const completedAt = new Date(databaseNow.getTime() - 3 * 60_000);
    await db.insert(canteenMenuSyncRuns).values({
      id: randomUUID(),
      menuSourceId: retrying.sourceId,
      status: "failed",
      errorCode: "EMPTY_PINME_MENU",
      error: "EMPTY_PINME_MENU",
      startedAt: completedAt,
      completedAt,
    });
    readMenuSyncDatabaseNow.mockResolvedValue(databaseNow);
    fetchMenuFromProvider.mockResolvedValue(
      buildPinmeMenuSyncPayload(pinmeCurrent),
    );

    await expect(syncNextDueMenuSource()).resolves.toMatchObject({
      disposition: "continue",
      sourceId: untouched.sourceId,
      result: { status: "applied" },
    });
  });

  it("does not claim Cafe Tolo before its Monday opening window", async () => {
    const mondayBreakfast = new Date("2026-08-24T00:00:00.000Z");
    const closed = await createEligibleSource("Cafe Tolo", {
      closedWeekdays: [0],
      externalStoreId: "4899",
      syncMealPeriods: ["lunch", "dinner"],
    });
    readMenuSyncDatabaseNow.mockResolvedValue(mondayBreakfast);

    await expect(syncNextDueMenuSource()).resolves.toEqual({
      disposition: "no-work",
      window: "2026-08-24/breakfast",
    });
    const closedRuns = await db
      .select({ id: canteenMenuSyncRuns.id })
      .from(canteenMenuSyncRuns)
      .where(eq(canteenMenuSyncRuns.menuSourceId, closed.sourceId));
    expect(closedRuns).toEqual([]);
  });

  it("does not let a 03:05 diagnostic run satisfy the breakfast window (#743)", async () => {
    const earlyBreakfast = new Date("2099-08-19T19:05:00.000Z");
    const scheduledBreakfast = new Date("2099-08-20T00:17:00.000Z");
    const { sourceId } = await createEligibleSource("早餐观察窗口来源");
    fetchMenuFromProvider.mockResolvedValue(
      buildPinmeMenuSyncPayload(pinmeCurrent),
    );
    readMenuSyncDatabaseNow.mockResolvedValue(earlyBreakfast);

    await expect(syncNextDueMenuSource()).resolves.toEqual({
      disposition: "no-work",
      window: "2099-08-20/breakfast",
    });
    await expect(
      db
        .select({ id: canteenMenuSyncRuns.id })
        .from(canteenMenuSyncRuns)
        .where(eq(canteenMenuSyncRuns.menuSourceId, sourceId)),
    ).resolves.toEqual([]);
    await db.insert(canteenMenuSyncRuns).values({
      id: randomUUID(),
      menuSourceId: sourceId,
      status: "unchanged",
      startedAt: earlyBreakfast,
      completedAt: earlyBreakfast,
    });

    readMenuSyncDatabaseNow.mockResolvedValue(scheduledBreakfast);
    await expect(syncNextDueMenuSource()).resolves.toMatchObject({
      disposition: "continue",
      sourceId,
      result: { status: "applied" },
    });
    expect(fetchMenuFromProvider).toHaveBeenCalledOnce();
  });

  it("reobserves lunch when PINME changes from noon to afternoon publication (#743)", async () => {
    const noonAt = new Date("2099-08-20T06:17:00.000Z"); // 14:17 HKT
    const beforeBoundary = new Date("2099-08-20T06:29:00.000Z");
    const afternoonAt = new Date("2099-08-20T06:47:00.000Z");
    const { sourceId } = await createEligibleSource("发布窗口切换来源", {
      syncMealPeriods: ["lunch"],
    });
    const providerPayload = (
      publicationId: string,
      startTime: string,
      endTime: string,
      products: Array<{ product_id: string; local_name: string }>,
    ) =>
      buildPinmeMenuSyncPayload({
        code: 200,
        data: {
          menu_group: [
            {
              menu_id: publicationId,
              start_time: startTime,
              end_time: endTime,
              groups: ["101"],
            },
          ],
          group: [
            {
              group_id: "101",
              local_name: publicationId,
              start_time: startTime,
              end_time: endTime,
              products: products.map((product) => ({
                ...product,
                status: "1",
                price: 20,
              })),
            },
          ],
        },
      });
    const noon = providerPayload(
      "5150",
      "11:00",
      "14:30",
      Array.from({ length: 61 }, (_, index) => ({
        product_id: `product-${index}`,
        local_name: `午餐菜品 ${index}`,
      })),
    );
    const afternoon = providerPayload("5151", "14:30", "17:00", [
      ...Array.from({ length: 19 }, (_, index) => ({
        product_id: `product-${index}`,
        local_name: `午餐菜品 ${index}`,
      })),
      ...Array.from({ length: 20 }, (_, index) => ({
        product_id: `afternoon-${index}`,
        local_name: `下午茶菜品 ${index}`,
      })),
    ]);
    fetchMenuFromProvider
      .mockImplementationOnce(async (_source, context) => ({
        ...noon,
        observationScope: {
          kind: "meal-period" as const,
          mealPeriod: context.mealPeriod,
        },
      }))
      .mockImplementationOnce(async (_source, context) => ({
        ...afternoon,
        observationScope: {
          kind: "meal-period" as const,
          mealPeriod: context.mealPeriod,
        },
      }));

    readMenuSyncDatabaseNow.mockResolvedValue(noonAt);
    await expect(syncNextDueMenuSource()).resolves.toMatchObject({
      disposition: "continue",
      sourceId,
      result: { status: "applied", itemCount: 61 },
    });
    const [sharedAtNoon] = await db
      .select({ id: canteenMenuItems.id })
      .from(canteenMenuItems)
      .where(
        and(
          eq(canteenMenuItems.menuSourceId, sourceId),
          eq(canteenMenuItems.externalProductId, "product-0"),
        ),
      );

    readMenuSyncDatabaseNow.mockResolvedValue(beforeBoundary);
    await expect(syncNextDueMenuSource()).resolves.toEqual({
      disposition: "no-work",
      window: "2099-08-20/lunch",
    });

    readMenuSyncDatabaseNow.mockResolvedValue(afternoonAt);
    await expect(syncNextDueMenuSource()).resolves.toMatchObject({
      disposition: "continue",
      sourceId,
      result: { status: "applied", itemCount: 39 },
    });

    const [items, runs, snapshots] = await Promise.all([
      db
        .select({
          id: canteenMenuItems.id,
          externalProductId: canteenMenuItems.externalProductId,
          isAvailable: canteenMenuItems.isAvailable,
          mealPeriods: canteenMenuItems.mealPeriods,
        })
        .from(canteenMenuItems)
        .where(eq(canteenMenuItems.menuSourceId, sourceId)),
      db
        .select({
          status: canteenMenuSyncRuns.status,
          itemCount: canteenMenuSyncRuns.itemCount,
          deactivatedCount: canteenMenuSyncRuns.deactivatedCount,
          errorCode: canteenMenuSyncRuns.errorCode,
        })
        .from(canteenMenuSyncRuns)
        .where(eq(canteenMenuSyncRuns.menuSourceId, sourceId)),
      db
        .select({
          itemCount: canteenMenuSyncSnapshots.itemCount,
          syncWindowKey: canteenMenuSyncSnapshots.syncWindowKey,
          scopeEvidence: canteenMenuSyncSnapshots.scopeEvidence,
        })
        .from(canteenMenuSyncSnapshots)
        .where(eq(canteenMenuSyncSnapshots.menuSourceId, sourceId)),
    ]);
    const activeLunch = items.filter(
      (item) => item.isAvailable && item.mealPeriods.includes("lunch"),
    );
    expect(activeLunch.map((item) => item.externalProductId).sort()).toEqual(
      afternoon.items.map((item) => item.externalProductId).sort(),
    );
    expect(
      items.find((item) => item.externalProductId === "product-0")?.id,
    ).toBe(sharedAtNoon.id);
    expect(
      items.filter(
        (item) =>
          item.externalProductId?.startsWith("product-") && !item.isAvailable,
      ),
    ).toHaveLength(42);
    expect(runs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          status: "applied",
          itemCount: 39,
          deactivatedCount: 42,
          errorCode: null,
        }),
      ]),
    );
    expect(snapshots).toHaveLength(2);
    expect(snapshots.map((snapshot) => snapshot.itemCount).sort()).toEqual([
      39, 61,
    ]);
    expect(
      new Set(snapshots.map((snapshot) => snapshot.syncWindowKey)),
    ).toEqual(new Set(["2099-08-20/lunch"]));
    expect(
      new Set(
        snapshots.map((snapshot) => snapshot.scopeEvidence.publicationKey),
      ).size,
    ).toBe(2);
  });

  it("keeps Cafe Tolo out of the 2026-08-22 breakfast drain while leaving seven sources claimable", async () => {
    const incidentBreakfast = new Date("2026-08-22T00:00:00.000Z");
    const cafeTolo = await createEligibleSource("Cafe Tolo", {
      closedWeekdays: [0],
      externalStoreId: "4899",
      syncMealPeriods: ["lunch", "dinner"],
    });
    const otherSources = await Promise.all(
      Array.from({ length: 7 }, (_, index) =>
        createEligibleSource(`其他来源 ${index + 1}`),
      ),
    );
    const candidates = await db.transaction((tx) =>
      listMenuSourceScheduleCandidates(
        tx,
        menuSyncWindowAt(incidentBreakfast),
        incidentBreakfast,
      ),
    );

    expect(candidates.map((candidate) => candidate.sourceId)).toEqual(
      expect.arrayContaining(otherSources.map((source) => source.sourceId)),
    );
    expect(candidates).toHaveLength(7);
    expect(candidates.map((candidate) => candidate.sourceId)).not.toContain(
      cafeTolo.sourceId,
    );
  });

  it("does not claim Cafe Tolo on Sunday", async () => {
    const sundayLunch = new Date("2026-08-23T04:00:00.000Z");
    const closed = await createEligibleSource("Cafe Tolo", {
      closedWeekdays: [0],
      externalStoreId: "4899",
      syncMealPeriods: ["lunch", "dinner"],
    });
    readMenuSyncDatabaseNow.mockResolvedValue(sundayLunch);

    await expect(syncNextDueMenuSource()).resolves.toEqual({
      disposition: "no-work",
      window: "2026-08-23/lunch",
    });
    const closedRuns = await db
      .select({ id: canteenMenuSyncRuns.id })
      .from(canteenMenuSyncRuns)
      .where(eq(canteenMenuSyncRuns.menuSourceId, closed.sourceId));
    expect(closedRuns).toEqual([]);
  });

  it.each([
    ["lunch", "2099-08-22T04:00:00.000Z"],
    ["dinner", "2099-08-22T10:00:00.000Z"],
  ])("claims Cafe Tolo during its Saturday %s window", async (_, timestamp) => {
    const saturdayServiceWindow = new Date(timestamp);
    const { sourceId } = await createEligibleSource("Cafe Tolo", {
      closedWeekdays: [0],
      externalStoreId: "4899",
      syncMealPeriods: ["lunch", "dinner"],
    });
    readMenuSyncDatabaseNow.mockResolvedValue(saturdayServiceWindow);
    fetchMenuFromProvider.mockResolvedValue(
      buildPinmeMenuSyncPayload(pinmeCurrent),
    );

    await expect(syncNextDueMenuSource()).resolves.toMatchObject({
      disposition: "continue",
      sourceId,
      result: { status: "applied" },
    });
  });

  it("records an unexpected empty PinMe menu as a failed run without a snapshot", async () => {
    const databaseNow = new Date("2099-08-21T06:37:00.000Z");
    const { sourceId } = await createEligibleSource("意外空菜单来源");
    readMenuSyncDatabaseNow.mockResolvedValue(databaseNow);
    fetchMenuFromProvider.mockRejectedValue(new Error("EMPTY_PINME_MENU"));

    await expect(syncNextDueMenuSource()).resolves.toMatchObject({
      disposition: "retry-later",
      sourceId,
      code: "EMPTY_PINME_MENU",
      result: { status: "provider-failure", code: "EMPTY_PINME_MENU" },
    });

    const [runs, snapshots] = await Promise.all([
      db
        .select({
          status: canteenMenuSyncRuns.status,
          errorCode: canteenMenuSyncRuns.errorCode,
        })
        .from(canteenMenuSyncRuns)
        .where(eq(canteenMenuSyncRuns.menuSourceId, sourceId)),
      db
        .select({ runId: canteenMenuSyncSnapshots.runId })
        .from(canteenMenuSyncSnapshots)
        .where(eq(canteenMenuSyncSnapshots.menuSourceId, sourceId)),
    ]);
    expect(runs).toEqual([{ status: "failed", errorCode: "EMPTY_PINME_MENU" }]);
    expect(snapshots).toEqual([]);
  });

  it("returns stop-for-review immediately when the third transient attempt fails", async () => {
    const databaseNow = new Date("2099-08-20T06:37:00.000Z");
    const { sourceId } = await createEligibleSource("第三次失败的来源");
    const completedAt = new Date(databaseNow.getTime() - 6 * 60_000);
    await db.insert(canteenMenuSyncRuns).values(
      Array.from({ length: 2 }, (_, index) => ({
        id: randomUUID(),
        menuSourceId: sourceId,
        status: "failed" as const,
        errorCode: "PROVIDER_UNAVAILABLE",
        error: "PROVIDER_UNAVAILABLE",
        startedAt: new Date(completedAt.getTime() - index * 1_000),
        completedAt,
      })),
    );
    readMenuSyncDatabaseNow.mockResolvedValue(databaseNow);
    fetchMenuFromProvider.mockRejectedValue(new Error("PROVIDER_UNAVAILABLE"));

    await expect(syncNextDueMenuSource()).resolves.toMatchObject({
      disposition: "stop-for-review",
      sourceId,
      code: "MENU_SYNC_RETRY_LIMIT",
      result: { status: "provider-failure" },
    });
  });

  it.each([
    "2099-08-20T02:59:59.999Z",
    "2099-08-20T03:00:00.000Z",
    "2099-08-20T08:59:59.999Z",
    "2099-08-20T09:00:00.000Z",
    "2099-08-20T06:37:00.000Z",
  ])(
    "claims through the database-clock path at fixed or delayed time %s",
    async (value) => {
      const { sourceId } = await createEligibleSource("固定数据库时间来源");
      const databaseNow = new Date(value);
      const window = menuSyncWindowAt(databaseNow);
      readMenuSyncDatabaseNow.mockImplementation(
        async (tx: MenuSyncTransaction) => {
          const result = await tx.execute<{ database_now: string | Date }>(
            sql`select ${databaseNow}::timestamptz as database_now`,
          );
          return new Date(String(result.rows[0]?.database_now));
        },
      );
      fetchMenuFromProvider.mockResolvedValue(
        buildPinmeMenuSyncPayload(pinmeCurrent),
      );

      await expect(syncNextDueMenuSource()).resolves.toMatchObject({
        disposition: "continue",
        window: window.key,
        sourceId,
        result: { status: "applied" },
      });
      expect(fetchMenuFromProvider).toHaveBeenCalledWith(expect.any(Object), {
        observedAt: databaseNow,
        syncWindowKey: window.key,
        mealPeriod: window.period,
      });
      const [run] = await db
        .select({
          status: canteenMenuSyncRuns.status,
          startedAt: canteenMenuSyncRuns.startedAt,
        })
        .from(canteenMenuSyncRuns)
        .where(eq(canteenMenuSyncRuns.menuSourceId, sourceId));
      expect(run?.status).toBe("applied");
      expect(run?.startedAt.getTime()).toBeGreaterThanOrEqual(
        window.startsAt.getTime(),
      );
      expect(run?.startedAt.getTime()).toBeLessThan(window.endsAt.getTime());
      await expect(syncNextDueMenuSource()).resolves.toEqual({
        disposition: "no-work",
        window: window.key,
      });
      expect(fetchMenuFromProvider).toHaveBeenCalledTimes(1);
    },
  );

  it("returns no-work to the minute-37 fallback after a healthy primary drain", async () => {
    let databaseNow = new Date("2099-08-20T03:17:00.000Z");
    readMenuSyncDatabaseNow.mockImplementation(async () => databaseNow);
    const { sourceId } = await createEligibleSource("主窗口已完成来源");
    fetchMenuFromProvider.mockResolvedValue(
      buildPinmeMenuSyncPayload(pinmeCurrent),
    );

    await expect(syncNextDueMenuSource()).resolves.toMatchObject({
      disposition: "continue",
      sourceId,
      result: { status: "applied" },
    });

    databaseNow = new Date("2099-08-20T03:37:00.000Z");
    await expect(syncNextDueMenuSource()).resolves.toEqual({
      disposition: "no-work",
      window: "2099-08-20/lunch",
    });
    expect(fetchMenuFromProvider).toHaveBeenCalledTimes(1);
  });

  it("lets the minute-37 fallback drain a source left incomplete by primary", async () => {
    let databaseNow = new Date("2099-08-20T03:17:00.000Z");
    readMenuSyncDatabaseNow.mockImplementation(async () => databaseNow);
    const first = await createEligibleSource("主窗口来源甲");
    const second = await createEligibleSource("主窗口来源乙");
    fetchMenuFromProvider.mockResolvedValue(
      buildPinmeMenuSyncPayload(pinmeCurrent),
    );

    const primaryResult = await syncNextDueMenuSource();
    expect(primaryResult).toMatchObject({
      disposition: "continue",
      result: { status: "applied" },
    });

    databaseNow = new Date("2099-08-20T03:37:00.000Z");
    const fallbackResult = await syncNextDueMenuSource();
    expect(fallbackResult).toMatchObject({
      disposition: "continue",
      result: { status: "applied" },
    });
    expect(
      new Set(
        [primaryResult, fallbackResult].flatMap((result) =>
          "sourceId" in result ? [result.sourceId] : [],
        ),
      ),
    ).toEqual(new Set([first.sourceId, second.sourceId]));
    await expect(syncNextDueMenuSource()).resolves.toEqual({
      disposition: "no-work",
      window: "2099-08-20/lunch",
    });
    expect(fetchMenuFromProvider).toHaveBeenCalledTimes(2);
  });

  it.each([
    { failures: 1, minutesAgo: 3 },
    { failures: 2, minutesAgo: 6 },
  ])(
    "retries after the bounded backoff for $failures failure(s)",
    async ({ failures, minutesAgo }) => {
      const databaseNow = new Date("2099-08-20T03:17:00.000Z");
      readMenuSyncDatabaseNow.mockImplementation(async () => databaseNow);
      const { sourceId } = await createEligibleSource("退避完成的来源");
      const completedAt = new Date(databaseNow.getTime() - minutesAgo * 60_000);
      await db.insert(canteenMenuSyncRuns).values(
        Array.from({ length: failures }, (_, index) => ({
          id: randomUUID(),
          menuSourceId: sourceId,
          status: "failed" as const,
          errorCode: "PROVIDER_UNAVAILABLE",
          error: "PROVIDER_UNAVAILABLE",
          startedAt: new Date(completedAt.getTime() - index * 1_000),
          completedAt,
        })),
      );
      fetchMenuFromProvider.mockResolvedValue(
        buildPinmeMenuSyncPayload(pinmeCurrent),
      );

      await expect(
        db.transaction((tx) =>
          listMenuSourceScheduleCandidates(
            tx,
            menuSyncWindowAt(databaseNow),
            databaseNow,
          ),
        ),
      ).resolves.toContainEqual({
        state: "claimable",
        sourceId,
        attemptNumber: failures + 1,
      });

      await expect(syncNextDueMenuSource()).resolves.toMatchObject({
        disposition: "continue",
        sourceId,
        result: { status: "applied" },
      });
    },
  );

  it("does not count superseded runs toward retry policy", async () => {
    const { sourceId } = await createEligibleSource("被旧 worker 接管的来源");
    const databaseNow = await currentTestDatabaseNow();
    const providerFailureAt = new Date(databaseNow.getTime() - 4 * 60_000);
    await db.insert(canteenMenuSyncRuns).values([
      {
        id: randomUUID(),
        menuSourceId: sourceId,
        status: "failed",
        errorCode: "PROVIDER_UNAVAILABLE",
        error: "PROVIDER_UNAVAILABLE",
        startedAt: providerFailureAt,
        completedAt: providerFailureAt,
      },
      ...Array.from({ length: 3 }, () => ({
        id: randomUUID(),
        menuSourceId: sourceId,
        status: "failed" as const,
        errorCode: "MENU_SYNC_SUPERSEDED",
        error: "MENU_SYNC_SUPERSEDED",
        startedAt: databaseNow,
        completedAt: databaseNow,
      })),
    ]);
    fetchMenuFromProvider.mockResolvedValue(
      buildPinmeMenuSyncPayload(pinmeCurrent),
    );

    await expect(
      db.transaction((tx) =>
        listMenuSourceScheduleCandidates(
          tx,
          menuSyncWindowAt(databaseNow),
          databaseNow,
        ),
      ),
    ).resolves.toContainEqual({
      state: "claimable",
      sourceId,
      attemptNumber: 2,
    });

    await expect(syncNextDueMenuSource()).resolves.toMatchObject({
      disposition: "continue",
      sourceId,
      result: { status: "applied" },
    });
  });

  it("keeps scheduled run history within the existing retention bound", async () => {
    const { sourceId } = await createEligibleSource("需要清理历史的来源");
    const oldRunId = randomUUID();
    await db.insert(canteenMenuSyncRuns).values({
      id: oldRunId,
      menuSourceId: sourceId,
      status: "failed",
      errorCode: "PROVIDER_UNAVAILABLE",
      error: "PROVIDER_UNAVAILABLE",
      startedAt: sql`now() - interval '31 days'`,
      completedAt: sql`now() - interval '31 days'`,
    });
    fetchMenuFromProvider.mockResolvedValue(
      buildPinmeMenuSyncPayload(pinmeCurrent),
    );

    await expect(syncNextDueMenuSource()).resolves.toMatchObject({
      disposition: "continue",
      sourceId,
    });
    const retained = await db
      .select({ id: canteenMenuSyncRuns.id })
      .from(canteenMenuSyncRuns)
      .where(eq(canteenMenuSyncRuns.id, oldRunId));
    expect(retained).toEqual([]);
  });

  it.each(["MENU_SYNC_SUSPICIOUS_DROP", "INVALID_PINME_STORE_ID"])(
    "does not hot-loop a source with %s",
    async (failureCode) => {
      const { sourceId, currentWindow } =
        await createEligibleSource("需要人工检查的来源");
      const databaseNow = await currentTestDatabaseNow();
      await db.insert(canteenMenuSyncRuns).values({
        id: randomUUID(),
        menuSourceId: sourceId,
        status: "failed",
        errorCode: failureCode,
        error: failureCode,
        startedAt: databaseNow,
        completedAt: databaseNow,
      });

      await expect(syncNextDueMenuSource()).resolves.toMatchObject({
        disposition: "stop-for-review",
        window: currentWindow.key,
        sourceId,
        code: failureCode,
      });
      expect(fetchMenuFromProvider).not.toHaveBeenCalled();

      const runs = await db
        .select({ id: canteenMenuSyncRuns.id })
        .from(canteenMenuSyncRuns)
        .where(
          and(
            eq(canteenMenuSyncRuns.menuSourceId, sourceId),
            eq(canteenMenuSyncRuns.status, "running"),
          ),
        );
      expect(runs).toEqual([]);
    },
  );

  it("immediately stops for review when a fresh fetch finds invalid configuration", async () => {
    const { sourceId } = await createEligibleSource("配置失效的来源");
    fetchMenuFromProvider.mockRejectedValue(
      new Error("INVALID_PINME_STORE_ID"),
    );

    await expect(syncNextDueMenuSource()).resolves.toMatchObject({
      disposition: "stop-for-review",
      sourceId,
      code: "INVALID_PINME_STORE_ID",
      result: { status: "provider-failure" },
    });
  });

  it("does not repeat a terminal run when the original response was lost", async () => {
    const { sourceId, currentWindow } =
      await createEligibleSource("响应丢失的来源");
    await db.insert(canteenMenuSyncRuns).values({
      id: randomUUID(),
      menuSourceId: sourceId,
      status: "unchanged",
      startedAt: currentWindow.claimsStartAt,
      completedAt: await currentTestDatabaseNow(),
    });

    await expect(syncNextDueMenuSource()).resolves.toEqual({
      disposition: "no-work",
      window: currentWindow.key,
    });
    expect(fetchMenuFromProvider).not.toHaveBeenCalled();
  });

  it("does not reclaim a source while terminal finalization commits", async () => {
    const { sourceId, currentWindow } =
      await createEligibleSource("正在提交终态的来源");
    const runId = randomUUID();
    await db
      .update(canteenMenuSources)
      .set({
        lastAttemptId: runId,
        syncClaimToken: runId,
        syncClaimExpiresAt: new Date(Date.now() + 60_000),
      })
      .where(eq(canteenMenuSources.id, sourceId));
    await db.insert(canteenMenuSyncRuns).values({
      id: runId,
      menuSourceId: sourceId,
      startedAt: currentWindow.claimsStartAt,
    });

    const finalizer = new Client({
      connectionString: process.env.DATABASE_URL,
    });
    await finalizer.connect();
    try {
      await finalizer.query("begin");
      await finalizer.query(
        `update canteen_menu_sources
            set sync_claim_token = null,
                sync_claim_expires_at = null,
                last_success_at = now()
          where id = $1`,
        [sourceId],
      );
      await finalizer.query(
        `update canteen_menu_sync_runs
            set status = 'unchanged', completed_at = now()
          where id = $1`,
        [runId],
      );

      await expect(syncNextDueMenuSource()).resolves.toEqual({
        disposition: "no-work",
        window: currentWindow.key,
      });
      await finalizer.query("commit");

      await expect(syncNextDueMenuSource()).resolves.toEqual({
        disposition: "no-work",
        window: currentWindow.key,
      });
    } finally {
      await finalizer.query("rollback").catch(() => undefined);
      await finalizer.end();
    }
    expect(fetchMenuFromProvider).not.toHaveBeenCalled();
  });

  it("preserves the last successful menu when the scheduled fetch fails", async () => {
    const { canteenId, sourceId } =
      await createEligibleSource("保留上次成功菜单的来源");
    const lastSuccessAt = new Date(Date.now() - 24 * 60 * 60_000);
    await db
      .update(canteenMenuSources)
      .set({ lastSuccessAt, observedState: "available" })
      .where(eq(canteenMenuSources.id, sourceId));
    const itemId = randomUUID();
    await db.insert(canteenMenuItems).values({
      id: itemId,
      canteenId,
      menuSourceId: sourceId,
      externalProductId: "last-success-item",
      name: "上次成功的菜",
      isAvailable: true,
    });
    fetchMenuFromProvider.mockRejectedValue(new Error("PROVIDER_UNAVAILABLE"));

    await expect(syncNextDueMenuSource()).resolves.toMatchObject({
      disposition: "retry-later",
      sourceId,
      code: "PROVIDER_UNAVAILABLE",
    });

    const [source] = await db
      .select({ lastSuccessAt: canteenMenuSources.lastSuccessAt })
      .from(canteenMenuSources)
      .where(eq(canteenMenuSources.id, sourceId));
    const [item] = await db
      .select({ isAvailable: canteenMenuItems.isAvailable })
      .from(canteenMenuItems)
      .where(eq(canteenMenuItems.id, itemId));
    expect(source?.lastSuccessAt).toEqual(lastSuccessAt);
    expect(item).toEqual({ isAvailable: true });
  });
});
