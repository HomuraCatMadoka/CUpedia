"use client";

import { useState, useTransition } from "react";
import type {
  CanteenMenuItem,
  MenuItemVoteCounts,
  VoteChoice,
} from "@/lib/canteen-types";
import { upsertDishVote } from "@/lib/canteen-vote-actions";
import { DishSvgIcon } from "@/components/canteen/dish-svg-icon";
import { DishVoteButtons } from "@/components/canteen/dish-vote-buttons";
import { MealPeriodBadge } from "@/components/canteen/meal-period-badge";
import { MenuItemCommentPanel } from "@/components/canteen/menu-item-comment-panel";
import { MenuItemPrice } from "@/components/canteen/menu-item-price";
import { cn } from "@/lib/utils";

function voteErrorMessage(code: string): string {
  if (code === "ANON_SESSION_REQUIRED") return "投票需允许 Cookie";
  if (code === "USER_BANNED") return "账号已封禁，无法投票";
  if (code === "RATE_LIMIT_EXCEEDED") return "操作太频繁，请稍后再试";
  return "投票失败，请重试";
}

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
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleVote(choice: "like" | "dislike") {
    const nextVote: VoteChoice = myVote === choice ? null : choice;
    const prevVote = myVote;

    onVoteChange(item.id, prevVote, nextVote);
    setError(null);

    startTransition(async () => {
      try {
        await upsertDishVote(item.id, nextVote);
      } catch (err) {
        onVoteChange(item.id, nextVote, prevVote);
        const code = err instanceof Error ? err.message : "VOTE_FAILED";
        setError(voteErrorMessage(code));
      }
    });
  }

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
          <MealPeriodBadge period={item.mealPeriod} className="mt-0.5 sm:mt-1" />
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
