import { db } from "@/db";
import {
  canteenDishComments,
  canteenDishVotes,
  canteenMenuIdentityTransitions,
  canteenMenuItems,
  canteenMenuProviderOfferings,
  canteenMenuSources,
  canteens,
} from "@/db/schema";
import {
  buildMenuInvariantReport,
  type MenuInvariantPeriodObservation,
} from "@/lib/canteen-menu-invariants";
import {
  readLatestAcceptedMenuPeriodItems,
  readLatestAcceptedMenuPeriodObservations,
} from "@/lib/canteen-menu-sync-snapshots";
import { count, eq, sql } from "drizzle-orm";

async function main(): Promise<void> {
  const report = await db.transaction(async (tx) => {
    await tx.execute(sql`set transaction read only`);
    const evaluatedAt = new Date();
    const sources = await tx
      .select({
        id: canteenMenuSources.id,
        canteenId: canteenMenuSources.canteenId,
        canteenName: canteens.name,
        provider: canteenMenuSources.provider,
        externalStoreId: canteenMenuSources.externalStoreId,
        syncMealPeriods: canteenMenuSources.syncMealPeriods,
        closedWeekdays: canteenMenuSources.closedWeekdays,
        lastErrorCode: canteenMenuSources.lastErrorCode,
        hasLiveClaim: sql<boolean>`${canteenMenuSources.syncClaimToken} is not null and ${canteenMenuSources.syncClaimExpiresAt} > now()`,
      })
      .from(canteenMenuSources)
      .innerJoin(canteens, eq(canteens.id, canteenMenuSources.canteenId))
      .where(eq(canteenMenuSources.enabled, true));
    const items = await tx
      .select({
        id: canteenMenuItems.id,
        canteenId: canteenMenuItems.canteenId,
        menuSourceId: canteenMenuItems.menuSourceId,
        name: canteenMenuItems.name,
        normalizedName: canteenMenuItems.normalizedName,
        mealPeriods: canteenMenuItems.mealPeriods,
        isAvailable: canteenMenuItems.isAvailable,
      })
      .from(canteenMenuItems);
    const offerings = await tx
      .select({
        menuSourceId: canteenMenuProviderOfferings.menuSourceId,
        menuItemId: canteenMenuProviderOfferings.menuItemId,
        externalProductId: canteenMenuProviderOfferings.externalProductId,
      })
      .from(canteenMenuProviderOfferings);
    const itemTotal = await tx
      .select({ value: count() })
      .from(canteenMenuItems);
    const commentTotal = await tx
      .select({ value: count() })
      .from(canteenDishComments);
    const voteTotal = await tx
      .select({ value: count() })
      .from(canteenDishVotes);
    const transitionTotal = await tx
      .select({ value: count() })
      .from(canteenMenuIdentityTransitions);
    const transitions = await tx
      .select({
        menuSourceId: canteenMenuIdentityTransitions.menuSourceId,
        kind: canteenMenuIdentityTransitions.kind,
        fromMenuItemId: canteenMenuIdentityTransitions.fromMenuItemId,
        toMenuItemId: canteenMenuIdentityTransitions.toMenuItemId,
      })
      .from(canteenMenuIdentityTransitions);
    const observations: MenuInvariantPeriodObservation[] = [];
    for (const source of sources) {
      const byPeriod = await readLatestAcceptedMenuPeriodItems(
        tx,
        source.id,
        source.syncMealPeriods,
      );
      const facts = await readLatestAcceptedMenuPeriodObservations(
        tx,
        source.id,
        source.syncMealPeriods,
      );
      for (const mealPeriod of source.syncMealPeriods) {
        const fact = facts[mealPeriod];
        if (!fact) continue;
        observations.push({
          menuSourceId: source.id,
          mealPeriod,
          runId: fact.runId,
          observedAt: fact.observedAt,
          externalProductIds: (byPeriod[mealPeriod] ?? []).map(
            (item) => item.externalProductId,
          ),
        });
      }
    }
    return buildMenuInvariantReport({
      evaluatedAt,
      sources,
      items,
      offerings,
      observations,
      transitions,
      historyTotals: {
        menuItems: itemTotal[0]?.value ?? 0,
        comments: commentTotal[0]?.value ?? 0,
        votes: voteTotal[0]?.value ?? 0,
        identityTransitions: transitionTotal[0]?.value ?? 0,
      },
    });
  });
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (process.argv.includes("--strict") && !report.ok) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "UNKNOWN_ERROR");
  process.exitCode = 1;
});
