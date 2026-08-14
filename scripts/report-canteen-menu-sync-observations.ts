import { db } from "../src/db";
import {
  canteenMenuSources,
  canteenMenuSyncRuns,
  canteens,
} from "../src/db/schema";
import { desc, eq, gte } from "drizzle-orm";

function daysArgument(): number {
  const index = process.argv.indexOf("--days");
  const raw = index === -1 ? "14" : process.argv[index + 1];
  const days = Number(raw);
  if (!Number.isInteger(days) || days < 1 || days > 90) {
    throw new Error("--days must be an integer from 1 to 90");
  }
  return days;
}

async function main() {
  const days = daysArgument();
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1_000);
  const rows = await db
    .select({
      runId: canteenMenuSyncRuns.id,
      canteenId: canteens.id,
      canteenName: canteens.name,
      sourceId: canteenMenuSources.id,
      provider: canteenMenuSources.provider,
      externalStoreId: canteenMenuSources.externalStoreId,
      status: canteenMenuSyncRuns.status,
      itemCount: canteenMenuSyncRuns.itemCount,
      createdCount: canteenMenuSyncRuns.createdCount,
      deactivatedCount: canteenMenuSyncRuns.deactivatedCount,
      observation: canteenMenuSyncRuns.observation,
      errorCode: canteenMenuSyncRuns.errorCode,
      startedAt: canteenMenuSyncRuns.startedAt,
    })
    .from(canteenMenuSyncRuns)
    .innerJoin(
      canteenMenuSources,
      eq(canteenMenuSources.id, canteenMenuSyncRuns.menuSourceId),
    )
    .innerJoin(canteens, eq(canteens.id, canteenMenuSources.canteenId))
    .where(gte(canteenMenuSyncRuns.startedAt, since))
    .orderBy(desc(canteenMenuSyncRuns.startedAt));

  const bySource = new Map<
    string,
    {
      canteenId: string;
      canteenName: string;
      sourceId: string;
      provider: string;
      externalStoreId: string;
      runs: number;
      applied: number;
      unchanged: number;
      failed: number;
      identityChurnFailures: number;
      maxCreated: number;
      maxDeactivated: number;
    }
  >();
  for (const row of rows) {
    const summary = bySource.get(row.sourceId) ?? {
      canteenId: row.canteenId,
      canteenName: row.canteenName,
      sourceId: row.sourceId,
      provider: row.provider,
      externalStoreId: row.externalStoreId,
      runs: 0,
      applied: 0,
      unchanged: 0,
      failed: 0,
      identityChurnFailures: 0,
      maxCreated: 0,
      maxDeactivated: 0,
    };
    summary.runs += 1;
    if (row.status === "applied") summary.applied += 1;
    if (row.status === "unchanged") summary.unchanged += 1;
    if (row.status === "failed") summary.failed += 1;
    if (row.errorCode === "MENU_SYNC_IDENTITY_CHURN") {
      summary.identityChurnFailures += 1;
    }
    summary.maxCreated = Math.max(summary.maxCreated, row.createdCount ?? 0);
    summary.maxDeactivated = Math.max(
      summary.maxDeactivated,
      row.deactivatedCount ?? 0,
    );
    bySource.set(row.sourceId, summary);
  }

  const flaggedRuns = rows
    .filter(
      (row) =>
        row.errorCode === "MENU_SYNC_IDENTITY_CHURN" ||
        row.errorCode === "MENU_SYNC_SUSPICIOUS_DROP",
    )
    .map((row) => ({
      runId: row.runId,
      canteenName: row.canteenName,
      sourceId: row.sourceId,
      status: row.status,
      errorCode: row.errorCode,
      itemCount: row.itemCount,
      observation: row.observation,
      startedAt: row.startedAt,
    }));

  process.stdout.write(
    `${JSON.stringify(
      {
        window: { days, since, generatedAt: new Date() },
        sources: [...bySource.values()],
        flaggedRuns,
      },
      null,
      2,
    )}\n`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
