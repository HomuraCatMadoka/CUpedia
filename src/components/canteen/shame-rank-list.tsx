"use client";

import Link from "next/link";
import { useState } from "react";
import { ThumbsDown } from "lucide-react";
import type { Canteen } from "@/lib/canteen-types";
import {
  rankShameCanteens,
  type ShameRankEntry,
} from "@/lib/canteen-shame-rank";
import { appendShameVote } from "@/lib/canteen-shame-actions";
import {
  usePinnedWindowScroll,
  useRestorePinnedWindowScrollOnMount,
  useScrollPin,
} from "@/lib/pin-window-scroll";
import { cn } from "@/lib/utils";

function shameErrorMessage(code: string): string {
  if (code === "ANON_SESSION_REQUIRED") return "投票需允许 Cookie";
  if (code === "USER_BANNED") return "账号已封禁，无法投票";
  if (code === "RATE_LIMIT_EXCEEDED") return "操作太频繁，请稍后再试";
  if (code === "CANTEEN_NOT_FOUND") return "食堂不存在";
  return "点踩失败，请重试";
}

export function ShameRankEntryLink() {
  return (
    <Link
      href="/canteen/shit-rank"
      className="canteen-shame-entry inline-flex items-center border border-[var(--canteen-line)] bg-[var(--canteen-surface)] px-2.5 py-1.5 text-xs font-semibold text-[var(--canteen-ink)] transition-colors hover:border-[var(--canteen-evening)]/50 hover:bg-[var(--canteen-evening)]/8 sm:px-3 sm:py-2 sm:text-sm"
    >
      每日💩堂榜
    </Link>
  );
}

function ShameRankRow({
  rank,
  entry,
  onStomp,
}: {
  rank: number;
  entry: ShameRankEntry;
  onStomp: (canteenId: string) => Promise<void>;
}) {
  const [error, setError] = useState<string | null>(null);
  const isTop = rank === 1 && entry.dislikes > 0;

  async function handleStomp() {
    setError(null);
    try {
      await onStomp(entry.canteen.id);
    } catch (err) {
      const code = err instanceof Error ? err.message : "VOTE_FAILED";
      setError(shameErrorMessage(code));
    }
  }

  return (
    <li className="canteen-ledger-row flex flex-wrap items-center gap-2 px-1 py-2.5 sm:flex-nowrap sm:gap-4 sm:py-3">
      <span
        className={cn(
          "canteen-display relative flex size-8 shrink-0 items-center justify-center font-mono text-sm font-semibold tabular-nums",
          isTop ? "text-black" : "text-[var(--canteen-muted)]",
        )}
        aria-hidden
      >
        {isTop ? (
          <span
            className="absolute -top-2.5 left-1/2 -translate-x-1/2 text-[0.7rem] leading-none"
            aria-hidden
          >
            💩
          </span>
        ) : null}
        {rank}
      </span>
      <div className="min-w-0 flex-1">
        <p className="min-w-0 text-sm font-medium text-[var(--canteen-ink)] sm:text-base">
          {entry.canteen.name}
        </p>
        {entry.canteen.location ? (
          <p className="mt-0.5 text-xs text-[var(--canteen-muted)]">
            {entry.canteen.location}
          </p>
        ) : null}
        {error ? (
          <p className="mt-1 text-xs text-red-700" role="alert">
            {error}
          </p>
        ) : null}
      </div>
      <button
        type="button"
        aria-label={`踩 ${entry.canteen.name}`}
        onClick={() => {
          void handleStomp();
        }}
        className="canteen-vote-btn canteen-vote-btn-dislike-on"
      >
        <ThumbsDown className="size-4 shrink-0" strokeWidth={2.4} aria-hidden />
        <span className="font-mono tabular-nums">{entry.dislikes}</span>
      </button>
    </li>
  );
}

export function ShameRankList({
  canteens,
  initialCounts,
  voteDate,
}: {
  canteens: Canteen[];
  initialCounts: Record<string, number>;
  voteDate: string;
}) {
  const [counts, setCounts] = useState(initialCounts);
  const { pinnedScrollY, pin, release } = useScrollPin();
  const ranked = rankShameCanteens(canteens, counts);

  useRestorePinnedWindowScrollOnMount();
  usePinnedWindowScroll(pinnedScrollY, [counts]);

  async function onStomp(canteenId: string) {
    pin();
    setCounts((prev) => ({
      ...prev,
      [canteenId]: (prev[canteenId] ?? 0) + 1,
    }));
    try {
      await appendShameVote(canteenId);
    } catch (err) {
      setCounts((prev) => ({
        ...prev,
        [canteenId]: Math.max(0, (prev[canteenId] ?? 0) - 1),
      }));
      throw err;
    } finally {
      release();
    }
  }

  if (ranked.length === 0) {
    return (
      <div className="canteen-fade-in canteen-ledger border-b border-dashed border-[var(--canteen-line)] px-1 py-10 text-center sm:py-16">
        <p className="canteen-display text-lg text-[var(--canteen-muted)]">
          暂无食堂
        </p>
      </div>
    );
  }

  return (
    <div className="canteen-fade-in space-y-3">
      <p className="text-xs text-[var(--canteen-muted)] sm:text-sm">
        今日榜单 · {voteDate}（港时）· 只能踩，可连踩，不可取消
      </p>
      <ol className="canteen-ledger">
        {ranked.map((entry, i) => (
          <ShameRankRow
            key={entry.canteen.id}
            rank={i + 1}
            entry={entry}
            onStomp={onStomp}
          />
        ))}
      </ol>
    </div>
  );
}
