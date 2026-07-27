"use client";

import type {
  CanteenMenuItem,
  MenuItemVoteCounts,
  VoteChoice,
} from "@/lib/canteen-types";
import { DishSvgIcon } from "./dish-svg-icon";
import { DishVoteButtons } from "./dish-vote-buttons";
import { MealPeriodsBadges } from "./meal-period-badge";
import { MenuItemCommentPanel } from "./menu-item-comment-panel";
import { MenuItemPrice } from "./menu-item-price";
import { useDishVote } from "./use-dish-vote";
import { cn } from "@/lib/utils";

type MenuItemVoteRowProps = {
  item: CanteenMenuItem;
  counts: MenuItemVoteCounts;
  myVote: VoteChoice;
  onVoteChange: (
    itemId: string,
    prevVote: VoteChoice,
    nextVote: VoteChoice,
  ) => void;
  currentUserId?: string | null;
  commentBlocked?: "banned" | null;
  initialCommentCount?: number;
  showPeriodBadge?: boolean;
};

export function MenuItemVoteRow({
  item,
  counts,
  myVote,
  onVoteChange,
  currentUserId = null,
  commentBlocked = null,
  initialCommentCount = 0,
  showPeriodBadge = true,
}: MenuItemVoteRowProps) {
  const { error, pending, handleVote } = useDishVote(
    item.id,
    myVote,
    onVoteChange,
  );

  return (
    <li
      className={cn(
        "canteen-ledger-row flex flex-wrap items-center gap-2 px-1 py-2 sm:flex-nowrap sm:gap-4 sm:py-3",
        pending && "opacity-80",
      )}
    >
      <DishSvgIcon svgKey={item.svgKey} className="size-9 rounded-md sm:size-11" />
      <div className="min-w-0 flex-1">
        <p className="min-w-0 break-words text-sm font-medium text-[var(--canteen-ink)] sm:text-base">
          {item.name}
        </p>
        {showPeriodBadge ? (
          <MealPeriodsBadges
            periods={item.mealPeriods}
            className="mt-0.5 sm:mt-1"
          />
        ) : null}
        {error ? (
          <p className="mt-1 text-xs text-red-700" role="alert">
            {error}
          </p>
        ) : null}
        <MenuItemCommentPanel
          menuItemId={item.id}
          currentUserId={currentUserId}
          commentBlocked={commentBlocked}
          initialCommentCount={initialCommentCount}
        />
      </div>
      <MenuItemPrice
        pricing={item.pricing}
        className="shrink-0 self-center justify-end font-mono text-xs font-medium tabular-nums text-[var(--canteen-ink)] sm:max-w-52 sm:text-sm"
      />
      <DishVoteButtons
        counts={counts}
        myVote={myVote}
        pending={pending}
        onVote={handleVote}
        className="gap-1.5 sm:ml-0 sm:gap-2"
      />
    </li>
  );
}
