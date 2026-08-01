"use client";

import { memo } from "react";
import { ChevronRight } from "lucide-react";
import type {
  CanteenMenuItem,
  MenuItemVoteCounts,
  VoteChoice,
} from "@/lib/canteen-types";
import { DishVoteButtons } from "./dish-vote-buttons";
import { MealPeriodsBadges } from "./meal-period-badge";
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
  initialCommentCount?: number;
  showPeriodBadge?: boolean;
  onOpenDetails: (item: CanteenMenuItem) => void;
};

export const MenuItemVoteRow = memo(function MenuItemVoteRow({
  item,
  counts,
  myVote,
  onVoteChange,
  initialCommentCount = 0,
  showPeriodBadge = true,
  onOpenDetails,
}: MenuItemVoteRowProps) {
  const { error, pending, handleVote } = useDishVote(
    item.id,
    myVote,
    onVoteChange,
  );
  const showSpecialPeriod =
    showPeriodBadge &&
    (item.mealPeriods.includes("allday") || item.mealPeriods.length > 1);

  return (
    <li
      id={`canteen-menu-item-${item.id}`}
      data-menu-item-id={item.id}
      tabIndex={-1}
      className={cn("canteen-menu-item px-3", pending && "opacity-80")}
    >
      <div className="canteen-menu-item-body min-w-0">
        <button
          type="button"
          aria-haspopup="dialog"
          aria-describedby={`canteen-menu-meta-${item.id}`}
          onClick={() => onOpenDetails(item)}
          className="canteen-dish-trigger block w-full min-w-0 text-left"
        >
          <span className="flex min-w-0 items-center justify-between gap-3">
            <span className="min-w-0 flex-1 text-pretty break-words text-[0.9375rem] font-semibold leading-5 text-[var(--canteen-ink)]">
              {item.name}
            </span>
            <span className="flex shrink-0 items-center gap-0.5">
              <MenuItemPrice
                pricing={item.pricing}
                variant="summary"
                showOptionCount={false}
                className="justify-end text-sm font-semibold tabular-nums text-[var(--canteen-ink)]"
              />
              <ChevronRight
                className="size-3.5 text-[var(--canteen-muted)]"
                strokeWidth={1.75}
                aria-hidden
              />
            </span>
          </span>
          {showSpecialPeriod ? (
            <MealPeriodsBadges
              periods={item.mealPeriods}
              className="mt-0.5 sm:mt-1"
            />
          ) : null}
          <span className="sr-only">打开详情</span>
        </button>
        {error ? (
          <p className="mt-1 text-xs text-red-700" role="alert">
            {error}
          </p>
        ) : null}
        <div className="canteen-menu-item-footer">
          <span
            id={`canteen-menu-meta-${item.id}`}
            aria-label={`评论 ${initialCommentCount}`}
            className={cn(
              "text-xs leading-[1.125rem] text-[var(--canteen-muted)]",
              initialCommentCount === 0 && "sr-only",
            )}
          >
            {initialCommentCount > 0
              ? `${initialCommentCount} 条评价`
              : "暂无评价"}
          </span>
          <DishVoteButtons
            counts={counts}
            myVote={myVote}
            pending={pending}
            onVote={handleVote}
            className="canteen-menu-votes w-auto gap-0 sm:ml-0"
          />
        </div>
      </div>
    </li>
  );
});
