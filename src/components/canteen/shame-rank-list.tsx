"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
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
  if (code === "DAILY_LIMIT_EXCEEDED") return "今日投票已达上限";
  if (code === "SHAME_VOTING_CLOSED") return "投票已截止";
  if (code === "CANTEEN_NOT_FOUND") return "食堂不存在";
  return "投票失败，请重试";
}

function formatCalendarDate(value: string): string {
  const [, month = "1", day = "1"] = value.split("-");
  return `${Number(month)} 月 ${Number(day)} 日`;
}

function rankMovement(
  currentRank: number,
  previousRank: number | undefined,
  hasPreviousVotes: boolean,
): string {
  if (!hasPreviousVotes || previousRank === undefined) return "－";
  const delta = previousRank - currentRank;
  if (delta > 0) return `↑ ${delta}`;
  if (delta < 0) return `↓ ${Math.abs(delta)}`;
  return "－";
}

export function ShameRankEntryLink() {
  return (
    <Link
      href="/canteen/shit-rank"
      className="canteen-shame-entry inline-flex items-center rounded-full border border-[var(--canteen-line)] bg-[var(--canteen-tray)] px-3 py-1.5 text-xs font-semibold tracking-tight text-[var(--canteen-ink)] transition-colors hover:bg-[var(--canteen-fill-strong)] sm:px-3.5 sm:py-2 sm:text-sm"
    >
      💩堂榜
    </Link>
  );
}

