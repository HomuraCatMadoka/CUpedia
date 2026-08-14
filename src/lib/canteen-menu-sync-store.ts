import { createHash } from "node:crypto";
import { db } from "@/db";
import {
  canteenMenuItemPrices,
  canteenMenuItems,
  canteenMenuSources,
} from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { createMenuExternalKey } from "@/lib/canteen-menu-external-key";
import {
  evaluateMenuSnapshot,
  type MenuSnapshotEvaluation,
} from "./canteen-menu-snapshot-evaluator";
import type { ExistingSyncMenuItem } from "@/lib/canteen-menu-sync";
import type {
  MealPeriodAssignment,
  MenuItemPriceOptionInput,
  MenuSyncInput,
} from "@/lib/canteen-types";

type MenuSourceRow = typeof canteenMenuSources.$inferSelect;

type SyncMenuRow = {
  id: string;
  name: string;
  mealPeriods: string[];
  sortOrder: number;
  svgKey: string;
  legacyPrice: number | null;
  menuSourceId: string | null;
  externalProductId: string | null;
  isAvailable: boolean;
  priceId: string | null;
  priceLabel: string | null;
  amountMinor: number | null;
  currency: string | null;
  priceSortOrder: number | null;
};

function priceOptionValues(
  menuItemId: string,
  options: MenuItemPriceOptionInput[],
  now: Date,
) {
  return options.map((option) => ({
    menuItemId,
    ...option,
    createdAt: now,
    updatedAt: now,
  }));
}

function collectExistingSyncItems(rows: SyncMenuRow[]): ExistingSyncMenuItem[] {
  const items = new Map<string, ExistingSyncMenuItem>();
  for (const row of rows) {
    const existing = items.get(row.id);
    if (existing) {
      if (row.priceId) {
        existing.priceOptions.push({
          label: row.priceLabel,
          amountMinor: row.amountMinor!,
          currency: row.currency!,
          sortOrder: row.priceSortOrder!,
        });
      }
      continue;
    }
    items.set(row.id, {
      id: row.id,
      name: row.name,
      mealPeriods: row.mealPeriods as MealPeriodAssignment[],
      sortOrder: row.sortOrder,
      svgKey: row.svgKey,
      priceOptions: row.priceId
        ? [
            {
              label: row.priceLabel,
              amountMinor: row.amountMinor!,
              currency: row.currency!,
              sortOrder: row.priceSortOrder!,
            },
          ]
        : row.legacyPrice == null
          ? []
          : [
              {
                label: null,
                amountMinor: row.legacyPrice * 100,
                currency: "HKD",
                sortOrder: 0,
              },
            ],
      menuSourceId: row.menuSourceId,
      externalProductId: row.externalProductId,
      isAvailable: row.isAvailable,
    });
  }
  for (const item of items.values()) {
    item.priceOptions.sort((a, b) => a.sortOrder - b.sortOrder);
  }
  return [...items.values()];
}

function syncMenuSelection() {
  return {
    id: canteenMenuItems.id,
    name: canteenMenuItems.name,
    mealPeriods: canteenMenuItems.mealPeriods,
    sortOrder: canteenMenuItems.sortOrder,
    svgKey: canteenMenuItems.svgKey,
    legacyPrice: canteenMenuItems.price,
    menuSourceId: canteenMenuItems.menuSourceId,
    externalProductId: canteenMenuItems.externalProductId,
    isAvailable: canteenMenuItems.isAvailable,
    priceId: canteenMenuItemPrices.id,
    priceLabel: canteenMenuItemPrices.label,
    amountMinor: canteenMenuItemPrices.amountMinor,
    currency: canteenMenuItemPrices.currency,
    priceSortOrder: canteenMenuItemPrices.sortOrder,
  };
}

export type MenuSyncPreview = MenuSnapshotEvaluation & {
  previewToken: string;
};

function createMenuSyncPreviewToken(
  source: MenuSourceRow,
  input: MenuSyncInput,
  existing: ExistingSyncMenuItem[],
): string {
  const normalizedExisting = [...existing]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((item) => ({
      ...item,
      priceOptions: [...item.priceOptions].sort(
        (a, b) =>
          a.sortOrder - b.sortOrder ||
          (a.label ?? "").localeCompare(b.label ?? "") ||
          a.currency.localeCompare(b.currency) ||
          a.amountMinor - b.amountMinor,
      ),
    }));
  return createHash("sha256")
    .update(
      JSON.stringify({
        sourceId: source.id,
        canteenId: source.canteenId,
        legacyTakeoverAt: source.legacyTakeoverAt,
        input,
        existing: normalizedExisting,
      }),
    )
    .digest("hex");
}

