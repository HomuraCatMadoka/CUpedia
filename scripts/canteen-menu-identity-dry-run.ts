import { db } from "@/db";
import {
  canteenDishComments,
  canteenDishVotes,
  canteenMenuSources,
  canteenMenuItems,
  canteenMenuProviderOfferings,
  canteens,
} from "@/db/schema";
import { buildCanonicalIdentityDryRunReport } from "@/lib/canteen-menu-identity-dry-run";
import { eq, inArray, isNotNull, sql } from "drizzle-orm";

async function main(): Promise<void> {
  const report = await db.transaction(async (tx) => {
    await tx.execute(sql`set transaction read only`);
    const items = await tx
      .select({
        id: canteenMenuItems.id,
        canteenId: canteenMenuItems.canteenId,
        canteenName: canteens.name,
        menuSourceId: canteenMenuItems.menuSourceId,
        provider: canteenMenuSources.provider,
        externalStoreId: canteenMenuSources.externalStoreId,
        externalProductId: canteenMenuItems.externalProductId,
        name: canteenMenuItems.name,
        normalizedName: canteenMenuItems.normalizedName,
        isAvailable: canteenMenuItems.isAvailable,
        createdAt: canteenMenuItems.createdAt,
      })
      .from(canteenMenuItems)
      .innerJoin(
        canteenMenuSources,
        eq(canteenMenuSources.id, canteenMenuItems.menuSourceId),
      )
      .innerJoin(canteens, eq(canteens.id, canteenMenuItems.canteenId))
      .where(isNotNull(canteenMenuItems.menuSourceId));
    const itemIds = items.map((item) => item.id);
    const [offerings, comments, votes] =
      itemIds.length === 0
        ? [[], [], []]
        : await Promise.all([
            tx
              .select({
                menuItemId: canteenMenuProviderOfferings.menuItemId,
                externalProductId:
                  canteenMenuProviderOfferings.externalProductId,
              })
              .from(canteenMenuProviderOfferings)
              .where(inArray(canteenMenuProviderOfferings.menuItemId, itemIds)),
            tx
              .select({
                id: canteenDishComments.id,
                menuItemId: canteenDishComments.menuItemId,
              })
              .from(canteenDishComments)
              .where(inArray(canteenDishComments.menuItemId, itemIds)),
            tx
              .select({
                id: canteenDishVotes.id,
                menuItemId: canteenDishVotes.menuItemId,
                userId: canteenDishVotes.userId,
                anonymousSessionId: canteenDishVotes.anonymousSessionId,
                vote: canteenDishVotes.vote,
                createdAt: canteenDishVotes.createdAt,
                updatedAt: canteenDishVotes.updatedAt,
              })
              .from(canteenDishVotes)
              .where(inArray(canteenDishVotes.menuItemId, itemIds)),
          ]);
    return buildCanonicalIdentityDryRunReport({
      generatedAt: new Date(),
      items,
      offerings,
      comments,
      votes,
    });
  });
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
