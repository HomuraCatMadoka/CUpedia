import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq, inArray, sql } from "drizzle-orm";
import { Client } from "pg";
import { db } from "@/db";
import {
  canteenMenuItems,
  canteenMenuSources,
  canteenMenuSyncRuns,
  canteens,
} from "@/db/schema";
import { buildPinmeMenuSyncPayload } from "@/lib/canteen-pinme-menu";
import { menuSyncWindowAt } from "@/lib/canteen-menu-sync-window";
import pinmeCurrent from "../lib/fixtures/canteen-providers/pinme-current.json";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const { fetchMenuFromProvider } = vi.hoisted(() => ({
  fetchMenuFromProvider: vi.fn(),
}));

vi.mock("@/lib/canteen-menu-source-adapters", () => ({
  fetchMenuFromProvider,
}));

import {
  claimNextDueMenuSourceAtForTests,
  syncNextDueMenuSource,
} from "@/lib/canteen-menu-source-sync";

const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)("scheduled due menu source sync", () => {
  const canteenIds: string[] = [];
  const previouslyEnabledSourceIds: string[] = [];

  beforeEach(async () => {
    fetchMenuFromProvider.mockReset();
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

  async function currentDatabaseWindow() {
    const result = await db.execute(sql`select now() as database_now`);
    const databaseNow = new Date(String(result.rows[0]?.database_now));
    if (Number.isNaN(databaseNow.getTime())) {
      throw new Error("DATABASE_NOW_MISSING");
    }
    return menuSyncWindowAt(databaseNow);
  }

  async function createEligibleSource(name: string) {
    const currentWindow = await currentDatabaseWindow();
    const canteenId = randomUUID();
    const sourceId = randomUUID();
    canteenIds.push(canteenId);
    await db.insert(canteens).values({ id: canteenId, name });
    await db.insert(canteenMenuSources).values({
      id: sourceId,
      canteenId,
      provider: "pinme",
      externalStoreId: `scheduler-${sourceId}`,
    });
    return { canteenId, sourceId, currentWindow };
  }

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
      const completedAt = new Date();
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

  it("returns stop-for-review immediately when the third transient attempt fails", async () => {
    const { sourceId } = await createEligibleSource("第三次失败的来源");
    const completedAt = new Date(Date.now() - 6 * 60_000);
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
    fetchMenuFromProvider.mockRejectedValue(new Error("PROVIDER_UNAVAILABLE"));

    await expect(syncNextDueMenuSource()).resolves.toMatchObject({
      disposition: "stop-for-review",
      sourceId,
      code: "MENU_SYNC_RETRY_LIMIT",
      result: { status: "provider-failure" },
    });
  });

  it.each([
    "2026-08-20T02:59:59.999Z",
    "2026-08-20T03:00:00.000Z",
    "2026-08-20T08:59:59.999Z",
    "2026-08-20T09:00:00.000Z",
    "2026-08-20T06:37:00.000Z",
  ])(
    "claims through the database-clock path at fixed or delayed time %s",
    async (value) => {
      const { sourceId } = await createEligibleSource("固定数据库时间来源");
      const databaseNow = new Date(value);
      const window = menuSyncWindowAt(databaseNow);

      await expect(
        claimNextDueMenuSourceAtForTests(databaseNow),
      ).resolves.toEqual({
        status: "claimed",
        window: window.key,
        sourceId,
      });
      const [run] = await db
        .select({ status: canteenMenuSyncRuns.status })
        .from(canteenMenuSyncRuns)
        .where(eq(canteenMenuSyncRuns.menuSourceId, sourceId));
      expect(run).toEqual({ status: "running" });
    },
  );

  it.each([
    { failures: 1, minutesAgo: 3 },
    { failures: 2, minutesAgo: 6 },
  ])(
    "retries after the bounded backoff for $failures failure(s)",
    async ({ failures, minutesAgo }) => {
      const { sourceId } = await createEligibleSource("退避完成的来源");
      const completedAt = new Date(Date.now() - minutesAgo * 60_000);
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

      await expect(syncNextDueMenuSource()).resolves.toMatchObject({
        disposition: "continue",
        sourceId,
        result: { status: "applied" },
      });
    },
  );

  it("does not count superseded runs toward retry policy", async () => {
    const { sourceId } = await createEligibleSource("被旧 worker 接管的来源");
    await db.insert(canteenMenuSyncRuns).values([
      {
        id: randomUUID(),
        menuSourceId: sourceId,
        status: "failed",
        errorCode: "PROVIDER_UNAVAILABLE",
        error: "PROVIDER_UNAVAILABLE",
        startedAt: new Date(Date.now() - 4 * 60_000),
        completedAt: new Date(Date.now() - 4 * 60_000),
      },
      ...Array.from({ length: 3 }, () => ({
        id: randomUUID(),
        menuSourceId: sourceId,
        status: "failed" as const,
        errorCode: "MENU_SYNC_SUPERSEDED",
        error: "MENU_SYNC_SUPERSEDED",
        startedAt: new Date(),
        completedAt: new Date(),
      })),
    ]);
    fetchMenuFromProvider.mockResolvedValue(
      buildPinmeMenuSyncPayload(pinmeCurrent),
    );

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
      await db.insert(canteenMenuSyncRuns).values({
        id: randomUUID(),
        menuSourceId: sourceId,
        status: "failed",
        errorCode: failureCode,
        error: failureCode,
        startedAt: new Date(),
        completedAt: new Date(),
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
      startedAt: currentWindow.startsAt,
      completedAt: new Date(),
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
      startedAt: currentWindow.startsAt,
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
