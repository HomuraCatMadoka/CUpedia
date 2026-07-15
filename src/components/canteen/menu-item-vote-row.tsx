"use client";

import { useState, useTransition } from "react";
import { ThumbsDown, ThumbsUp } from "lucide-react";
import type {
  CanteenMenuItem,
  MenuItemVoteCounts,
  VoteChoice,
} from "@/lib/canteen-types";
import { upsertDishVote } from "@/lib/canteen-vote-actions";
import { DishSvgIcon } from "@/components/canteen/dish-svg-icon";
import { MealPeriodBadge } from "@/components/canteen/meal-period-badge";
import { MenuItemCommentPanel } from "@/components/canteen/menu-item-comment-panel";
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
};

export function MenuItemVoteRow({
  item,
  counts,
  myVote,
  onVoteChange,
  currentUserId = null,
  commentBlocked = null,
  initialCommentCount = 0,
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
        "canteen-ledger-row flex flex-wrap items-center gap-3 px-1 py-3 sm:flex-nowrap sm:gap-4",
        pending && "opacity-80",
      )}
    >
      <DishSvgIcon svgKey={item.svgKey} className="size-11 rounded-md" />
      <div className="min-w-0 flex-1 basis-[calc(100%-4rem)] sm:basis-auto">
        <p className="font-medium text-[var(--canteen-ink)]">{item.name}</p>
        <MealPeriodBadge period={item.mealPeriod} className="mt-1" />
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
      <p className="shrink-0 font-mono text-sm font-medium tabular-nums text-[var(--canteen-ink)]">
        {item.price != null ? `$${item.price}` : "—"}
      </p>
      <div
        className="flex w-full shrink-0 items-center justify-end gap-2 sm:w-auto"
        role="group"
        aria-label="投票"
      >
        <button
          type="button"
          aria-label="点赞"
          aria-pressed={myVote === "like"}
          disabled={pending}
          onClick={() => handleVote("like")}
          className={cn(
            "canteen-vote-btn",
            myVote === "like" && "canteen-vote-btn-like-on",
          )}
        >
          <ThumbsUp
            className="size-4 shrink-0"
            strokeWidth={myVote === "like" ? 2.4 : 2}
            aria-hidden
          />
          <span>赞</span>
          <span className="font-mono tabular-nums">{counts.likes}</span>
        </button>
        <button
          type="button"
          aria-label="点踩"
          aria-pressed={myVote === "dislike"}
          disabled={pending}
          onClick={() => handleVote("dislike")}
          className={cn(
            "canteen-vote-btn",
            myVote === "dislike" && "canteen-vote-btn-dislike-on",
          )}
        >
          <ThumbsDown
            className="size-4 shrink-0"
            strokeWidth={myVote === "dislike" ? 2.4 : 2}
            aria-hidden
          />
          <span>踩</span>
          <span className="font-mono tabular-nums">{counts.dislikes}</span>
        </button>
      </div>
    </li>
  );
}
