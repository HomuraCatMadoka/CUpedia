"use client";

import { ThumbsDown, ThumbsUp } from "lucide-react";
import type { MenuItemVoteCounts, VoteChoice } from "@/lib/canteen-types";
import { cn } from "@/lib/utils";

export function DishVoteButtons({
  counts,
  myVote,
  pending = false,
  onVote,
  className,
}: {
  counts: MenuItemVoteCounts;
  myVote: VoteChoice;
  pending?: boolean;
  onVote: (choice: "like" | "dislike") => void;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "canteen-vote-group flex w-full shrink-0 items-center justify-end sm:ml-auto sm:w-auto",
        className,
      )}
      role="group"
      aria-label="投票"
    >
      <button
        type="button"
        aria-label="点赞"
        aria-pressed={myVote === "like"}
        disabled={pending}
        onClick={() => onVote("like")}
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
        <span className="tabular-nums">{counts.likes}</span>
      </button>
      <button
        type="button"
        aria-label="点踩"
        aria-pressed={myVote === "dislike"}
        disabled={pending}
        onClick={() => onVote("dislike")}
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
        <span className="tabular-nums">{counts.dislikes}</span>
      </button>
    </div>
  );
}