async function selectExistingItems(
  executor: Pick<typeof db, "select">,
  canteenId: string,
) {
  return executor
    .select(syncMenuSelection())
    .from(canteenMenuItems)
    .leftJoin(
      canteenMenuItemPrices,
      eq(canteenMenuItemPrices.menuItemId, canteenMenuItems.id),
    )
    .where(eq(canteenMenuItems.canteenId, canteenId));
}

export async function previewMenuSync(
  sourceId: string,
  input: MenuSyncInput,
): Promise<MenuSyncPreview> {
  const source = await db.query.canteenMenuSources.findFirst({
    where: eq(canteenMenuSources.id, sourceId),
  });
  if (!source) throw new Error("MENU_SOURCE_NOT_FOUND");
  if (input.takeOverLegacyItems && source.legacyTakeoverAt !== null) {
    throw new Error("LEGACY_TAKEOVER_ALREADY_COMPLETED");
  }
  const existing = collectExistingSyncItems(
    await selectExistingItems(db, source.canteenId),
  );
  const evaluation = evaluateMenuSnapshot(
    {
      id: source.id,
      provider: source.provider,
      legacyAdoptionOpen: source.legacyTakeoverAt === null,
    },
    input,
    existing,
  );
  return {
    ...evaluation,
    previewToken: createMenuSyncPreviewToken(
      source,
      evaluation.canonicalState.input,
      evaluation.canonicalState.existingItems,
    ),
  };
}

function shadowSourceNamespace(source: MenuSourceRow): string {
  if (source.provider !== "qmai") {
    return `${source.provider}:${source.externalStoreId}`;
  }
  const sellerId = source.externalOwnerId;
  if (!sellerId?.trim()) {
    throw new Error("INVALID_MENU_SOURCE_CONFIG");
  }
  return `qmai:${sellerId.trim()}:${source.externalStoreId}`;
}

