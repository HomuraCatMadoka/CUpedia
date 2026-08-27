import {
  canteenDishComments,
  canteenDishVotes,
  canteenMenuItems,
  canteenMenuProviderOfferings,
  canteenMenuSources,
  canteens,
} from "@/db/schema";
import { eq, inArray, isNotNull } from "drizzle-orm";
import {
  buildCanonicalIdentityDryRunReport,
  type CanonicalIdentityDryRunComment,
  type CanonicalIdentityDryRunItem,
  type CanonicalIdentityDryRunOffering,
  type CanonicalIdentityDryRunVote,
} from "./canteen-menu-identity-dry-run";
import type { MenuSyncTransaction } from "./canteen-menu-sync-store";

/** Builds the reviewed rollout plan inside the caller's transaction. */
export async function readCanonicalIdentityDryRunReport(
  tx: MenuSyncTransaction,
  generatedAt: Date,
) {
  const items: CanonicalIdentityDryRunItem[] = await tx
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
  const [offerings, comments, votes]: [
    CanonicalIdentityDryRunOffering[],
    CanonicalIdentityDryRunComment[],
    CanonicalIdentityDryRunVote[],
  ] =
    itemIds.length === 0
      ? [[], [], []]
      : await Promise.all([
          tx
            .select({
              menuItemId: canteenMenuProviderOfferings.menuItemId,
              externalProductId: canteenMenuProviderOfferings.externalProductId,
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
    generatedAt,
    items,
    offerings,
    comments,
    votes,
  });
}