function ShameRankRow({
  rank,
  entry,
  context,
  onStomp,
  disabled,
}: {
  rank: number | null;
  entry: ShameRankEntry;
  context: React.ReactNode;
  onStomp: (canteenId: string) => Promise<void>;
  disabled: boolean;
}) {
  const [error, setError] = useState<string | null>(null);
  const [feedbackKey, setFeedbackKey] = useState(0);
  const feedbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (feedbackTimer.current) clearTimeout(feedbackTimer.current);
    },
    [],
  );

  async function handleStomp() {
    if (disabled) return;
    setError(null);
    setFeedbackKey((value) => value + 1);
    if (feedbackTimer.current) clearTimeout(feedbackTimer.current);
    feedbackTimer.current = setTimeout(() => setFeedbackKey(0), 500);
    try {
      await onStomp(entry.canteen.id);
    } catch (err) {
      const code = err instanceof Error ? err.message : "VOTE_FAILED";
      setError(shameErrorMessage(code));
    }
  }

  return (
    <li
      className={cn(
        "grid grid-cols-[2rem_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 border-b border-[#e3e5e7] px-4 py-2.5 transition-colors last:border-b-0 hover:bg-[#faf6f3] sm:grid-cols-[3rem_minmax(0,1fr)_4.5rem_auto] sm:gap-x-4 sm:px-6 sm:py-3",
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
      <div className="hidden text-center font-mono text-xs tabular-nums text-[#74777c] sm:block">
        {context}
      </div>
      <button
        type="button"
        aria-label={`投 💩 给 ${entry.canteen.name}`}
        onClick={() => {
          void handleStomp();
        }}
        disabled={disabled}
        className={cn(
          "canteen-shame-vote relative inline-flex min-h-12 min-w-[4.75rem] touch-manipulation flex-col items-center justify-center overflow-visible rounded-xl border border-[#d8b7a3] bg-[#f7ece5] px-3 py-1 text-[#623d2a] transition-[background-color,border-color,color,transform] hover:border-[#b98261] hover:bg-[#efdacd] active:scale-[0.94] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7a452d] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:border-[#d7d9dc] disabled:bg-[#eef0f2] disabled:text-[#8a8d91] disabled:opacity-100 sm:min-w-[5.5rem]",
          feedbackKey > 0 && "border-[#7a452d] bg-[#7a452d] text-white",
        )}
      >
        <span className="flex items-center gap-1 text-[0.7rem] font-semibold leading-none">
          投
          <span
            key={`poop-${feedbackKey}`}
            className={cn(feedbackKey > 0 && "canteen-shame-poop-hit")}
            aria-hidden
          >
            💩
          </span>
        </span>
        <span className="mt-1 font-mono text-sm font-semibold tabular-nums">
          {entry.dislikes}
        </span>
        {feedbackKey > 0 ? (
          <span
            key={feedbackKey}
            className="canteen-shame-feedback pointer-events-none absolute left-1/2 top-0 -translate-x-1/2 font-sans text-xs font-semibold text-[#7a452d]"
            aria-hidden
          >
            +{feedbackKey}
          </span>
        ) : null}
      </button>
      {error ? (
        <p
          className="col-span-2 col-start-2 text-xs text-destructive sm:col-span-3"
          role="alert"
        >
          {error}
        </p>
      ) : null}
    </li>
  );
}

export function ShameRankList({
  canteens,
  initialTodayCounts,
  initialAllTimeCounts,
  previousCounts,
  voteDate,
  votingEndDate,
  votingOpen,
}: {
  canteens: Canteen[];
  initialTodayCounts: Record<string, number>;
  initialAllTimeCounts: Record<string, number>;
  previousCounts: Record<string, number>;
  voteDate: string;
  votingEndDate: string;
  votingOpen: boolean;
}) {
  const router = useRouter();
  const [view, setView] = useState<"today" | "history">("today");
  const [showAll, setShowAll] = useState(false);
  const [todayCounts, setTodayCounts] = useState(initialTodayCounts);
  const [allTimeCounts, setAllTimeCounts] = useState(initialAllTimeCounts);
  const [rankingTodayCounts, setRankingTodayCounts] =
    useState(initialTodayCounts);
  const [rankingAllTimeCounts, setRankingAllTimeCounts] =
    useState(initialAllTimeCounts);
  const todayCountsRef = useRef(todayCounts);
  const allTimeCountsRef = useRef(allTimeCounts);
  const rankingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { pinnedScroll, pin, release } = useScrollPin();
  const activeCounts = view === "today" ? todayCounts : allTimeCounts;
  const rankingCounts =
    view === "today" ? rankingTodayCounts : rankingAllTimeCounts;
  const ranked = rankShameCanteens(canteens, rankingCounts).map((entry) => ({
    ...entry,
    dislikes: activeCounts[entry.canteen.id] ?? 0,
  }));
  const rankedEntries = ranked.filter(
    (entry) => (rankingCounts[entry.canteen.id] ?? 0) > 0,
  );
  const unrankedEntries = ranked.filter(
    (entry) => (rankingCounts[entry.canteen.id] ?? 0) === 0,
  );
  const visibleRankedEntries = showAll
    ? rankedEntries
    : rankedEntries.slice(0, 10);
  const hasHiddenEntries =
    rankedEntries.length > visibleRankedEntries.length ||
    unrankedEntries.length > 0;
  const hasPreviousVotes = Object.values(previousCounts).some(
    (count) => count > 0,
  );
  const previousPositions = new Map(
    rankShameCanteens(canteens, previousCounts).map((entry, index) => [
      entry.canteen.id,
      index + 1,
    ]),
  );

  useEffect(() => {
    todayCountsRef.current = todayCounts;
    allTimeCountsRef.current = allTimeCounts;
  }, [todayCounts, allTimeCounts]);

  useEffect(
    () => () => {
      if (rankingTimer.current) clearTimeout(rankingTimer.current);
    },
    [],
  );

  useRestorePinnedWindowScrollOnMount();
  usePinnedWindowScroll(pinnedScroll, [
    rankingTodayCounts,
    rankingAllTimeCounts,
  ]);

  function scheduleRankingUpdate() {
    if (rankingTimer.current) clearTimeout(rankingTimer.current);
    rankingTimer.current = setTimeout(() => {
      const scrollPin = pin();
      setRankingTodayCounts(todayCountsRef.current);
      setRankingAllTimeCounts(allTimeCountsRef.current);
      setTimeout(() => release(scrollPin), 0);
    }, 650);
  }

  async function onStomp(canteenId: string) {
    const scrollPin = pin();
    setTodayCounts((prev) => ({
      ...prev,
      [canteenId]: (prev[canteenId] ?? 0) + 1,
    }));
    setAllTimeCounts((prev) => ({
      ...prev,
      [canteenId]: (prev[canteenId] ?? 0) + 1,
    }));
    scheduleRankingUpdate();
    try {
      const result = await appendShameVote(canteenId);
      if (result.voteDate !== voteDate) {
        setTodayCounts((prev) => ({
          ...prev,
          [canteenId]: Math.max(0, (prev[canteenId] ?? 0) - 1),
        }));
        router.refresh();
      }
    } catch (err) {
      setTodayCounts((prev) => ({
        ...prev,
        [canteenId]: Math.max(0, (prev[canteenId] ?? 0) - 1),
      }));
      setAllTimeCounts((prev) => ({
        ...prev,
        [canteenId]: Math.max(0, (prev[canteenId] ?? 0) - 1),
      }));
      scheduleRankingUpdate();
      throw err;
    } finally {
      release(scrollPin);
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
            {view === "today" ? "" : "累计至 "}
            {formatCalendarDate(voteDate)}
            <span aria-hidden> · </span>
            {votingOpen
              ? `投票至 ${formatCalendarDate(votingEndDate)}`
              : "投票已截止"}
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
            aria-selected={view === "history"}
            onClick={() => setView("history")}
            className={cn(
              "min-h-9 rounded-full px-4 text-sm font-medium transition-colors",
              view === "history"
                ? "bg-[#7a452d] text-white"
                : "text-[#74777c] hover:text-[#202124]",
            )}
          >
            历史
          </button>
        </div>
      </header>
      {ranked.length === 0 ? (
        <div className="px-4 py-16 text-center text-[#74777c]">暂无食堂</div>
      ) : (
        <>
          {visibleRankedEntries.length > 0 ? (
            <ol aria-label={`${view === "today" ? "今日" : "历史"}💩堂榜`}>
              {visibleRankedEntries.map((entry, index) => {
                const rank = index + 1;
                const context =
                  view === "history"
                    ? `今日 +${todayCounts[entry.canteen.id] ?? 0}`
                    : rankMovement(
                        rank,
                        previousPositions.get(entry.canteen.id),
                        hasPreviousVotes,
                      );
                return (
                  <ShameRankRow
                    key={entry.canteen.id}
                    rank={rank}
                    entry={entry}
                    context={context}
                    onStomp={onStomp}
                    disabled={!votingOpen}
                  />
                );
              })}
            </ol>
          ) : (
            <p className="px-4 py-10 text-center text-sm text-[#74777c]">
              还没有食堂上榜
            </p>
          )}

          {showAll && unrankedEntries.length > 0 ? (
            <div>
              <p className="border-y border-[#e3e5e7] bg-[#f6f7f8] px-4 py-2.5 text-xs font-medium text-[#74777c] sm:px-6">
                尚未上榜 · {unrankedEntries.length} 家食堂
              </p>
              <ul aria-label="尚未上榜的食堂">
                {unrankedEntries.map((entry) => (
                  <ShameRankRow
                    key={entry.canteen.id}
                    rank={null}
                    entry={entry}
                    context="—"
                    onStomp={onStomp}
                    disabled={!votingOpen}
                  />
                ))}
              </ul>
            </div>
          ) : null}

          {hasHiddenEntries || showAll ? (
            <button
              type="button"
              aria-expanded={showAll}
              onClick={() => setShowAll((value) => !value)}
              className="flex min-h-14 w-full items-center justify-between border-t border-[#e3e5e7] px-4 text-sm font-medium text-[#74777c] transition-colors hover:bg-[#faf6f3] hover:text-[#202124] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#7a452d] sm:px-6"
            >
              {showAll ? (
                <span className="mx-auto">收起榜单 ↑</span>
              ) : (
                <>
                  <span>
                    {unrankedEntries.length > 0
                      ? `尚未上榜 · ${unrankedEntries.length} 家食堂`
                      : `其余 ${rankedEntries.length - visibleRankedEntries.length} 名`}
                  </span>
                  <span className="font-semibold text-[#7a452d]">
                    查看完整榜单（{ranked.length}）↓
                  </span>
                </>
              )}
            </button>
          ) : null}
        </>
      )}
    </section>
  );
}
