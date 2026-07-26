"use client";

import { Crown } from "lucide-react";
import type { RankedDish } from "@/lib/canteen-rankings";
import type { VoteChoice } from "@/lib/canteen-types";
import { DishSvgIcon } from "./dish-svg-icon";
import { DishVoteButtons } from "./dish-vote-buttons";
import { MenuItemCommentPanel } from "./menu-item-comment-panel";
import { MenuItemPrice } from "./menu-item-price";
import { useDishVote } from "./use-dish-vote";
import { cn } from "@/lib/utils";

export function CanteenRankingRow({
  rank,
  entry,
  emphasis,
  myVote,
  onVoteChange,
  currentUserId = null,
  commentBlocked = null,
  initialCommentCount = 0,
}: {
  rank: number;
  entry: RankedDish;
  emphasis: "recommend" | "avoid";
  myVote: VoteChoice;
  onVoteChange: (
    itemId: string,
    prevVote: VoteChoice,
    nextVote: VoteChoice,
  ) => void;
  currentUserId?: string | null;
  commentBlocked?: "banned" | null;
  initialCommentCount?: number;
}) {
  const { item, counts } = entry;
  const { error, pending, handleVote } = useDishVote(
    item.id,
    myVote,
    onVoteChange,
  );
  const isTop = rank === 1;

  return (
    <li
      className={cn(
        "canteen-ledger-row flex flex-wrap items-center gap-2 px-1 py-2 sm:flex-nowrap sm:gap-4 sm:py-3",
        pending && "opacity-80",
      )}
    >
      <span
        className={cn(
          "canteen-display relative flex size-8 shrink-0 items-center justify-center font-mono text-sm font-semibold tabular-nums",
          isTop
            ? emphasis === "recommend"
              ? "text-red-600"
              : "text-black"
            : "text-[var(--canteen-muted)]",
        )}
        aria-hidden
      >
        {isTop && emphasis === "recommend" ? (
          <Crown
            className="absolute -top-2.5 left-1/2 size-3.5 -translate-x-1/2 text-amber-500"
            strokeWidth={2.4}
            fill="currentColor"
            aria-hidden
          />
        ) : null}
        {isTop && emphasis === "avoid" ? (
          <span
            className="absolute -top-2.5 left-1/2 -translate-x-1/2 text-[0.7rem] leading-none"
            aria-hidden
          >
            💩
          </span>
        ) : null}
        {rank}
      </span>
      <DishSvgIcon svgKey={item.svgKey} className="size-8 rounded-md sm:size-10" />
      <div className="min-w-0 flex-1">
        <p className="min-w-0 text-sm font-medium text-[var(--canteen-ink)] sm:text-base">
          {item.name}
        </p>
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
        className="shrink-0 self-center justify-end font-mono text-xs tabular-nums text-[var(--canteen-ink)] sm:max-w-52 sm:text-sm"
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
