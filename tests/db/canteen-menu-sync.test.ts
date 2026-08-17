import { randomUUID } from "node:crypto";
import { Pool, type PoolClient } from "pg";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { and, count, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  accounts,
  canteenDishComments,
  canteenDishVotes,
  canteenMenuItemPrices,
  canteenMenuItems,
  canteenMenuSources,
  canteens,
  users,
} from "@/db/schema";

const { mockGetSessionVoterUser, mockRequireCommentAuth } = vi.hoisted(() => ({
  mockGetSessionVoterUser: vi.fn(),
  mockRequireCommentAuth: vi.fn(),
}));

vi.mock("@/lib/auth-guard", () => ({
  requireAdmin: vi.fn().mockResolvedValue({ id: "admin" }),
  getSessionVoterUser: (...args: unknown[]) => mockGetSessionVoterUser(...args),
  requireCommentAuth: (...args: unknown[]) => mockRequireCommentAuth(...args),
}));
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
  unstable_cache: (fn: (...args: unknown[]) => unknown) => fn,
}));

import {
  applyMenuSyncFromJson,
  previewMenuSyncFromJson,
} from "@/lib/canteen-admin-actions";
import { getCanteenMenuItems } from "@/lib/canteen-actions";
import { createDishComment } from "@/lib/canteen-comment-actions";
import { upsertDishVote } from "@/lib/canteen-vote-actions";
import {
  auditMenuIdentityTransition,
  applyApprovedMenuIdentityTransition,
  applyPreviewedMenuSync,
  previewMenuSync,
} from "@/lib/canteen-menu-sync-store";
import {
  buildMenuIdentityTransitionAudit,
  fingerprintMenuIdentityTransitionSource,
} from "@/lib/canteen-menu-identity-transition";
import {
  type MenuSnapshotScopeEvidence,
  parseMenuSyncJson,
} from "@/lib/canteen-types";

const hasDb = Boolean(process.env.DATABASE_URL);

const AIGENS_SCOPE_EVIDENCE: MenuSnapshotScopeEvidence = {
  provider: "aigens",
  externalStoreId: "102830",
  storeName: "Sanitized Aigens store",
  menuName: "Sanitized full catalog",
  providerPeriodCodes: ["B", "D", "L", "T"],
  categoryPeriodCodes: ["B", "D", "L", "T"],
  categoryCount: 2,
  groupCount: 3,
};

function parseValidatedAigensSnapshot(input: unknown) {
  return {
    ...parseMenuSyncJson(input),
    scopeEvidence: AIGENS_SCOPE_EVIDENCE,
  };
}

async function waitForBlockedTransaction(
  client: PoolClient,
  blockerPid: number,
): Promise<void> {
  await waitForBlockedTransactionCount(client, blockerPid, 1);
}

async function waitForBlockedTransactionCount(
  client: PoolClient,
  blockerPid: number,
  expectedCount: number,
): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const result = await client.query<{ blockedCount: number }>(
      `select count(*)::int as "blockedCount"
        from pg_stat_activity
        where pid <> $1
          and $1 = any(pg_blocking_pids(pid))
      `,
      [blockerPid],
    );
    if ((result.rows[0]?.blockedCount ?? 0) >= expectedCount) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("EXPECTED_CONCURRENT_MENU_WRITE_TO_BLOCK");
}

