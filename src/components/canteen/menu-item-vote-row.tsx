"use client";

import { useState, useTransition } from "react";
import type {
  CanteenMenuItem,
  MealPeriod,
  MenuItemVoteCounts,
  VoteChoice,
} from "@/lib/canteen-types";
import { upsertDishVote } from "@/lib/canteen-vote-actions";
import { DishSvgIcon } from "@/components/canteen/dish-svg-icon";
import { MealPeriodBadge } from "@/components/canteen/meal-period-badge";
import { MenuItemCommentPanel } from "@/components/canteen/menu-item-comment-panel";
import { cn } from "@/lib/utils";

const PERIOD_ACCENT: Record<MealPeriod, string> = {
  breakfast: "from-[var(--canteen-morning)]",
  lunch: "from-[var(--canteen-noon)]",
  dinner: "from-[var(--canteen-evening)]",
};

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
};

export function MenuItemVoteRow({
  item,
  counts,
  myVote,
  onVoteChange,
  currentUserId = null,
  commentBlocked = null,
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
        "group relative flex flex-wrap items-center gap-3 rounded-xl border border-[var(--canteen-bamboo)]/20 bg-white/60 px-4 py-3 transition-colors hover:bg-white/90 sm:flex-nowrap sm:gap-4",
        pending && "opacity-80",
      )}
    >
      <div
        className={cn(
          "absolute inset-y-2 left-0 w-1 rounded-full bg-gradient-to-b to-transparent opacity-70",
          PERIOD_ACCENT[item.mealPeriod],
        )}
        aria-hidden
      />
      <DishSvgIcon svgKey={item.svgKey} className="ml-2 size-11 rounded-xl" />
      <div className="min-w-0 flex-1 basis-[calc(100%-4rem)] sm:basis-auto">
        <p className="font-medium text-[var(--canteen-ink)]">{item.name}</p>
        <MealPeriodBadge period={item.mealPeriod} className="mt-1" />
        {error ? (
          <p className="mt-1 text-xs text-red-600" role="alert">
            {error}
          </p>
        ) : null}
        <MenuItemCommentPanel
          menuItemId={item.id}
          currentUserId={currentUserId}
          commentBlocked={commentBlocked}
        />
      </div>
      <p className="shrink-0 font-mono text-sm font-medium tabular-nums text-[var(--canteen-purple)]">
        {item.price != null ? `$${item.price}` : "—"}
      </p>
      <div className="flex w-full shrink-0 items-center justify-end gap-2 sm:w-auto">
        <button
          type="button"
          aria-label="点赞"
          aria-pressed={myVote === "like"}
          disabled={pending}
          onClick={() => handleVote("like")}
          className={cn(
            "inline-flex min-h-11 min-w-11 items-center justify-center gap-1 rounded-full border px-3 text-sm transition-colors",
            myVote === "like"
              ? "border-[var(--canteen-noon)] bg-[var(--canteen-noon)]/15 text-[var(--canteen-noon)]"
              : "border-[var(--canteen-bamboo)]/30 bg-white/80 text-[var(--canteen-muted)] hover:border-[var(--canteen-noon)]/40",
          )}
        >
          <span aria-hidden>👍</span>
          <span className="tabular-nums">{counts.likes}</span>
        </button>
        <button
          type="button"
          aria-label="点踩"
          aria-pressed={myVote === "dislike"}
          disabled={pending}
          onClick={() => handleVote("dislike")}
          className={cn(
            "inline-flex min-h-11 min-w-11 items-center justify-center gap-1 rounded-full border px-3 text-sm transition-colors",
            myVote === "dislike"
              ? "border-[var(--canteen-purple)] bg-[var(--canteen-purple)]/10 text-[var(--canteen-purple)]"
              : "border-[var(--canteen-bamboo)]/30 bg-white/80 text-[var(--canteen-muted)] hover:border-[var(--canteen-purple)]/30",
          )}
        >
          <span aria-hidden>👎</span>
          <span className="tabular-nums">{counts.dislikes}</span>
        </button>
      </div>
    </li>
  );
}
