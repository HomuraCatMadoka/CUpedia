"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Canteen } from "@/lib/canteen-types";
import {
  rankShameCanteens,
  type ShameRankEntry,
} from "@/lib/canteen-shame-rank";
import {
  appendShameVote,
  type ShameVoteErrorCode,
} from "@/lib/canteen-shame-actions";
import { cn } from "@/lib/utils";

type ShameVoteFailure = ShameVoteErrorCode | "VOTE_FAILED";

function shameErrorMessage(code: ShameVoteFailure): string {
  if (code === "ANON_SESSION_REQUIRED") return "投票需允许 Cookie";
  if (code === "USER_BANNED") return "账号已封禁，无法投票";
  if (code === "RATE_LIMIT_EXCEEDED") return "匿名投票太频繁，请稍后再试";
  if (code === "DAILY_LIMIT_EXCEEDED") return "匿名投票已达上限，登录后可继续";
  if (code === "CANTEEN_NOT_FOUND") return "食堂不存在";
  return "投票失败，请重试";
}

function formatCalendarDate(value: string): string {
  const [, month = "1", day = "1"] = value.split("-");
  return `${Number(month)} 月 ${Number(day)} 日`;
}

export function ShameRankEntryLink() {
  return (
    <Link
      href="/canteen/shit-rank"
      prefetch={false}
      className="canteen-shame-entry inline-flex items-center rounded-full border border-[var(--canteen-line)] bg-[var(--canteen-tray)] px-3 py-1.5 text-xs font-semibold tracking-tight text-[var(--canteen-ink)] transition-colors hover:bg-[var(--canteen-fill-strong)] sm:px-3.5 sm:py-2 sm:text-sm"
    >
      💩堂榜
    </Link>
  );
}

function ShameRankRow({
  rank,
  entry,
  onStomp,
  failure,
}: {
  rank: number | null;
  entry: ShameRankEntry;
  onStomp: (canteenId: string) => Promise<void>;
  failure: ShameVoteFailure | null;
}) {
  return (
    <li
      className={cn(
        "grid grid-cols-[2rem_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 border-b border-[#e3e5e7] px-4 py-2.5 transition-colors last:border-b-0 hover:bg-[#faf6f3] sm:grid-cols-[3rem_minmax(0,1fr)_auto] sm:gap-x-4 sm:px-6 sm:py-3",
        rank === 1 && entry.dislikes > 0 && "bg-[#fff9f5]",
      )}
    >
      <span
        className={cn(
          "font-mono text-lg font-medium tabular-nums tracking-tight text-[#74777c] sm:text-2xl",
          rank === 1 && entry.dislikes > 0 && "text-[#7a452d]",
        )}
        aria-hidden
      >
        {rank === null ? "—" : String(rank).padStart(2, "0")}
      </span>
      <div className="min-w-0 flex-1">
        <p className="min-w-0 text-sm font-semibold text-[#202124] sm:text-base">
          {entry.canteen.name}
        </p>
        {entry.canteen.location ? (
          <p className="mt-0.5 text-xs text-[#74777c]">
            {entry.canteen.location}
          </p>
        ) : null}
      </div>
      <button
        type="button"
        aria-label={`投 💩 给 ${entry.canteen.name}`}
        onClick={() => {
          void onStomp(entry.canteen.id);
        }}
        className="canteen-shame-vote inline-flex min-h-12 min-w-[4.75rem] touch-manipulation flex-col items-center justify-center rounded-xl border border-[#d8b7a3] bg-[#f7ece5] px-3 py-1 text-[#623d2a] transition-[background-color,border-color,color,transform] hover:border-[#b98261] hover:bg-[#efdacd] active:scale-[0.94] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7a452d] focus-visible:ring-offset-2 sm:min-w-[5.5rem]"
      >
        <span className="flex items-center gap-1 text-[0.7rem] font-semibold leading-none">
          投 <span aria-hidden>💩</span>
        </span>
        <span
          className="mt-1 font-mono text-sm font-semibold tabular-nums"
          data-testid="shame-vote-count"
        >
          {entry.dislikes}
        </span>
      </button>
      {failure ? (
        <p
          className="col-span-2 col-start-2 text-xs text-destructive"
          role="alert"
        >
          投票失败：{shameErrorMessage(failure)}
        </p>
      ) : null}
    </li>
  );
}