describe.skipIf(!hasDb)("canteen menu sync database", () => {
  let canteenId: string;
  let itemId: string;
  let sourceId: string;
  let userId: string;
  let additionalUserIds: string[];

  function transitionSourceConfiguration() {
    return {
      id: sourceId,
      canteenId,
      provider: "aigens",
      externalOwnerId: null,
      externalStoreId: "102830",
      config: {},
      enabled: true,
      legacyTakeoverAt: null,
    } as const;
  }

  function transitionSourceFingerprint() {
    return fingerprintMenuIdentityTransitionSource(
      transitionSourceConfiguration(),
    );
  }

  beforeEach(async () => {
    canteenId = randomUUID();
    itemId = randomUUID();
    sourceId = randomUUID();
    userId = randomUUID();
    additionalUserIds = [];
    mockRequireCommentAuth.mockResolvedValue({
      id: userId,
      nickname: "同步测试",
      hasPassword: true,
    });
    mockGetSessionVoterUser.mockResolvedValue({ id: userId, banned: false });
    await db.insert(users).values({
      id: userId,
      email: `${userId}@test.com`,
      nickname: "同步测试",
      role: "user",
    });
    await db.insert(accounts).values({
      accountId: userId,
      providerId: "credential",
      userId,
      password: "test-password-hash",
    });
    await db.insert(canteens).values({ id: canteenId, name: "演示食堂" });
    await db.insert(canteenMenuSources).values({
      id: sourceId,
      canteenId,
      provider: "aigens",
      externalStoreId: "102830",
    });
    await db.insert(canteenMenuItems).values({
      id: itemId,
      canteenId,
      name: "演示菜品 A",
      mealPeriods: ["lunch"],
      svgKey: "drink",
    });
    await db.insert(canteenDishVotes).values({
      menuItemId: itemId,
      userId,
      vote: "like",
    });
    await db.insert(canteenDishComments).values({
      menuItemId: itemId,
      userId,
      content: "保留这条历史",
    });
  });

  afterEach(async () => {
    await db.delete(canteens).where(eq(canteens.id, canteenId));
    await db
      .delete(users)
      .where(inArray(users.id, [userId, ...additionalUserIds]));
  });

  it("rejects manual Aigens JSON that claims a complete provider snapshot", async () => {
    await expect(
      previewMenuSyncFromJson(canteenId, {
        snapshotCompleteness: "complete",
        items: [
          {
            externalProductId: "product-42",
            name: "演示菜品 A",
            mealPeriods: ["lunch"],
          },
        ],
      }),
    ).rejects.toThrow("MENU_SNAPSHOT_SCOPE_EVIDENCE_REQUIRED");
  });

  it("claims a legacy item and later deactivates it without losing history", async () => {
    await db
      .update(canteenMenuSources)
      .set({ provider: "ichef" })
      .where(eq(canteenMenuSources.id, sourceId));
    const firstSnapshot = {
      snapshotCompleteness: "complete" as const,
      takeOverLegacyItems: true,
      items: [
        {
          externalProductId: "product-42",
          name: "演示菜品 A",
          mealPeriods: ["lunch"],
          svgKey: "drink",
          pricing: { options: [{ amountMinor: 1300, currency: "HKD" }] },
        },
      ],
    };
    const preview = await previewMenuSyncFromJson(canteenId, firstSnapshot);
    expect(preview.plan.actions[0]).toMatchObject({ action: "claim", itemId });
    const { previewToken, ...previewEvaluation } = preview;
    const transactionEvaluation = await applyPreviewedMenuSync(
      sourceId,
      parseMenuSyncJson(firstSnapshot),
      previewToken,
    );
    expect(transactionEvaluation).toEqual(previewEvaluation);

    const [claimed] = await db
      .select()
      .from(canteenMenuItems)
      .where(eq(canteenMenuItems.id, itemId));
    expect(claimed).toMatchObject({
      id: itemId,
      menuSourceId: sourceId,
      externalProductId: "product-42",
      externalSource: null,
      externalKey: null,
      isAvailable: true,
    });
    const [activatedSource] = await db
      .select({ enabled: canteenMenuSources.enabled })
      .from(canteenMenuSources)
      .where(eq(canteenMenuSources.id, sourceId));
    expect(activatedSource.enabled).toBe(true);

    const periodChangedSnapshot = {
      snapshotCompleteness: "complete" as const,
      items: [
        {
          externalProductId: "product-42",
          name: "演示菜品 A",
          mealPeriods: ["dinner"],
          svgKey: "drink",
          pricing: { options: [{ amountMinor: 1300, currency: "HKD" }] },
        },
      ],
    };
    const periodChangedPreview = await previewMenuSyncFromJson(
      canteenId,
      periodChangedSnapshot,
    );
    expect(periodChangedPreview.plan.actions[0]).toMatchObject({
      action: "update",
      itemId,
      externalProductId: "product-42",
    });
    const {
      previewToken: periodChangedToken,
      ...periodChangedPreviewEvaluation
    } = periodChangedPreview;
    const periodChangedTransactionEvaluation = await applyPreviewedMenuSync(
      sourceId,
      parseMenuSyncJson(periodChangedSnapshot),
      periodChangedToken,
    );
    expect(periodChangedTransactionEvaluation).toEqual(
      periodChangedPreviewEvaluation,
    );
    const [periodChanged] = await db
      .select()
      .from(canteenMenuItems)
      .where(eq(canteenMenuItems.id, itemId));
    expect(periodChanged).toMatchObject({
      id: itemId,
      externalProductId: "product-42",
      externalSource: null,
      externalKey: null,
      mealPeriods: ["dinner"],
    });
    const preservedHistory = await Promise.all([
      db
        .select({ value: count() })
        .from(canteenDishVotes)
        .where(eq(canteenDishVotes.menuItemId, itemId)),
      db
        .select({ value: count() })
        .from(canteenDishComments)
        .where(eq(canteenDishComments.menuItemId, itemId)),
    ]);
    expect(preservedHistory.map(([row]) => row.value)).toEqual([1, 1]);

    const secondSnapshot = {
      snapshotCompleteness: "complete" as const,
      items: [
        {
          externalProductId: "product-99",
          name: "演示菜品 B",
          mealPeriods: ["lunch"],
        },
      ],
    };
    const secondPreview = await previewMenuSyncFromJson(
      canteenId,
      secondSnapshot,
    );
    await applyMenuSyncFromJson(
      canteenId,
      secondSnapshot,
      secondPreview.previewToken,
    );

    const [deactivated] = await db
      .select()
      .from(canteenMenuItems)
      .where(eq(canteenMenuItems.id, itemId));
    expect(deactivated.isAvailable).toBe(false);
    const historyCounts = await Promise.all([
      db
        .select({ value: count() })
        .from(canteenDishVotes)
        .where(eq(canteenDishVotes.menuItemId, itemId)),
      db
        .select({ value: count() })
        .from(canteenDishComments)
        .where(eq(canteenDishComments.menuItemId, itemId)),
    ]);
    expect(historyCounts.map(([row]) => row.value)).toEqual([1, 1]);

    const publicMenu = await getCanteenMenuItems(canteenId);
    expect(publicMenu.some((item) => item.id === itemId)).toBe(false);
    expect(publicMenu.some((item) => item.name === "演示菜品 B")).toBe(true);
    await expect(createDishComment(itemId, "停供后新评论")).rejects.toThrow(
      "MENU_ITEM_NOT_FOUND",
    );
  });

  it.each([
    {
      provider: "pinme",
      externalOwnerId: null,
      externalStoreId: "5198",
      historicalId: "425657#period=lunch+dinner",
      currentId: "425657",
      mealPeriods: ["dinner"],
    },
    {
      provider: "ichef",
      externalOwnerId: null,
      externalStoreId: "UQftKWxU",
      historicalId: "item-1#period=breakfast+lunch",
      currentId: "item-1",
      mealPeriods: ["dinner"],
    },
    {
      provider: "qmai",
      externalOwnerId: "221033",
      externalStoreId: "331725",
      historicalId: "goods-1#period=lunch",
      currentId: "goods-1",
      mealPeriods: ["dinner"],
    },
  ] as const)(
    "$provider reactivates a historical identity on its existing UUID",
    async ({
      provider,
      externalOwnerId,
      externalStoreId,
      historicalId,
      currentId,
      mealPeriods,
    }) => {
      await db
        .update(canteenMenuSources)
        .set({
          provider,
          externalOwnerId:
            externalOwnerId === null ? null : `${externalOwnerId}-${sourceId}`,
          externalStoreId: `${externalStoreId}-${sourceId}`,
        })
        .where(eq(canteenMenuSources.id, sourceId));
      await db
        .update(canteenMenuItems)
        .set({
          menuSourceId: sourceId,
          externalProductId: historicalId,
          isAvailable: false,
        })
        .where(eq(canteenMenuItems.id, itemId));

      const snapshot = {
        snapshotCompleteness:
          provider === "pinme" ? ("partial" as const) : ("complete" as const),
        items: [
          {
            externalProductId: currentId,
            name: "重新供應菜品",
            mealPeriods: [...mealPeriods],
            svgKey: "新分類",
            pricing: {
              options: [{ amountMinor: 9900, currency: "HKD" }],
            },
          },
        ],
      };
      const preview = await previewMenuSyncFromJson(canteenId, snapshot);
      expect(preview.plan.actions).toEqual([
        expect.objectContaining({ action: "reactivate", itemId }),
      ]);
      await applyMenuSyncFromJson(canteenId, snapshot, preview.previewToken);

      const [reactivated] = await db
        .select()
        .from(canteenMenuItems)
        .where(eq(canteenMenuItems.id, itemId));
      expect(reactivated).toMatchObject({
        id: itemId,
        externalProductId: currentId,
        name: "重新供應菜品",
        mealPeriods: [...mealPeriods],
        svgKey: "新分類",
        isAvailable: true,
      });
      const prices = await db
        .select({ amountMinor: canteenMenuItemPrices.amountMinor })
        .from(canteenMenuItemPrices)
        .where(eq(canteenMenuItemPrices.menuItemId, itemId));
      expect(prices).toEqual([{ amountMinor: 9900 }]);
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
    },
  );

  it("updates an exact identity without losing its UUID or history", async () => {
    await db
      .update(canteenMenuSources)
      .set({ provider: "ichef" })
      .where(eq(canteenMenuSources.id, sourceId));
    await db
      .update(canteenMenuItems)
      .set({
        menuSourceId: sourceId,
        externalProductId: "exact-product",
      })
      .where(eq(canteenMenuItems.id, itemId));
    const snapshot = {
      snapshotCompleteness: "complete" as const,
      items: [
        {
          externalProductId: "exact-product",
          name: "更新后的菜品名称",
          mealPeriods: ["lunch"],
          svgKey: "更新分类",
          pricing: {
            options: [{ amountMinor: 1888, currency: "HKD" }],
          },
        },
      ],
    };
    const preview = await previewMenuSyncFromJson(canteenId, snapshot);
    expect(preview.plan.actions).toEqual([
      expect.objectContaining({ action: "update", itemId }),
    ]);

    await applyMenuSyncFromJson(canteenId, snapshot, preview.previewToken);

    const [updated] = await db
      .select()
      .from(canteenMenuItems)
      .where(eq(canteenMenuItems.id, itemId));
    expect(updated).toMatchObject({
      id: itemId,
      externalProductId: "exact-product",
      name: "更新后的菜品名称",
      svgKey: "更新分类",
    });
    const [price] = await db
      .select({ amountMinor: canteenMenuItemPrices.amountMinor })
      .from(canteenMenuItemPrices)
      .where(eq(canteenMenuItemPrices.menuItemId, itemId));
    expect(price).toEqual({ amountMinor: 1888 });
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

  it("applies reviewed replacements and removals, then passes an ordinary retry", async () => {
    const previousProductId = "old-product";
    const nextProductId = "new-product";
    const removedItemId = randomUUID();
    const secondRemovedItemId = randomUUID();
    const removedProductId = "removed-product";
    const secondRemovedProductId = "second-removed";
    await db
      .update(canteenMenuItems)
      .set({
        menuSourceId: sourceId,
        externalProductId: previousProductId,
      })
      .where(eq(canteenMenuItems.id, itemId));
    await db.insert(canteenMenuItems).values([
      {
        id: removedItemId,
        canteenId,
        name: "預期停售菜品",
        mealPeriods: ["lunch"],
        svgKey: "drink",
        menuSourceId: sourceId,
        externalProductId: removedProductId,
      },
      {
        id: secondRemovedItemId,
        canteenId,
        name: "第二款預期停售菜品",
        mealPeriods: ["lunch"],
        svgKey: "drink",
        menuSourceId: sourceId,
        externalProductId: secondRemovedProductId,
      },
    ]);
    const input = parseValidatedAigensSnapshot({
      snapshotCompleteness: "complete",
      items: [
        {
          externalProductId: nextProductId,
          name: "演示菜品 A",
          mealPeriods: ["lunch"],
          svgKey: "drink",
        },
      ],
    });
    const audit = buildMenuIdentityTransitionAudit(
      [
        {
          id: itemId,
          name: "演示菜品 A",
          mealPeriods: ["lunch"],
          sortOrder: 0,
          svgKey: "drink",
          priceOptions: [],
          menuSourceId: sourceId,
          externalProductId: previousProductId,
          isAvailable: true,
        },
        {
          id: removedItemId,
          name: "預期停售菜品",
          mealPeriods: ["lunch"],
          sortOrder: 0,
          svgKey: "drink",
          priceOptions: [],
          menuSourceId: sourceId,
          externalProductId: removedProductId,
          isAvailable: true,
        },
        {
          id: secondRemovedItemId,
          name: "第二款預期停售菜品",
          mealPeriods: ["lunch"],
          sortOrder: 0,
          svgKey: "drink",
          priceOptions: [],
          menuSourceId: sourceId,
          externalProductId: secondRemovedProductId,
          isAvailable: true,
        },
      ],
      input,
    );

    const preview = await previewMenuSync(sourceId, input);
    expect(preview.blockingDecision).toMatchObject({
      blocked: true,
      code: "MENU_SYNC_IDENTITY_CHURN",
    });
    expect(preview.blockingReasons.map((reason) => reason.code)).toEqual([
      "MENU_SYNC_IDENTITY_CHURN",
      "MENU_SYNC_SUSPICIOUS_DROP",
    ]);

    await applyApprovedMenuIdentityTransition(sourceId, input, {
      schemaVersion: 4,
      source: {
        provider: "aigens",
        externalOwnerId: null,
        externalStoreId: "102830",
        configurationFingerprint: transitionSourceFingerprint(),
      },
      audit,
      decisions: {
        snapshotScope: {
          status: "complete",
          rationale: "The provider response contains the complete store menu.",
        },
        replacements: [
          {
            itemId,
            previousProductId,
            nextProductId,
            rationale: "Same normalized name, price, and meal period.",
          },
        ],
        canonicalizations: [],
        merges: [],
        additions: [],
        removals: [
          { itemId: removedItemId, externalProductId: removedProductId },
          {
            itemId: secondRemovedItemId,
            externalProductId: secondRemovedProductId,
          },
        ],
        ambiguities: [],
      },
    });

    const items = await db
      .select({
        id: canteenMenuItems.id,
        externalProductId: canteenMenuItems.externalProductId,
        isAvailable: canteenMenuItems.isAvailable,
      })
      .from(canteenMenuItems)
      .where(eq(canteenMenuItems.canteenId, canteenId));
    expect(
      items.sort((left, right) => left.id.localeCompare(right.id)),
    ).toEqual(
      [
        { id: itemId, externalProductId: nextProductId, isAvailable: true },
        {
          id: removedItemId,
          externalProductId: removedProductId,
          isAvailable: false,
        },
        {
          id: secondRemovedItemId,
          externalProductId: secondRemovedProductId,
          isAvailable: false,
        },
      ].sort((left, right) => left.id.localeCompare(right.id)),
    );
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

    const retryPreview = await previewMenuSync(sourceId, input);
    expect(retryPreview.blockingDecision).toEqual({
      blocked: false,
      code: null,
      samples: [],
    });
    const retry = await applyPreviewedMenuSync(
      sourceId,
      input,
      retryPreview.previewToken,
    );
    expect(retry.plan.actions).toEqual([]);
    expect(retry.plan.unchanged).toBe(1);
  });

  it("merges reviewed Aigens period UUIDs and preserves deduplicated history", async () => {
    const mergedItemId = randomUUID();
    const retiredItemId = randomUUID();
    const previousProductIds = [
      "product-42",
      "product-42#offering-period=dinner",
    ];
    await db
      .update(canteenMenuItems)
      .set({
        menuSourceId: sourceId,
        externalProductId: previousProductIds[0],
      })
      .where(eq(canteenMenuItems.id, itemId));
    await db.insert(canteenMenuItems).values([
      {
        id: mergedItemId,
        canteenId,
        name: "演示菜品 A",
        mealPeriods: ["dinner"],
        svgKey: "drink",
        menuSourceId: sourceId,
        externalProductId: previousProductIds[1],
      },
      {
        id: retiredItemId,
        canteenId,
        name: "已停售菜品",
        mealPeriods: ["lunch"],
        svgKey: "drink",
        menuSourceId: sourceId,
        externalProductId: "product-99#offering-period=lunch",
      },
    ]);
    await db.insert(canteenDishVotes).values({
      menuItemId: mergedItemId,
      userId,
      vote: "dislike",
    });
    await db.insert(canteenDishComments).values({
      menuItemId: mergedItemId,
      userId,
      content: "晚餐 occurrence 上的历史",
    });
    const input = parseValidatedAigensSnapshot({
      snapshotCompleteness: "complete",
      items: [
        {
          externalProductId: "product-42",
          name: "演示菜品 A",
          mealPeriods: ["lunch", "dinner"],
          svgKey: "drink",
        },
      ],
    });
    const existingProjection = [
      {
        id: itemId,
        name: "演示菜品 A",
        mealPeriods: ["lunch" as const],
        sortOrder: 0,
        svgKey: "drink",
        priceOptions: [],
        menuSourceId: sourceId,
        externalProductId: previousProductIds[0],
        isAvailable: true,
      },
      {
        id: mergedItemId,
        name: "演示菜品 A",
        mealPeriods: ["dinner" as const],
        sortOrder: 0,
        svgKey: "drink",
        priceOptions: [],
        menuSourceId: sourceId,
        externalProductId: previousProductIds[1],
        isAvailable: true,
      },
      {
        id: retiredItemId,
        name: "已停售菜品",
        mealPeriods: ["lunch" as const],
        sortOrder: 0,
        svgKey: "drink",
        priceOptions: [],
        menuSourceId: sourceId,
        externalProductId: "product-99#offering-period=lunch",
        isAvailable: true,
      },
    ];
    const audit = buildMenuIdentityTransitionAudit(
      existingProjection,
      input,
      "aigens",
    );

    const artifact = {
      schemaVersion: 4,
      source: {
        provider: "aigens",
        externalOwnerId: null,
        externalStoreId: "102830",
        configurationFingerprint: transitionSourceFingerprint(),
      },
      audit,
      decisions: {
        snapshotScope: {
          status: "complete",
          rationale: "The response is the complete provider snapshot.",
        },
        replacements: [],
        canonicalizations: [
          {
            itemId: retiredItemId,
            previousProductId: "product-99#offering-period=lunch",
            nextProductId: "product-99",
            rationale:
              "The period suffix is a historical alias of backend product 99.",
          },
        ],
        merges: [
          {
            survivorItemId: itemId,
            mergedItemIds: [mergedItemId],
            previousProductIds,
            nextProductId: "product-42",
            duplicateVotePolicy: "deduplicate-identical",
            rationale:
              "Both UUIDs are meal-period occurrences of backend product 42.",
          },
        ],
        additions: [],
        removals: [],
        ambiguities: [],
      },
    } as const;

    await expect(
      applyApprovedMenuIdentityTransition(sourceId, input, artifact),
    ).rejects.toThrow("MENU_IDENTITY_TRANSITION_VOTE_CONFLICT");
    const [unmerged] = await db
      .select({
        menuSourceId: canteenMenuItems.menuSourceId,
        externalProductId: canteenMenuItems.externalProductId,
        isAvailable: canteenMenuItems.isAvailable,
      })
      .from(canteenMenuItems)
      .where(eq(canteenMenuItems.id, mergedItemId));
    expect(unmerged).toEqual({
      menuSourceId: sourceId,
      externalProductId: previousProductIds[1],
      isAvailable: true,
    });

    await db
      .update(canteenDishVotes)
      .set({ vote: "like" })
      .where(eq(canteenDishVotes.menuItemId, mergedItemId));
    const concurrentUserId = randomUUID();
    additionalUserIds.push(concurrentUserId);
    await db.insert(users).values({
      id: concurrentUserId,
      email: `${concurrentUserId}@test.com`,
      nickname: "并发用户",
      role: "user",
    });
    await db.insert(accounts).values({
      accountId: concurrentUserId,
      providerId: "credential",
      userId: concurrentUserId,
      password: "test-password-hash",
    });
    mockRequireCommentAuth.mockResolvedValue({
      id: concurrentUserId,
      email: `${concurrentUserId}@test.com`,
      nickname: "并发用户",
      hasPassword: true,
    });
    mockGetSessionVoterUser.mockResolvedValue({
      id: concurrentUserId,
      banned: false,
    });

    const pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 1,
    });
    const blockerClient = await pool.connect();
    const triggerSuffix = concurrentUserId.replaceAll("-", "");
    const triggerFunction = `test_block_history_${triggerSuffix}`;
    const commentTrigger = `test_block_comment_${triggerSuffix}`;
    const voteTrigger = `test_block_vote_${triggerSuffix}`;
    const advisoryKey = Number.parseInt(triggerSuffix.slice(0, 8), 16);
    let advisoryLockHeld = false;
    let commentWrite: ReturnType<typeof createDishComment> | undefined;
    let voteWrite: ReturnType<typeof upsertDishVote> | undefined;
    let transition:
      | ReturnType<typeof applyApprovedMenuIdentityTransition>
      | undefined;
    try {
      await blockerClient.query(`
        create function ${triggerFunction}() returns trigger
        language plpgsql as $$
        begin
          perform pg_advisory_xact_lock(${advisoryKey});
          return new;
        end
        $$
      `);
      await blockerClient.query(`
        create trigger ${commentTrigger}
        before insert on canteen_dish_comments
        for each row execute function ${triggerFunction}()
      `);
      await blockerClient.query(`
        create trigger ${voteTrigger}
        before insert on canteen_dish_votes
        for each row execute function ${triggerFunction}()
      `);
      await blockerClient.query("select pg_advisory_lock($1)", [advisoryKey]);
      advisoryLockHeld = true;
      const blocker = await blockerClient.query<{ pid: number }>(
        "select pg_backend_pid() as pid",
      );

      commentWrite = createDishComment(mergedItemId, "并发写入的评论");
      voteWrite = upsertDishVote(mergedItemId, "like");
      await waitForBlockedTransactionCount(
        blockerClient,
        blocker.rows[0].pid,
        2,
      );

      let transitionSettled = false;
      transition = applyApprovedMenuIdentityTransition(
        sourceId,
        input,
        artifact,
      ).finally(() => {
        transitionSettled = true;
      });
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(transitionSettled).toBe(false);

      await blockerClient.query("select pg_advisory_unlock($1)", [advisoryKey]);
      advisoryLockHeld = false;
      await Promise.all([commentWrite, voteWrite, transition]);
    } finally {
      if (advisoryLockHeld) {
        await blockerClient.query("select pg_advisory_unlock($1)", [
          advisoryKey,
        ]);
      }
      await Promise.allSettled(
        [commentWrite, voteWrite, transition].filter(
          (promise) => promise !== undefined,
        ),
      );
      await blockerClient.query(
        `drop trigger if exists ${commentTrigger} on canteen_dish_comments`,
      );
      await blockerClient.query(
        `drop trigger if exists ${voteTrigger} on canteen_dish_votes`,
      );
      await blockerClient.query(`drop function if exists ${triggerFunction}()`);
      blockerClient.release();
      await pool.end();
    }

    const rows = await db
      .select({
        id: canteenMenuItems.id,
        menuSourceId: canteenMenuItems.menuSourceId,
        externalProductId: canteenMenuItems.externalProductId,
        isAvailable: canteenMenuItems.isAvailable,
      })
      .from(canteenMenuItems)
      .where(eq(canteenMenuItems.canteenId, canteenId));
    expect(rows).toEqual(
      expect.arrayContaining([
        {
          id: itemId,
          menuSourceId: sourceId,
          externalProductId: "product-42",
          isAvailable: true,
        },
        {
          id: mergedItemId,
          menuSourceId: null,
          externalProductId: null,
          isAvailable: false,
        },
        {
          id: retiredItemId,
          menuSourceId: sourceId,
          externalProductId: "product-99",
          isAvailable: false,
        },
      ]),
    );
    const [voteCount] = await db
      .select({ value: count() })
      .from(canteenDishVotes)
      .where(eq(canteenDishVotes.menuItemId, itemId));
    const [commentCount] = await db
      .select({ value: count() })
      .from(canteenDishComments)
      .where(eq(canteenDishComments.menuItemId, itemId));
    expect(voteCount.value).toBe(2);
    expect(commentCount.value).toBe(3);
    const retiredHistory = await Promise.all([
      db
        .select({ value: count() })
        .from(canteenDishVotes)
        .where(eq(canteenDishVotes.menuItemId, mergedItemId)),
      db
        .select({ value: count() })
        .from(canteenDishComments)
        .where(eq(canteenDishComments.menuItemId, mergedItemId)),
    ]);
    expect(retiredHistory.map(([row]) => row.value)).toEqual([0, 0]);

    const retry = await previewMenuSync(sourceId, input);
    expect(retry.blockingDecision.blocked).toBe(false);
    expect(retry.plan.actions).toEqual([]);
  });

  it("applies an exact reviewed bare Aigens replacement and preserves UUID history", async () => {
    const previousProductId = "historical-product#offering-period=lunch";
    const nextProductId = "historical-product";
    await db
      .update(canteenMenuItems)
      .set({
        menuSourceId: sourceId,
        externalProductId: previousProductId,
      })
      .where(eq(canteenMenuItems.id, itemId));
    const input = parseValidatedAigensSnapshot({
      snapshotCompleteness: "complete",
      items: [
        {
          externalProductId: nextProductId,
          name: "演示菜品 A",
          mealPeriods: ["lunch"],
          svgKey: "drink",
        },
      ],
    });
    const draft = await auditMenuIdentityTransition(
      transitionSourceConfiguration(),
      input,
    );
    const artifact = {
      ...draft,
      decisions: {
        ...draft.decisions,
        snapshotScope: {
          status: "complete" as const,
          rationale: "The provider response contains the complete store menu.",
        },
        replacements: [
          {
            itemId,
            previousProductId,
            nextProductId,
            rationale: "The reviewed one-to-one offering retains this UUID.",
          },
        ],
      },
    };

    await db
      .update(canteenMenuItems)
      .set({ svgKey: "併發人工修訂" })
      .where(eq(canteenMenuItems.id, itemId));
    await expect(
      applyApprovedMenuIdentityTransition(sourceId, input, artifact),
    ).rejects.toThrow("MENU_IDENTITY_TRANSITION_STALE");
    await db
      .update(canteenMenuItems)
      .set({ svgKey: "drink" })
      .where(eq(canteenMenuItems.id, itemId));

    await applyApprovedMenuIdentityTransition(sourceId, input, artifact);
    const [persisted] = await db
      .select({
        id: canteenMenuItems.id,
        externalProductId: canteenMenuItems.externalProductId,
      })
      .from(canteenMenuItems)
      .where(eq(canteenMenuItems.id, itemId));
    expect(persisted).toEqual({ id: itemId, externalProductId: nextProductId });
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
    const retry = await previewMenuSync(sourceId, input);
    expect(retry.blockingDecision).toEqual({
      blocked: false,
      code: null,
      samples: [],
    });
    expect(retry.plan.actions).toEqual([]);
  });

  it("rejects identity-transition mode when only suspicious-drop is blocking", async () => {
    const productIds = ["a", "b", "c", "d"].map((id) => id);
    await db
      .update(canteenMenuItems)
      .set({
        menuSourceId: sourceId,
        externalProductId: productIds[0],
        name: "菜品 a",
      })
      .where(eq(canteenMenuItems.id, itemId));
    const additionalIds = [randomUUID(), randomUUID(), randomUUID()];
    await db.insert(canteenMenuItems).values(
      additionalIds.map((id, index) => ({
        id,
        canteenId,
        name: `菜品 ${String.fromCharCode(98 + index)}`,
        mealPeriods: ["lunch" as const],
        svgKey: "drink",
        menuSourceId: sourceId,
        externalProductId: productIds[index + 1],
      })),
    );
    const existingItems = [itemId, ...additionalIds].map((id, index) => ({
      id,
      name: `菜品 ${String.fromCharCode(97 + index)}`,
      mealPeriods: ["lunch" as const],
      sortOrder: 0,
      svgKey: "drink",
      priceOptions: [],
      menuSourceId: sourceId,
      externalProductId: productIds[index],
      isAvailable: true,
    }));
    const input = parseValidatedAigensSnapshot({
      snapshotCompleteness: "complete",
      items: productIds.slice(0, 2).map((externalProductId, index) => ({
        externalProductId,
        name: `菜品 ${String.fromCharCode(97 + index)}`,
        mealPeriods: ["lunch"],
        svgKey: "drink",
      })),
    });
    const audit = buildMenuIdentityTransitionAudit(existingItems, input);
    const preview = await previewMenuSync(sourceId, input);
    expect(preview.blockingReasons.map((reason) => reason.code)).toEqual([
      "MENU_SYNC_SUSPICIOUS_DROP",
    ]);

    await expect(
      applyApprovedMenuIdentityTransition(sourceId, input, {
        schemaVersion: 4,
        source: {
          provider: "aigens",
          externalOwnerId: null,
          externalStoreId: "102830",
          configurationFingerprint: transitionSourceFingerprint(),
        },
        audit,
        decisions: {
          snapshotScope: {
            status: "complete",
            rationale:
              "The provider response contains the complete store menu.",
          },
          replacements: [],
          canonicalizations: [],
          merges: [],
          additions: [],
          removals: additionalIds.slice(1).map((id, index) => ({
            itemId: id,
            externalProductId: productIds[index + 2],
          })),
          ambiguities: [],
        },
      }),
    ).rejects.toThrow("MENU_IDENTITY_TRANSITION_NOT_APPLICABLE");

    const availability = await db
      .select({ isAvailable: canteenMenuItems.isAvailable })
      .from(canteenMenuItems)
      .where(eq(canteenMenuItems.canteenId, canteenId));
    expect(availability.every((row) => row.isAvailable)).toBe(true);
  });

  it("rejects a stale identity artifact without mutating the menu", async () => {
    const previousProductId = "old-product";
    const nextProductId = "new-product";
    await db
      .update(canteenMenuItems)
      .set({
        menuSourceId: sourceId,
        externalProductId: previousProductId,
      })
      .where(eq(canteenMenuItems.id, itemId));
    const input = parseValidatedAigensSnapshot({
      snapshotCompleteness: "complete",
      items: [
        {
          externalProductId: nextProductId,
          name: "演示菜品 A",
          mealPeriods: ["lunch"],
          svgKey: "drink",
        },
      ],
    });
    const audit = buildMenuIdentityTransitionAudit(
      [
        {
          id: itemId,
          name: "演示菜品 A",
          mealPeriods: ["lunch"],
          sortOrder: 0,
          svgKey: "drink",
          priceOptions: [],
          menuSourceId: sourceId,
          externalProductId: previousProductId,
          isAvailable: true,
        },
      ],
      input,
    );
    await db
      .update(canteenMenuItems)
      .set({ svgKey: "人工修訂後的分類" })
      .where(eq(canteenMenuItems.id, itemId));

    await expect(
      applyApprovedMenuIdentityTransition(sourceId, input, {
        schemaVersion: 4,
        source: {
          provider: "aigens",
          externalOwnerId: null,
          externalStoreId: "102830",
          configurationFingerprint: transitionSourceFingerprint(),
        },
        audit,
        decisions: {
          snapshotScope: {
            status: "complete",
            rationale:
              "The provider response contains the complete store menu.",
          },
          replacements: [
            {
              itemId,
              previousProductId,
              nextProductId,
              rationale: "Same normalized name, price, and meal period.",
            },
          ],
          canonicalizations: [],
          merges: [],
          additions: [],
          removals: [],
          ambiguities: [],
        },
      }),
    ).rejects.toThrow("MENU_IDENTITY_TRANSITION_STALE");

    const [unchanged] = await db
      .select({
        svgKey: canteenMenuItems.svgKey,
        externalProductId: canteenMenuItems.externalProductId,
      })
      .from(canteenMenuItems)
      .where(eq(canteenMenuItems.id, itemId));
    expect(unchanged).toEqual({
      svgKey: "人工修訂後的分類",
      externalProductId: previousProductId,
    });
  });

  it("does not overwrite an admin price edit committed while a transition waits", async () => {
    const previousProductId = "old-product";
    const nextProductId = "new-product";
    await db
      .update(canteenMenuItems)
      .set({
        menuSourceId: sourceId,
        externalProductId: previousProductId,
      })
      .where(eq(canteenMenuItems.id, itemId));
    await db.insert(canteenMenuItemPrices).values({
      menuItemId: itemId,
      label: "原价",
      amountMinor: 1000,
    });
    const input = parseValidatedAigensSnapshot({
      snapshotCompleteness: "complete",
      items: [
        {
          externalProductId: nextProductId,
          name: "演示菜品 A",
          mealPeriods: ["lunch"],
          svgKey: "drink",
          pricing: {
            options: [{ label: "原价", amountMinor: 1000, currency: "HKD" }],
          },
        },
      ],
    });
    const audit = buildMenuIdentityTransitionAudit(
      [
        {
          id: itemId,
          name: "演示菜品 A",
          mealPeriods: ["lunch"],
          sortOrder: 0,
          svgKey: "drink",
          priceOptions: [
            {
              label: "原价",
              amountMinor: 1000,
              currency: "HKD",
              sortOrder: 0,
            },
          ],
          menuSourceId: sourceId,
          externalProductId: previousProductId,
          isAvailable: true,
        },
      ],
      input,
    );
    const artifact = {
      schemaVersion: 4,
      source: {
        provider: "aigens",
        externalOwnerId: null,
        externalStoreId: "102830",
        configurationFingerprint: transitionSourceFingerprint(),
      },
      audit,
      decisions: {
        snapshotScope: {
          status: "complete",
          rationale: "The provider response contains the complete store menu.",
        },
        replacements: [
          {
            itemId,
            previousProductId,
            nextProductId,
            rationale: "Same normalized name, price, and meal period.",
          },
        ],
        canonicalizations: [],
        merges: [],
        additions: [],
        removals: [],
        ambiguities: [],
      },
    } as const;

    const pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 1,
    });
    const adminClient = await pool.connect();
    let adminTransactionOpen = false;
    try {
      await adminClient.query("begin");
      adminTransactionOpen = true;
      const blocker = await adminClient.query<{ pid: number }>(
        "select pg_backend_pid() as pid",
      );
      await adminClient.query(
        "update canteen_menu_items set updated_at = now() where id = $1",
        [itemId],
      );
      await adminClient.query(
        "delete from canteen_menu_item_prices where menu_item_id = $1",
        [itemId],
      );
      await adminClient.query(
        "insert into canteen_menu_item_prices (menu_item_id, label, amount_minor, currency, sort_order) values ($1, $2, $3, $4, $5)",
        [itemId, "人工新价", 1200, "HKD", 0],
      );

      const transition = applyApprovedMenuIdentityTransition(
        sourceId,
        input,
        artifact,
      );
      await waitForBlockedTransaction(adminClient, blocker.rows[0].pid);
      await adminClient.query("commit");
      adminTransactionOpen = false;

      await expect(transition).rejects.toThrow(
        "MENU_IDENTITY_TRANSITION_STALE",
      );
    } finally {
      if (adminTransactionOpen) await adminClient.query("rollback");
      adminClient.release();
      await pool.end();
    }

    const [preserved] = await db
      .select({
        externalProductId: canteenMenuItems.externalProductId,
        label: canteenMenuItemPrices.label,
        amountMinor: canteenMenuItemPrices.amountMinor,
      })
      .from(canteenMenuItems)
      .innerJoin(
        canteenMenuItemPrices,
        eq(canteenMenuItemPrices.menuItemId, canteenMenuItems.id),
      )
      .where(eq(canteenMenuItems.id, itemId));
    expect(preserved).toEqual({
      externalProductId: previousProductId,
      label: "人工新价",
      amountMinor: 1200,
    });
  });

  it("waits for a concurrent admin insert before verifying a transition", async () => {
    const previousProductId = "old-product";
    const nextProductId = "new-product";
    const addedProductId = "added-product";
    await db
      .update(canteenMenuItems)
      .set({
        menuSourceId: sourceId,
        externalProductId: previousProductId,
      })
      .where(eq(canteenMenuItems.id, itemId));
    const input = parseValidatedAigensSnapshot({
      snapshotCompleteness: "complete",
      items: [
        {
          externalProductId: nextProductId,
          name: "演示菜品 A",
          mealPeriods: ["lunch"],
        },
        {
          externalProductId: addedProductId,
          name: "并发新增菜品",
          mealPeriods: ["lunch"],
        },
      ],
    });
    const audit = buildMenuIdentityTransitionAudit(
      [
        {
          id: itemId,
          name: "演示菜品 A",
          mealPeriods: ["lunch"],
          sortOrder: 0,
          svgKey: "drink",
          priceOptions: [],
          menuSourceId: sourceId,
          externalProductId: previousProductId,
          isAvailable: true,
        },
      ],
      input,
    );
    const artifact = {
      schemaVersion: 4,
      source: {
        provider: "aigens",
        externalOwnerId: null,
        externalStoreId: "102830",
        configurationFingerprint: transitionSourceFingerprint(),
      },
      audit,
      decisions: {
        snapshotScope: {
          status: "complete",
          rationale: "The provider response contains the complete store menu.",
        },
        replacements: [
          {
            itemId,
            previousProductId,
            nextProductId,
            rationale: "Same normalized name, price, and meal period.",
          },
        ],
        canonicalizations: [],
        merges: [],
        additions: [addedProductId],
        removals: [],
        ambiguities: [],
      },
    } as const;

    const pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 1,
    });
    const adminClient = await pool.connect();
    let adminTransactionOpen = false;
    try {
      await adminClient.query("begin");
      adminTransactionOpen = true;
      const blocker = await adminClient.query<{ pid: number }>(
        "select pg_backend_pid() as pid",
      );
      await adminClient.query(
        "insert into canteen_menu_items (canteen_id, name, meal_periods, svg_key) values ($1, $2, $3, $4)",
        [canteenId, "并发新增菜品", ["lunch"], "default"],
      );

      const transition = applyApprovedMenuIdentityTransition(
        sourceId,
        input,
        artifact,
      );
      await waitForBlockedTransaction(adminClient, blocker.rows[0].pid);
      await adminClient.query("commit");
      adminTransactionOpen = false;

      await expect(transition).rejects.toThrow("MENU_SYNC_CONFLICT");
    } finally {
      if (adminTransactionOpen) await adminClient.query("rollback");
      adminClient.release();
      await pool.end();
    }

    const rows = await db
      .select({
        name: canteenMenuItems.name,
        externalProductId: canteenMenuItems.externalProductId,
      })
      .from(canteenMenuItems)
      .where(eq(canteenMenuItems.canteenId, canteenId));
    expect(rows).toEqual(
      expect.arrayContaining([
        { name: "演示菜品 A", externalProductId: previousProductId },
        { name: "并发新增菜品", externalProductId: null },
      ]),
    );
  });

  it("rejects malformed identity artifacts at the transaction boundary", async () => {
    await db
      .update(canteenMenuItems)
      .set({
        menuSourceId: sourceId,
        externalProductId: "old-product",
      })
      .where(eq(canteenMenuItems.id, itemId));
    const input = parseValidatedAigensSnapshot({
      snapshotCompleteness: "complete",
      items: [
        {
          externalProductId: "new-product",
          name: "演示菜品 A",
          mealPeriods: ["lunch"],
        },
      ],
    });

    await expect(
      applyApprovedMenuIdentityTransition(sourceId, input, null),
    ).rejects.toThrow("INVALID_MENU_IDENTITY_TRANSITION_ARTIFACT");

    const rows = await db
      .select({ id: canteenMenuItems.id })
      .from(canteenMenuItems)
      .where(eq(canteenMenuItems.canteenId, canteenId));
    expect(rows).toEqual([{ id: itemId }]);
  });

  it("rejects missing and stale preview tokens before writing", async () => {
    await db
      .update(canteenMenuSources)
      .set({ provider: "ichef" })
      .where(eq(canteenMenuSources.id, sourceId));
    const snapshot = {
      snapshotCompleteness: "complete" as const,
      items: [
        {
          externalProductId: "item-c",
          name: "演示菜品 C",
          mealPeriods: ["lunch"],
        },
      ],
    };
    const preview = await previewMenuSyncFromJson(canteenId, snapshot);

    await expect(
      applyMenuSyncFromJson(canteenId, snapshot, null),
    ).rejects.toThrow("MENU_SYNC_STALE");

    const interveningItemId = randomUUID();
    await db.insert(canteenMenuItems).values({
      id: interveningItemId,
      canteenId,
      name: "演示菜品 D",
    });
    await expect(
      applyMenuSyncFromJson(canteenId, snapshot, preview.previewToken),
    ).rejects.toThrow("MENU_SYNC_STALE");

    const written = await db
      .select({ value: count() })
      .from(canteenMenuItems)
      .where(eq(canteenMenuItems.externalProductId, "item-c"));
    expect(written[0].value).toBe(0);
    await db
      .delete(canteenMenuItems)
      .where(eq(canteenMenuItems.id, interveningItemId));
  });

  it("enforces one external identity per canteen", async () => {
    await db.insert(canteenMenuItems).values({
      canteenId,
      name: "现有来源商品",
      menuSourceId: sourceId,
      externalProductId: "duplicate",
    });
    await expect(
      db.insert(canteenMenuItems).values({
        canteenId,
        name: "重复来源商品",
        menuSourceId: sourceId,
        externalProductId: "duplicate",
      }),
    ).rejects.toThrow();

    const duplicates = await db
      .select({ value: count() })
      .from(canteenMenuItems)
      .where(
        and(
          eq(canteenMenuItems.canteenId, canteenId),
          eq(canteenMenuItems.externalProductId, "duplicate"),
        ),
      );
    expect(duplicates[0].value).toBe(1);
  });

  it("rejects a source from another canteen at the database boundary", async () => {
    const otherCanteenId = randomUUID();
    const otherSourceId = randomUUID();
    await db.insert(canteens).values({
      id: otherCanteenId,
      name: "另一食堂",
    });
    await db.insert(canteenMenuSources).values({
      id: otherSourceId,
      canteenId: otherCanteenId,
      provider: "pinme",
      externalStoreId: "5203-test",
    });

    await expect(
      db.insert(canteenMenuItems).values({
        canteenId,
        name: "绝不能跨食堂写入",
        menuSourceId: otherSourceId,
        externalProductId: "cross-canteen-product",
      }),
    ).rejects.toThrow();

    await db.delete(canteens).where(eq(canteens.id, otherCanteenId));
  });

  it("allows the existing canteen delete cascade with managed rows", async () => {
    const deleteCanteenId = randomUUID();
    const deleteSourceId = randomUUID();
    await db.insert(canteens).values({
      id: deleteCanteenId,
      name: "待删除同步食堂",
    });
    await db.insert(canteenMenuSources).values({
      id: deleteSourceId,
      canteenId: deleteCanteenId,
      provider: "pinme",
      externalStoreId: "delete-test",
    });
    await db.insert(canteenMenuItems).values({
      canteenId: deleteCanteenId,
      name: "待删除商品",
      menuSourceId: deleteSourceId,
      externalProductId: "delete-product",
    });

    await expect(
      db.delete(canteens).where(eq(canteens.id, deleteCanteenId)),
    ).resolves.toBeDefined();
  });

  it("keeps menu integration tables behind RLS", async () => {
    const result = await db.execute<{
      relname: string;
      relrowsecurity: boolean;
    }>(sql`
      select relname, relrowsecurity
      from pg_class
      where oid in (
        'canteen_menu_sources'::regclass,
        'canteen_ordering_handoffs'::regclass,
        'canteen_menu_sync_runs'::regclass
      )
      order by relname
    `);

    expect(result.rows).toEqual([
      { relname: "canteen_menu_sources", relrowsecurity: true },
      { relname: "canteen_menu_sync_runs", relrowsecurity: true },
      { relname: "canteen_ordering_handoffs", relrowsecurity: true },
    ]);
  });
});
