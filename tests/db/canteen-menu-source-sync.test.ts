import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { and, count, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  canteenDishComments,
  canteenDishVotes,
  canteenMenuItems,
  canteenMenuSources,
  canteenMenuSyncRuns,
  canteens,
  users,
} from "@/db/schema";
import pinmeCurrent from "../lib/fixtures/canteen-providers/pinme-current.json";
import { buildPinmeMenuSyncPayload } from "@/lib/canteen-pinme-menu";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { syncCanteenMenuSource } from "@/lib/canteen-menu-source-sync";
import { previewMenuSync } from "@/lib/canteen-menu-sync-store";

const hasDb = Boolean(process.env.DATABASE_URL);

function stubPinmeFetch(menuPayload: unknown): void {
  vi.stubGlobal(
    "fetch",
    vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ code: 200, data: { token: "temporary" } }),
        ),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify(menuPayload))),
  );
}

describe.skipIf(!hasDb)("scheduled canteen menu source sync", () => {
  let canteenId: string;
  let sourceId: string;
  let userId: string;

  beforeEach(async () => {
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
    vi.unstubAllGlobals();
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

  it("retains fetched snapshot diagnostics when a sync is superseded", async () => {
    let releaseFirstMenu!: (response: Response) => void;
    let markFirstMenuRequested!: () => void;
    const firstMenuRequested = new Promise<void>((resolve) => {
      markFirstMenuRequested = resolve;
    });
    const firstMenuResponse = new Promise<Response>((resolve) => {
      releaseFirstMenu = resolve;
    });
    const tokenResponse = () =>
      new Response(JSON.stringify({ code: 200, data: { token: "temporary" } }));
    const menuResponse = () => new Response(JSON.stringify(pinmeCurrent));
    vi.stubGlobal(
      "fetch",
      vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(tokenResponse())
        .mockImplementationOnce(async () => {
          markFirstMenuRequested();
          return firstMenuResponse;
        })
        .mockResolvedValueOnce(tokenResponse())
        .mockResolvedValueOnce(menuResponse()),
    );

    const supersededSync = syncCanteenMenuSource(sourceId);
    await firstMenuRequested;
    await expect(syncCanteenMenuSource(sourceId)).resolves.toMatchObject({
      status: "applied",
    });
    releaseFirstMenu(menuResponse());
    await expect(supersededSync).resolves.toMatchObject({
      status: "failed",
      error: "MENU_SYNC_SUPERSEDED",
    });

    const [failedRun] = await db
      .select({
        snapshotHash: canteenMenuSyncRuns.snapshotHash,
        itemCount: canteenMenuSyncRuns.itemCount,
      })
      .from(canteenMenuSyncRuns)
      .where(
        and(
          eq(canteenMenuSyncRuns.menuSourceId, sourceId),
          eq(canteenMenuSyncRuns.status, "failed"),
        ),
      )
      .orderBy(desc(canteenMenuSyncRuns.startedAt))
      .limit(1);
    expect(failedRun).toEqual({
      snapshotHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      itemCount: 1,
    });
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
      status: "failed",
      error: expect.stringContaining("DUPLICATE_IDENTITY"),
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
      status: "failed",
      error: "MENU_SYNC_IDENTITY_CHURN",
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
