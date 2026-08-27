import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  canteenMenuItems,
  canteenMenuSources,
  canteenMenuSyncRuns,
  canteenMenuSyncSnapshots,
  canteens,
} from "@/db/schema";

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

import { syncCanteenMenuSource } from "@/lib/canteen-menu-source-sync";

const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)(
  "confirmed empty canteen menu observations #782",
  () => {
    let canteenId: string;
    let sourceId: string;
    let databaseNow: Date;

    beforeEach(async () => {
      canteenId = randomUUID();
      sourceId = randomUUID();
      databaseNow = new Date("2026-08-27T03:20:00.000Z");
      readMenuSyncDatabaseNow.mockImplementation(async () => databaseNow);
      fetchMenuFromProvider.mockReset();
      await db.insert(canteens).values({ id: canteenId, name: "空菜单测试" });
      await db.insert(canteenMenuSources).values({
        id: sourceId,
        canteenId,
        provider: "pinme",
        externalStoreId: "4899",
        syncMealPeriods: ["lunch"],
        enabled: true,
      });
      await db.insert(canteenMenuItems).values({
        canteenId,
        menuSourceId: sourceId,
        externalProductId: "old-lunch",
        name: "旧午餐",
        mealPeriods: ["lunch"],
        isAvailable: true,
      });
    });

    afterEach(async () => {
      await db.delete(canteens).where(eq(canteens.id, canteenId));
    });

    it("keeps the old menu until the same open publication is empty twice", async () => {
      fetchMenuFromProvider.mockImplementation(async (_source, context) => ({
        snapshotCompleteness: "partial",
        observationScope: {
          kind: "meal-period",
          mealPeriod: context.mealPeriod,
        },
        items: [],
        emptyMenuEvidence: {
          kind: "open-publication",
          publicationKey: "publication-lunch",
        },
        scopeEvidence: {
          provider: "pinme",
          menuGroupCount: 1,
          groupCount: 1,
          referencedGroupIds: ["lunch"],
          publicationKey: "publication-lunch",
          serviceWindows: [{ startTime: "11:00", endTime: "14:30" }],
        },
      }));

      await expect(syncCanteenMenuSource(sourceId)).resolves.toMatchObject({
        status: "provider-failure",
        code: "MENU_SYNC_EMPTY_PENDING_CONFIRMATION",
      });
      await expect(
        db
          .select({ isAvailable: canteenMenuItems.isAvailable })
          .from(canteenMenuItems)
          .where(eq(canteenMenuItems.externalProductId, "old-lunch")),
      ).resolves.toEqual([{ isAvailable: true }]);
      await expect(
        db
          .select({ runId: canteenMenuSyncSnapshots.runId })
          .from(canteenMenuSyncSnapshots)
          .where(eq(canteenMenuSyncSnapshots.menuSourceId, sourceId)),
      ).resolves.toEqual([]);

      await db
        .update(canteenMenuSyncRuns)
        .set({
          startedAt: sql`${canteenMenuSyncRuns.startedAt} - interval '20 minutes'`,
        })
        .where(
          and(
            eq(canteenMenuSyncRuns.menuSourceId, sourceId),
            eq(
              canteenMenuSyncRuns.errorCode,
              "MENU_SYNC_EMPTY_PENDING_CONFIRMATION",
            ),
          ),
        );
      await expect(syncCanteenMenuSource(sourceId)).resolves.toMatchObject({
        status: "applied",
        code: "MENU_SYNC_APPLIED",
        itemCount: 0,
      });
      await expect(
        db
          .select({ isAvailable: canteenMenuItems.isAvailable })
          .from(canteenMenuItems)
          .where(eq(canteenMenuItems.externalProductId, "old-lunch")),
      ).resolves.toEqual([{ isAvailable: false }]);
      await expect(
        db
          .select({ itemCount: canteenMenuSyncSnapshots.itemCount })
          .from(canteenMenuSyncSnapshots)
          .where(eq(canteenMenuSyncSnapshots.menuSourceId, sourceId)),
      ).resolves.toEqual([{ itemCount: 0 }]);
      await expect(
        db.query.canteenMenuSources.findFirst({
          where: eq(canteenMenuSources.id, sourceId),
          columns: { lastErrorCode: true },
        }),
      ).resolves.toEqual({ lastErrorCode: null });
    });

    it("starts confirmation over after a successful non-empty observation", async () => {
      const emptyObservation = (
        _source: unknown,
        context: { mealPeriod: string },
      ) => ({
        snapshotCompleteness: "partial" as const,
        observationScope: {
          kind: "meal-period" as const,
          mealPeriod: context.mealPeriod,
        },
        items: [],
        emptyMenuEvidence: {
          kind: "open-publication" as const,
          publicationKey: "publication-lunch",
        },
        scopeEvidence: {
          provider: "pinme" as const,
          menuGroupCount: 1,
          groupCount: 1,
          referencedGroupIds: ["lunch"],
          publicationKey: "publication-lunch",
          serviceWindows: [{ startTime: "11:00", endTime: "14:30" }],
        },
      });
      fetchMenuFromProvider.mockImplementation(emptyObservation);

      await expect(syncCanteenMenuSource(sourceId)).resolves.toMatchObject({
        code: "MENU_SYNC_EMPTY_PENDING_CONFIRMATION",
      });
      await db
        .update(canteenMenuSyncRuns)
        .set({
          startedAt: sql`${canteenMenuSyncRuns.startedAt} - interval '20 minutes'`,
        })
        .where(
          and(
            eq(canteenMenuSyncRuns.menuSourceId, sourceId),
            eq(
              canteenMenuSyncRuns.errorCode,
              "MENU_SYNC_EMPTY_PENDING_CONFIRMATION",
            ),
          ),
        );
      fetchMenuFromProvider.mockImplementationOnce(
        async (_source, context) => ({
          snapshotCompleteness: "partial",
          observationScope: {
            kind: "meal-period",
            mealPeriod: context.mealPeriod,
          },
          items: [
            {
              externalProductId: "current-lunch",
              name: "当前午餐",
              priceOptions: [],
              mealPeriods: [context.mealPeriod],
              sortOrder: 0,
              svgKey: "午餐",
            },
          ],
        }),
      );
      await expect(syncCanteenMenuSource(sourceId)).resolves.toMatchObject({
        status: "applied",
      });

      await expect(syncCanteenMenuSource(sourceId)).resolves.toMatchObject({
        status: "provider-failure",
        code: "MENU_SYNC_EMPTY_PENDING_CONFIRMATION",
      });
      await expect(
        db
          .select({ isAvailable: canteenMenuItems.isAvailable })
          .from(canteenMenuItems)
          .where(eq(canteenMenuItems.externalProductId, "current-lunch")),
      ).resolves.toEqual([{ isAvailable: true }]);
    });

    it("starts confirmation over after any intervening failed observation", async () => {
      const emptyObservation = (
        _source: unknown,
        context: { mealPeriod: string },
      ) => ({
        snapshotCompleteness: "partial" as const,
        observationScope: {
          kind: "meal-period" as const,
          mealPeriod: context.mealPeriod,
        },
        items: [],
        emptyMenuEvidence: {
          kind: "open-publication" as const,
          publicationKey: "publication-lunch",
        },
        scopeEvidence: {
          provider: "pinme" as const,
          menuGroupCount: 1,
          groupCount: 1,
          referencedGroupIds: ["lunch"],
          publicationKey: "publication-lunch",
          serviceWindows: [{ startTime: "11:00", endTime: "14:30" }],
        },
      });
      fetchMenuFromProvider.mockImplementation(emptyObservation);
      await expect(syncCanteenMenuSource(sourceId)).resolves.toMatchObject({
        code: "MENU_SYNC_EMPTY_PENDING_CONFIRMATION",
      });
      await db
        .update(canteenMenuSyncRuns)
        .set({
          startedAt: sql`${canteenMenuSyncRuns.startedAt} - interval '20 minutes'`,
        })
        .where(
          and(
            eq(canteenMenuSyncRuns.menuSourceId, sourceId),
            eq(
              canteenMenuSyncRuns.errorCode,
              "MENU_SYNC_EMPTY_PENDING_CONFIRMATION",
            ),
          ),
        );
      fetchMenuFromProvider.mockRejectedValueOnce(new Error("UPSTREAM_TIMEOUT"));
      await expect(syncCanteenMenuSource(sourceId)).resolves.toMatchObject({
        status: "provider-failure",
        code: "UPSTREAM_TIMEOUT",
      });

      await expect(syncCanteenMenuSource(sourceId)).resolves.toMatchObject({
        status: "provider-failure",
        code: "MENU_SYNC_EMPTY_PENDING_CONFIRMATION",
      });
      await expect(
        db
          .select({ isAvailable: canteenMenuItems.isAvailable })
          .from(canteenMenuItems)
          .where(eq(canteenMenuItems.externalProductId, "old-lunch")),
      ).resolves.toEqual([{ isAvailable: true }]);
    });

    it("confirms a provider-proven empty catalog without provider-specific sync logic", async () => {
      await db
        .update(canteenMenuSources)
        .set({ provider: "ichef" })
        .where(eq(canteenMenuSources.id, sourceId));
      fetchMenuFromProvider.mockResolvedValue({
        snapshotCompleteness: "complete",
        items: [],
        emptyMenuEvidence: {
          kind: "open-publication",
          publicationKey: "catalog-publication",
        },
      });

      await expect(syncCanteenMenuSource(sourceId)).resolves.toMatchObject({
        code: "MENU_SYNC_EMPTY_PENDING_CONFIRMATION",
      });
      await db
        .update(canteenMenuSyncRuns)
        .set({
          startedAt: sql`${canteenMenuSyncRuns.startedAt} - interval '20 minutes'`,
        })
        .where(eq(canteenMenuSyncRuns.menuSourceId, sourceId));
      await expect(syncCanteenMenuSource(sourceId)).resolves.toMatchObject({
        status: "applied",
        itemCount: 0,
      });
      await expect(
        db
          .select({ isAvailable: canteenMenuItems.isAvailable })
          .from(canteenMenuItems)
          .where(eq(canteenMenuItems.externalProductId, "old-lunch")),
      ).resolves.toEqual([{ isAvailable: false }]);
    });
  },
);
