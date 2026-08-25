import { db } from "@/db";
import {
  canteenMenuSyncSnapshotItems,
  canteenMenuSyncSnapshots,
  type HktWeekday,
} from "@/db/schema";
import { and, asc, eq, inArray } from "drizzle-orm";
import { menuSnapshotComparisonContext } from "./canteen-menu-snapshot-completeness";
import type { MenuSyncTransaction } from "./canteen-menu-sync-store";
import { menuSyncWindowAt } from "./canteen-menu-sync-window";
import type {
  MenuObservationContext,
  ProviderMenuObservation,
} from "./canteen-types";

const HKT_OFFSET_MS = 8 * 60 * 60 * 1_000;

type SnapshotItem = typeof canteenMenuSyncSnapshotItems.$inferSelect;

export type MenuSyncSnapshotChangedField =
  | "name"
  | "priceOptions"
  | "mealPeriods"
  | "sortOrder"
  | "svgKey";

export type MenuSyncSnapshotComparison = {
  sourceId: string;
  olderRunId: string;
  newerRunId: string;
  added: SnapshotItem[];
  missing: SnapshotItem[];
  changed: Array<{
    externalProductId: string;
    fields: MenuSyncSnapshotChangedField[];
    before: SnapshotItem;
    after: SnapshotItem;
  }>;
};

function observationWindowFacts(context: MenuObservationContext) {
  const window = menuSyncWindowAt(context.observedAt);
  if (
    window.key !== context.syncWindowKey ||
    window.period !== context.mealPeriod
  ) {
    throw new Error("MENU_OBSERVATION_CONTEXT_MISMATCH");
  }
  const hkt = new Date(context.observedAt.getTime() + HKT_OFFSET_MS);
  return {
    syncWindowKey: context.syncWindowKey,
    mealPeriod: context.mealPeriod,
    // Date#getUTCDay is specified to return an integer in the 0-6 domain.
    hktWeekday: hkt.getUTCDay() as HktWeekday,
    observedMinuteOfDay: hkt.getUTCHours() * 60 + hkt.getUTCMinutes(),
  };
}

/** Records normalized provider evidence in the successful sync transaction. */
export async function insertMenuSyncSnapshot(
  tx: MenuSyncTransaction,
  values: {
    runId: string;
    sourceId: string;
    snapshotHash: string;
    context: MenuObservationContext;
    input: ProviderMenuObservation;
  },
): Promise<void> {
  if (
    values.input.observationScope?.kind === "meal-period" &&
    values.input.observationScope.mealPeriod !== values.context.mealPeriod
  ) {
    throw new Error("MENU_OBSERVATION_SCOPE_MISMATCH");
  }
  await tx.insert(canteenMenuSyncSnapshots).values({
    runId: values.runId,
    menuSourceId: values.sourceId,
    snapshotHash: values.snapshotHash,
    snapshotCompleteness: values.input.snapshotCompleteness,
    observationScope: values.input.observationScope?.kind ?? "catalog",
    itemCount: values.input.items.length,
    ...observationWindowFacts(values.context),
    scopeEvidence: values.input.scopeEvidence ?? {},
    observedAt: values.context.observedAt,
  });
  if (values.input.items.length === 0) return;
  await tx.insert(canteenMenuSyncSnapshotItems).values(
    values.input.items.map((item) => ({
      runId: values.runId,
      externalProductId: item.externalProductId,
      name: item.name,
      priceOptions: item.priceOptions,
      mealPeriods: item.mealPeriods,
      sortOrder: item.sortOrder,
      svgKey: item.svgKey,
    })),
  );
}

function sameJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function changedFields(
  before: SnapshotItem,
  after: SnapshotItem,
): MenuSyncSnapshotChangedField[] {
  const fields: MenuSyncSnapshotChangedField[] = [];
  if (before.name !== after.name) fields.push("name");
  if (!sameJson(before.priceOptions, after.priceOptions)) {
    fields.push("priceOptions");
  }
  if (!sameJson(before.mealPeriods, after.mealPeriods)) {
    fields.push("mealPeriods");
  }
  if (before.sortOrder !== after.sortOrder) fields.push("sortOrder");
  if (before.svgKey !== after.svgKey) fields.push("svgKey");
  return fields;
}

/** Compares two immutable observations belonging to the same source. */
export async function compareMenuSyncSnapshots(
  sourceId: string,
  olderRunId: string,
  newerRunId: string,
): Promise<MenuSyncSnapshotComparison> {
  if (olderRunId === newerRunId) {
    throw new Error("MENU_SYNC_SNAPSHOT_IDS_MUST_DIFFER");
  }
  return db.transaction(
    async (tx) => {
      const snapshots = await tx
        .select({
          runId: canteenMenuSyncSnapshots.runId,
          sourceId: canteenMenuSyncSnapshots.menuSourceId,
          observationScope: canteenMenuSyncSnapshots.observationScope,
          mealPeriod: canteenMenuSyncSnapshots.mealPeriod,
          hktWeekday: canteenMenuSyncSnapshots.hktWeekday,
          scopeEvidence: canteenMenuSyncSnapshots.scopeEvidence,
        })
        .from(canteenMenuSyncSnapshots)
        .where(
          and(
            eq(canteenMenuSyncSnapshots.menuSourceId, sourceId),
            inArray(canteenMenuSyncSnapshots.runId, [olderRunId, newerRunId]),
          ),
        );
      if (snapshots.length !== 2) {
        throw new Error("MENU_SYNC_SNAPSHOT_NOT_FOUND");
      }
      const [first, second] = snapshots;
      if (
        first.observationScope !== second.observationScope ||
        first.mealPeriod !== second.mealPeriod ||
        first.hktWeekday !== second.hktWeekday ||
        !sameJson(
          menuSnapshotComparisonContext(first.scopeEvidence),
          menuSnapshotComparisonContext(second.scopeEvidence),
        )
      ) {
        throw new Error("MENU_SYNC_SNAPSHOT_WINDOW_MISMATCH");
      }

      const items = await tx
        .select()
        .from(canteenMenuSyncSnapshotItems)
        .where(
          inArray(canteenMenuSyncSnapshotItems.runId, [olderRunId, newerRunId]),
        )
        .orderBy(
          asc(canteenMenuSyncSnapshotItems.sortOrder),
          asc(canteenMenuSyncSnapshotItems.externalProductId),
        );
      const older = new Map(
        items
          .filter((item) => item.runId === olderRunId)
          .map((item) => [item.externalProductId, item]),
      );
      const newer = new Map(
        items
          .filter((item) => item.runId === newerRunId)
          .map((item) => [item.externalProductId, item]),
      );
      const added: SnapshotItem[] = [];
      const missing: SnapshotItem[] = [];
      const changed: MenuSyncSnapshotComparison["changed"] = [];

      for (const [externalProductId, after] of newer) {
        const before = older.get(externalProductId);
        if (!before) {
          added.push(after);
          continue;
        }
        const fields = changedFields(before, after);
        if (fields.length > 0) {
          changed.push({ externalProductId, fields, before, after });
        }
      }
      for (const [externalProductId, before] of older) {
        if (!newer.has(externalProductId)) missing.push(before);
      }
      return {
        sourceId,
        olderRunId,
        newerRunId,
        added,
        missing,
        changed,
      };
    },
    { isolationLevel: "repeatable read", accessMode: "read only" },
  );
}
