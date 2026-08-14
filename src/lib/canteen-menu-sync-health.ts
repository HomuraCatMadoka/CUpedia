import { db } from "@/db";
import {
  type CanteenMenuSyncRunStatus,
  canteenMenuItems,
  canteenMenuSources,
  canteenMenuSyncRuns,
  canteens,
} from "@/db/schema";
import { requireAdmin } from "@/lib/auth-guard";
import { normalizeSyncErrorCode } from "@/lib/sync-error-code";
import { eq, sql } from "drizzle-orm";

export const CANTEEN_MENU_SUCCESS_OVERDUE_AFTER_MS = 48 * 60 * 60 * 1_000;
export const CANTEEN_MENU_UNFINISHED_AFTER_MS = 5 * 60 * 1_000;
export const CANTEEN_MENU_HEALTH_RUNS_PER_SOURCE = 5;
const MAX_ERROR_CODE_LENGTH = 80;

export type AdminCanteenMenuSyncRun = {
  id: string;
  status: CanteenMenuSyncRunStatus;
  itemCount: number | null;
  createdCount: number | null;
  updatedCount: number | null;
  deactivatedCount: number | null;
  errorCode: string | null;
  startedAt: Date;
  completedAt: Date | null;
};

export type AdminCanteenMenuSourceHealth = {
  id: string;
  canteenId: string;
  canteenName: string;
  provider: string;
  externalOwnerId: string | null;
  externalStoreId: string;
  enabled: boolean;
  managedItemCount: number;
  manualItemCount: number;
  legacyTakeoverAt: Date | null;
  lastAttemptAt: Date | null;
  lastSuccessAt: Date | null;
  lastErrorCode: string | null;
  hasOverdueRun: boolean;
  recentRuns: AdminCanteenMenuSyncRun[];
};

function boundedErrorCode(value: string | null): string | null {
  if (!value) return null;
  return normalizeSyncErrorCode(value).slice(0, MAX_ERROR_CODE_LENGTH);
}

export async function adminListCanteenMenuSourceHealth(
  now = new Date(),
): Promise<AdminCanteenMenuSourceHealth[]> {
  await requireAdmin();

  type RankedRunRow = Omit<
    AdminCanteenMenuSyncRun,
    "startedAt" | "completedAt"
  > & {
    menuSourceId: string;
    runNumber: number;
    hasOverdueRun: boolean;
    startedAt: Date | string;
    completedAt: Date | string | null;
  };
  const overdueBefore = new Date(
    now.getTime() - CANTEEN_MENU_UNFINISHED_AFTER_MS,
  );
  const [sources, runRows] = await db.transaction(
    async (tx) => {
      const sourceRows = await tx
        .select({
          id: canteenMenuSources.id,
          canteenId: canteenMenuSources.canteenId,
          canteenName: canteens.name,
          provider: canteenMenuSources.provider,
          externalOwnerId: canteenMenuSources.externalOwnerId,
          externalStoreId: canteenMenuSources.externalStoreId,
          enabled: canteenMenuSources.enabled,
          legacyTakeoverAt: canteenMenuSources.legacyTakeoverAt,
          lastAttemptAt: canteenMenuSources.lastAttemptAt,
          lastSuccessAt: canteenMenuSources.lastSuccessAt,
          lastErrorCode: canteenMenuSources.lastErrorCode,
          managedItemCount: sql<number>`count(*) filter (where ${canteenMenuItems.menuSourceId} = ${canteenMenuSources.id})::int`,
          manualItemCount: sql<number>`count(*) filter (where ${canteenMenuItems.id} is not null and ${canteenMenuItems.menuSourceId} is null)::int`,
        })
        .from(canteenMenuSources)
        .innerJoin(canteens, eq(canteens.id, canteenMenuSources.canteenId))
        .leftJoin(
          canteenMenuItems,
          eq(canteenMenuItems.canteenId, canteenMenuSources.canteenId),
        )
        .groupBy(canteenMenuSources.id, canteens.id)
        .orderBy(canteens.name, canteenMenuSources.createdAt);

      const runsResult = await tx.execute<RankedRunRow>(sql`
        with ranked_runs as (
          select
            id,
            menu_source_id,
            status,
            item_count,
            created_count,
            updated_count,
            deactivated_count,
            error_code,
            started_at,
            completed_at,
            row_number() over (
              partition by menu_source_id
              order by started_at desc
            )::int as run_number
          from ${canteenMenuSyncRuns}
        ),
        overdue_sources as (
          select distinct menu_source_id
          from ${canteenMenuSyncRuns}
          where status = 'running' and started_at < ${overdueBefore}
        )
        select
          id,
          menu_source_id as "menuSourceId",
          status,
          item_count as "itemCount",
          created_count as "createdCount",
          updated_count as "updatedCount",
          deactivated_count as "deactivatedCount",
          error_code as "errorCode",
          started_at as "startedAt",
          completed_at as "completedAt",
          run_number as "runNumber",
          (overdue_sources.menu_source_id is not null) as "hasOverdueRun"
        from ranked_runs
        left join overdue_sources using (menu_source_id)
        where run_number <= ${CANTEEN_MENU_HEALTH_RUNS_PER_SOURCE}
        order by menu_source_id, started_at desc
      `);
      return [
        sourceRows,
        (runsResult.rows ?? runsResult) as RankedRunRow[],
      ] as const;
    },
    { isolationLevel: "repeatable read", accessMode: "read only" },
  );

  const runsBySource = new Map<string, AdminCanteenMenuSyncRun[]>();
  const overdueSourceIds = new Set<string>();
  for (const run of runRows) {
    if (run.hasOverdueRun) overdueSourceIds.add(run.menuSourceId);

    const recentRuns = runsBySource.get(run.menuSourceId) ?? [];
    recentRuns.push({
      id: run.id,
      status: run.status,
      itemCount: run.itemCount,
      createdCount: run.createdCount,
      updatedCount: run.updatedCount,
      deactivatedCount: run.deactivatedCount,
      errorCode: boundedErrorCode(run.errorCode),
      startedAt:
        run.startedAt instanceof Date ? run.startedAt : new Date(run.startedAt),
      completedAt:
        run.completedAt === null || run.completedAt instanceof Date
          ? run.completedAt
          : new Date(run.completedAt),
    });
    runsBySource.set(run.menuSourceId, recentRuns);
  }

  return sources.map((source) => {
    const recentRunsForSource = runsBySource.get(source.id) ?? [];
    const result: AdminCanteenMenuSourceHealth = {
      id: source.id,
      canteenId: source.canteenId,
      canteenName: source.canteenName,
      provider: source.provider,
      externalOwnerId: source.externalOwnerId,
      externalStoreId: source.externalStoreId,
      enabled: source.enabled,
      managedItemCount: source.managedItemCount,
      manualItemCount: source.manualItemCount,
      legacyTakeoverAt: source.legacyTakeoverAt,
      lastAttemptAt: source.lastAttemptAt,
      lastSuccessAt: source.lastSuccessAt,
      lastErrorCode: boundedErrorCode(source.lastErrorCode),
      recentRuns: recentRunsForSource,
      hasOverdueRun: overdueSourceIds.has(source.id),
    };
    return result;
  });
}