export function ShameRankList({
  canteens,
  initialTodayCounts,
  initialAllTimeCounts,
  voteDate,
}: {
  canteens: Canteen[];
  initialTodayCounts: Record<string, number>;
  initialAllTimeCounts: Record<string, number>;
  voteDate: string;
}) {
  const router = useRouter();
  const [view, setView] = useState<"today" | "allTime">("today");
  const [todayCounts, setTodayCounts] = useState(initialTodayCounts);
  const [allTimeCounts, setAllTimeCounts] = useState(initialAllTimeCounts);
  const [failures, setFailures] = useState<
    Record<string, ShameVoteFailure | undefined>
  >({});
  const ranked = rankShameCanteens(
    canteens,
    view === "today" ? todayCounts : allTimeCounts,
  );

  async function onStomp(canteenId: string): Promise<void> {
    setFailures((previous) => ({ ...previous, [canteenId]: undefined }));
    setTodayCounts((previous) => ({
      ...previous,
      [canteenId]: (previous[canteenId] ?? 0) + 1,
    }));
    setAllTimeCounts((previous) => ({
      ...previous,
      [canteenId]: (previous[canteenId] ?? 0) + 1,
    }));

    try {
      const result = await appendShameVote(canteenId);
      if (!result.ok) {
        setTodayCounts((previous) => ({
          ...previous,
          [canteenId]: Math.max(0, (previous[canteenId] ?? 1) - 1),
        }));
        setAllTimeCounts((previous) => ({
          ...previous,
          [canteenId]: Math.max(0, (previous[canteenId] ?? 1) - 1),
        }));
        setFailures((previous) => ({
          ...previous,
          [canteenId]: result.code,
        }));
        return;
      }
      if (result.voteDate !== voteDate) {
        setTodayCounts((previous) => ({
          ...previous,
          [canteenId]: Math.max(0, (previous[canteenId] ?? 1) - 1),
        }));
        router.refresh();
      }
    } catch {
      setTodayCounts((previous) => ({
        ...previous,
        [canteenId]: Math.max(0, (previous[canteenId] ?? 1) - 1),
      }));
      setAllTimeCounts((previous) => ({
        ...previous,
        [canteenId]: Math.max(0, (previous[canteenId] ?? 1) - 1),
      }));
      setFailures((previous) => ({
        ...previous,
        [canteenId]: "VOTE_FAILED",
      }));
    }
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-[#e3e5e7] bg-white text-[#202124] shadow-[0_2px_8px_rgba(32,33,36,0.06)]">
      <header className="flex min-h-28 items-center justify-between gap-3 border-b border-[#e3e5e7] px-4 py-5 sm:px-6">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight text-[#202124] sm:text-3xl">
            💩堂榜
          </h1>
          <p className="mt-1.5 text-xs text-[#74777c] sm:text-sm">
            {view === "today" ? "今日 " : "累计至 "}
            {formatCalendarDate(voteDate)}
            <span aria-hidden> · </span>
            投票长期开放
          </p>
        </div>
        <div
          className="inline-flex shrink-0 rounded-full bg-[#eef0f2] p-1"
          role="tablist"
          aria-label="榜单时间范围"
        >
          <button
            type="button"
            role="tab"
            aria-selected={view === "today"}
            onClick={() => setView("today")}
            className={cn(
              "min-h-9 rounded-full px-4 text-sm font-medium transition-colors",
              view === "today"
                ? "bg-[#7a452d] text-white"
                : "text-[#74777c] hover:text-[#202124]",
            )}
          >
            今日
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={view === "allTime"}
            onClick={() => setView("allTime")}
            className={cn(
              "min-h-9 rounded-full px-4 text-sm font-medium transition-colors",
              view === "allTime"
                ? "bg-[#7a452d] text-white"
                : "text-[#74777c] hover:text-[#202124]",
            )}
          >
            累计
          </button>
        </div>
      </header>
      {ranked.length === 0 ? (
        <div className="px-4 py-16 text-center text-[#74777c]">暂无食堂</div>
      ) : (
        <ol aria-label={view === "today" ? "今日💩堂榜" : "累计💩堂榜"}>
          {ranked.map((entry, index) => (
            <ShameRankRow
              key={entry.canteen.id}
              rank={entry.dislikes > 0 ? index + 1 : null}
              entry={entry}
              onStomp={onStomp}
              failure={failures[entry.canteen.id] ?? null}
            />
          ))}
        </ol>
      )}
    </section>
  );
}
