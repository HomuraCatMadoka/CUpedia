import { createHash } from "node:crypto";
import { normalizeCanonicalDishName } from "./canteen-menu-canonicalization";

export type CanonicalIdentityDryRunItem = {
  id: string;
  canteenId: string;
  menuSourceId: string | null;
  name: string;
  canteenName?: string;
  provider?: string;
  externalStoreId?: string;
  externalProductId?: string | null;
  normalizedName: string | null;
  isAvailable: boolean;
  createdAt: Date;
};

export type CanonicalIdentityDryRunOffering = {
  menuItemId: string;
  externalProductId: string;
};

export type CanonicalIdentityDryRunComment = {
  id: string;
  menuItemId: string;
};

export type CanonicalIdentityDryRunVote = {
  id: string;
  menuItemId: string;
  userId: string | null;
  anonymousSessionId: string | null;
  vote: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type BuildCanonicalIdentityDryRunInput = {
  generatedAt: Date;
  items: readonly CanonicalIdentityDryRunItem[];
  offerings: readonly CanonicalIdentityDryRunOffering[];
  comments: readonly CanonicalIdentityDryRunComment[];
  votes: readonly CanonicalIdentityDryRunVote[];
};

function actorKey(vote: CanonicalIdentityDryRunVote): string {
  return vote.userId
    ? `user:${vote.userId}`
    : `anonymous:${vote.anonymousSessionId}`;
}

function compareLatestVote(
  left: CanonicalIdentityDryRunVote,
  right: CanonicalIdentityDryRunVote,
): number {
  return (
    right.updatedAt.getTime() - left.updatedAt.getTime() ||
    right.createdAt.getTime() - left.createdAt.getTime() ||
    right.id.localeCompare(left.id)
  );
}

export function buildCanonicalIdentityDryRunReport({
  generatedAt,
  items,
  offerings,
  comments,
  votes,
}: BuildCanonicalIdentityDryRunInput) {
  const groups = new Map<string, CanonicalIdentityDryRunItem[]>();
  for (const item of items) {
    if (!item.menuSourceId) continue;
    const normalizedName =
      item.normalizedName ?? normalizeCanonicalDishName(item.name);
    const key = `${item.canteenId}\u0000${item.menuSourceId}\u0000${normalizedName}`;
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }

  const reportGroups = [...groups.entries()]
    .filter(([, grouped]) => grouped.length > 1)
    .map(([key, grouped]) => {
      const [, , normalizedName] = key.split("\u0000");
      const ordered = [...grouped].sort(
        (left, right) =>
          left.createdAt.getTime() - right.createdAt.getTime() ||
          left.id.localeCompare(right.id),
      );
      const survivor = ordered[0];
      const mergedItemIds = ordered.slice(1).map((item) => item.id);
      const allItemIds = new Set(ordered.map((item) => item.id));
      const groupVotes = votes.filter((vote) =>
        allItemIds.has(vote.menuItemId),
      );
      const votesByActor = new Map<string, CanonicalIdentityDryRunVote[]>();
      for (const vote of groupVotes) {
        const actor = actorKey(vote);
        votesByActor.set(actor, [...(votesByActor.get(actor) ?? []), vote]);
      }
      let duplicateVoteActors = 0;
      let conflictingVoteActors = 0;
      let voteRowsDeleted = 0;
      let voteRowsMoved = 0;
      for (const actorVotes of votesByActor.values()) {
        if (actorVotes.length > 1) duplicateVoteActors += 1;
        if (new Set(actorVotes.map((vote) => vote.vote)).size > 1) {
          conflictingVoteActors += 1;
        }
        voteRowsDeleted += Math.max(0, actorVotes.length - 1);
        const keeper = [...actorVotes].sort(compareLatestVote)[0];
        if (keeper && keeper.menuItemId !== survivor.id) voteRowsMoved += 1;
      }
      return {
        canteenId: survivor.canteenId,
        ...(survivor.canteenName ? { canteenName: survivor.canteenName } : {}),
        menuSourceId: survivor.menuSourceId!,
        ...(survivor.provider ? { provider: survivor.provider } : {}),
        ...(survivor.externalStoreId
          ? { externalStoreId: survivor.externalStoreId }
          : {}),
        normalizedName,
        survivorItemId: survivor.id,
        mergedItemIds,
        externalProductIds: [
          ...new Set([
            ...offerings
              .filter((offering) => allItemIds.has(offering.menuItemId))
              .map((offering) => offering.externalProductId),
            ...ordered.flatMap((item) =>
              item.externalProductId ? [item.externalProductId] : [],
            ),
          ]),
        ].sort(),
        activeRowsBefore: ordered.filter((item) => item.isAvailable).length,
        inactiveRowsBefore: ordered.filter((item) => !item.isAvailable).length,
        commentsMoved: comments.filter((comment) =>
          mergedItemIds.includes(comment.menuItemId),
        ).length,
        voteRowsBefore: groupVotes.length,
        duplicateVoteActors,
        conflictingVoteActors,
        voteRowsDeleted,
        voteRowsMoved,
      };
    })
    .sort(
      (left, right) =>
        left.canteenId.localeCompare(right.canteenId) ||
        left.normalizedName.localeCompare(right.normalizedName),
    );

  const fingerprint = createHash("sha256")
    .update(JSON.stringify(reportGroups))
    .digest("hex");
  return {
    generatedAt: generatedAt.toISOString(),
    mode: "read-only" as const,
    fingerprint,
    mergeGroupCount: reportGroups.length,
    groups: reportGroups,
    totals: {
      retiredItems: reportGroups.reduce(
        (total, group) => total + group.mergedItemIds.length,
        0,
      ),
      commentsMoved: reportGroups.reduce(
        (total, group) => total + group.commentsMoved,
        0,
      ),
      voteRowsDeleted: reportGroups.reduce(
        (total, group) => total + group.voteRowsDeleted,
        0,
      ),
      voteRowsMoved: reportGroups.reduce(
        (total, group) => total + group.voteRowsMoved,
        0,
      ),
    },
  };
}