async function applyMenuSync(
  sourceId: string,
  input: MenuSyncInput,
  expectedPreviewToken: unknown,
  shouldRevalidate = true,
  expectedAttemptId?: string,
): Promise<MenuSnapshotEvaluation> {
  const now = new Date();
  const evaluationResult = await db.transaction(async (tx) => {
    // Lock the source first. This serializes even the very first sync, when no
    // managed menu rows exist yet, and fixes source/canteen ownership in DB.
    const [source] = await tx
      .select()
      .from(canteenMenuSources)
      .where(eq(canteenMenuSources.id, sourceId))
      .for("update", { of: canteenMenuSources });
    if (!source) throw new Error("MENU_SOURCE_NOT_FOUND");
    if (expectedAttemptId && source.lastAttemptId !== expectedAttemptId) {
      throw new Error("MENU_SYNC_SUPERSEDED");
    }
    if (input.takeOverLegacyItems && source.legacyTakeoverAt !== null) {
      throw new Error("LEGACY_TAKEOVER_ALREADY_COMPLETED");
    }

    const rows = await selectExistingItems(tx, source.canteenId);
    const existing = collectExistingSyncItems(rows);
    const evaluation = evaluateMenuSnapshot(
      {
        id: source.id,
        provider: source.provider,
        legacyAdoptionOpen: source.legacyTakeoverAt === null,
      },
      input,
      existing,
    );
    if (
      typeof expectedPreviewToken !== "string" ||
      !expectedPreviewToken ||
      expectedPreviewToken !==
        createMenuSyncPreviewToken(
          source,
          evaluation.canonicalState.input,
          evaluation.canonicalState.existingItems,
        )
    ) {
      throw new Error("MENU_SYNC_STALE");
    }
    const currentPlan = evaluation.plan;
    if (evaluation.blockingDecision.blocked) {
      throw Object.assign(new Error(evaluation.blockingDecision.code), {
        observation: evaluation.identityObservation,
        blockingDecision: evaluation.blockingDecision,
      });
    }

    const actionByProduct = new Map(
      currentPlan.actions.map((action) => [action.externalProductId, action]),
    );
    const existingByProduct = new Map(
      evaluation.canonicalState.existingItems
        .filter(
          (item) =>
            item.menuSourceId === source.id && item.externalProductId !== null,
        )
        .map((item) => [item.externalProductId!, item]),
    );
    const shadowSource = shadowSourceNamespace(source);

    for (const item of evaluation.canonicalState.input.items) {
      const action = actionByProduct.get(item.externalProductId);
      const shadowKey = createMenuExternalKey(
        item.externalProductId,
        item.mealPeriods,
      );
      if (action?.action === "create") {
        const [created] = await tx
          .insert(canteenMenuItems)
          .values({
            canteenId: source.canteenId,
            name: item.name,
            price: null,
            mealPeriods: item.mealPeriods,
            sortOrder: item.sortOrder,
            svgKey: item.svgKey,
            menuSourceId: source.id,
            externalProductId: item.externalProductId,
            externalSource: shadowSource,
            externalKey: shadowKey,
            isAvailable: true,
            lastSyncedAt: now,
            createdAt: now,
            updatedAt: now,
          })
          .returning({ id: canteenMenuItems.id });
        if (item.priceOptions.length > 0) {
          await tx
            .insert(canteenMenuItemPrices)
            .values(priceOptionValues(created.id, item.priceOptions, now));
        }
        continue;
      }

      const itemId =
        action?.itemId ?? existingByProduct.get(item.externalProductId)?.id;
      if (!itemId) throw new Error("MENU_SYNC_STALE");
      await tx
        .update(canteenMenuItems)
        .set({
          name: item.name,
          price: null,
          mealPeriods: item.mealPeriods,
          sortOrder: item.sortOrder,
          svgKey: item.svgKey,
          menuSourceId: source.id,
          externalProductId: item.externalProductId,
          externalSource: shadowSource,
          externalKey: shadowKey,
          isAvailable: true,
          lastSyncedAt: now,
          updatedAt: now,
        })
        .where(
          and(
            eq(canteenMenuItems.id, itemId),
            eq(canteenMenuItems.canteenId, source.canteenId),
          ),
        );
      if (action) {
        await tx
          .delete(canteenMenuItemPrices)
          .where(eq(canteenMenuItemPrices.menuItemId, itemId));
        if (item.priceOptions.length > 0) {
          await tx
            .insert(canteenMenuItemPrices)
            .values(priceOptionValues(itemId, item.priceOptions, now));
        }
      }
    }

    for (const action of currentPlan.actions) {
      if (action.action !== "deactivate" || !action.itemId) continue;
      await tx
        .update(canteenMenuItems)
        .set({ isAvailable: false, lastSyncedAt: now, updatedAt: now })
        .where(
          and(
            eq(canteenMenuItems.id, action.itemId),
            eq(canteenMenuItems.canteenId, source.canteenId),
          ),
        );
    }
    if (input.takeOverLegacyItems) {
      await tx
        .update(canteenMenuSources)
        .set({ legacyTakeoverAt: now, enabled: true, updatedAt: now })
        .where(eq(canteenMenuSources.id, source.id));
    }
    return evaluation;
  });

  if (shouldRevalidate) {
    const source = await db.query.canteenMenuSources.findFirst({
      where: eq(canteenMenuSources.id, sourceId),
      columns: { canteenId: true },
    });
    if (source) {
      revalidatePath(`/admin/canteens/${source.canteenId}`);
      revalidatePath(`/api/canteens/${source.canteenId}/menu`);
      revalidatePath(`/canteen/${source.canteenId}`);
    }
  }
  return evaluationResult;
}

export function applyPreviewedMenuSync(
  sourceId: string,
  input: MenuSyncInput,
  previewToken: unknown,
): Promise<MenuSnapshotEvaluation> {
  return applyMenuSync(sourceId, input, previewToken);
}

export function applyAutomatedMenuSync(
  sourceId: string,
  input: MenuSyncInput,
  previewToken: unknown,
  attemptId: string,
): Promise<MenuSnapshotEvaluation> {
  if (input.takeOverLegacyItems) {
    return Promise.reject(new Error("AUTOMATED_LEGACY_TAKEOVER_FORBIDDEN"));
  }
  return applyMenuSync(sourceId, input, previewToken, false, attemptId);
}
