"use client";

import { memo } from "react";
import type { RankedDish } from "@/lib/canteen-rankings";
import type { VoteChoice } from "@/lib/canteen-types";
import { DishSvgIcon } from "./dish-svg-icon";
import { DishVoteButtons } from "./dish-vote-buttons";
import { MenuItemPrice } from "./menu-item-price";
import { useDishVote } from "./use-dish-vote";
import { cn } from "@/lib/utils";

export const CanteenRankingRow = memo(function CanteenRankingRow({
  rank,
  entry,
  emphasis,
  myVote,
  onVoteChange,
  initialCommentCount = 0,
  onOpenDetails,
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
  initialCommentCount?: number;
  onOpenDetails: (item: RankedDish["item"]) => void;
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
      id={`canteen-menu-item-${item.id}`}
      data-menu-item-id={item.id}
      tabIndex={-1}
      className={cn(
        "canteen-ranking-row grid grid-cols-[1.5rem_2rem_minmax(0,1fr)] items-start gap-x-2 px-3 py-2",
        pending && "opacity-80",
      )}
    >
      <span
        className={cn(
          "canteen-rank-number flex h-9 items-center justify-center font-mono text-sm font-semibold tabular-nums",
          isTop
            ? emphasis === "recommend"
              ? "text-[#d70015]"
              : "text-[var(--canteen-ink)]"
            : "text-[var(--canteen-muted)]",
        )}
        aria-label={`第 ${rank} 名`}
      >
        {rank}
      </span>
      <DishSvgIcon
        svgKey={item.svgKey}
        className="canteen-menu-icon mt-0.5 size-8 rounded-lg"
      />
      <div className="canteen-menu-item-body min-w-0">
        <button
          type="button"
          aria-haspopup="dialog"
          aria-describedby={`canteen-ranking-meta-${item.id}`}
          onClick={() => onOpenDetails(item)}
          className="canteen-dish-trigger block w-full min-w-0 text-left"
        >
          <span className="flex min-w-0 items-start justify-between gap-2">
            <span className="min-w-0 flex-1 text-[0.9375rem] font-semibold leading-5 text-[var(--canteen-ink)]">
              {item.name}
            </span>
            <MenuItemPrice
              pricing={item.pricing}
              variant="summary"
              showOptionCount={false}
              className="shrink-0 justify-end text-sm font-semibold tabular-nums text-[var(--canteen-ink)]"
            />
          </span>
          <span className="sr-only">打开详情</span>
        </button>
        {error ? (
          <p className="mt-1 text-xs text-red-700" role="alert">
            {error}
          </p>
        ) : null}
        <div className="canteen-menu-item-footer">
          <span
            id={`canteen-ranking-meta-${item.id}`}
            aria-label={`评论 ${initialCommentCount}`}
            className="text-xs leading-[1.125rem] text-[var(--canteen-muted)]"
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
            className="canteen-menu-votes w-auto gap-0"
          />
        </div>
      </div>
    </li>
  );
});
