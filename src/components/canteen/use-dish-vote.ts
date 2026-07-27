"use client";

import { useState, useTransition } from "react";
import type { VoteChoice } from "@/lib/canteen-types";
import { upsertDishVote } from "@/lib/canteen-vote-actions";
import {
  captureWindowScroll,
  clearPinnedWindowScroll,
  restoreWindowScrollThroughPaint,
} from "@/lib/pin-window-scroll";

function voteErrorMessage(code: string): string {
  if (code === "ANON_SESSION_REQUIRED") return "投票需允许 Cookie";
  if (code === "USER_BANNED") return "账号已封禁，无法投票";
  if (code === "RATE_LIMIT_EXCEEDED") return "操作太频繁，请稍后再试";
  return "投票失败，请重试";
}

/** Optimistic dish vote with rollback on server failure. */
export function useDishVote(
  itemId: string,
  myVote: VoteChoice,
  onVoteChange: (
    itemId: string,
    prevVote: VoteChoice,
    nextVote: VoteChoice,
  ) => void,
) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleVote(choice: "like" | "dislike") {
    const nextVote: VoteChoice = myVote === choice ? null : choice;
    const prevVote = myVote;
    const scrollPath = window.location.pathname;
    const scrollY = captureWindowScroll();

    onVoteChange(itemId, prevVote, nextVote);
    restoreWindowScrollThroughPaint(scrollY);
    setError(null);

    startTransition(async () => {
      try {
        await upsertDishVote(itemId, nextVote);
      } catch (err) {
        onVoteChange(itemId, nextVote, prevVote);
        restoreWindowScrollThroughPaint(scrollY);
        const code = err instanceof Error ? err.message : "VOTE_FAILED";
        setError(voteErrorMessage(code));
      } finally {
        restoreWindowScrollThroughPaint(scrollY);
        // Leave sessionStorage for a possible remount; clear if none arrives.
        window.setTimeout(() => clearPinnedWindowScroll(scrollPath), 1000);
      }
    });
  }

  return { error, pending, handleVote };
}
