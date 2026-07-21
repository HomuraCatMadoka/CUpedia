"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  CanteenMenuItem,
  MealPeriod,
  MenuItemVoteCounts,
  VoteChoice,
} from "@/lib/canteen-types";
import { applyVoteCountDelta } from "@/lib/canteen-types";
import {
  AFTERNOON_HINT_TEXT,
  defaultMealPeriodForHkt,
  shouldShowAfternoonHint,
} from "@/lib/canteen-meal-period";
import { groupMenuItemsBySvgKey } from "@/lib/canteen-menu-sections";
import type { DishSvgKey } from "@/lib/canteen-svg-keys";
import {
  filterItemsByMealPeriod,
  rankAvoidDishes,
  rankRecommendDishes,
} from "@/lib/canteen-rankings";
import {
  CanteenPeriodTabs,
  CanteenViewTabs,
  type CanteenViewMode,
} from "@/components/canteen/canteen-period-tabs";
import { CanteenRankingRow } from "@/components/canteen/canteen-ranking-row";
import { MenuItemVoteRow } from "@/components/canteen/menu-item-vote-row";
import { cn } from "@/lib/utils";

type CanteenMenuViewProps = {
  items: CanteenMenuItem[];
  voteCounts: Record<string, MenuItemVoteCounts>;
  myVotes: Record<string, VoteChoice>;
  commentCounts?: Record<string, number>;
  currentUserId?: string | null;
  commentBlocked?: "banned" | null;
};

export function CanteenMenuView({
  items,
  voteCounts,
  myVotes,
  commentCounts = {},
  currentUserId = null,
  commentBlocked = null,
}: CanteenMenuViewProps) {
  const [period, setPeriod] = useState<MealPeriod>("lunch");
  const [showAfternoonHint, setShowAfternoonHint] = useState(false);
  const [view, setView] = useState<CanteenViewMode>("menu");
  const [sectionFilter, setSectionFilter] = useState<DishSvgKey | "all">(
    "all",
  );

  // Client-only meal-period init. defaultMealPeriodForHkt / shouldShowAfternoonHint
  // read the viewer's *current* Asia/Hong_Kong wall clock, which the server does
  // not know at render time. Deriving these during render (e.g. a useState
  // initializer) would make the server and client markup disagree and trigger a
  // hydration mismatch, so we deliberately set them once on the client after
  // mount. The empty deps array means this runs exactly once — no cascading
  // re-render loop despite the set-state-in-effect rule.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    const now = new Date();
    setPeriod(defaultMealPeriodForHkt(now));
    setShowAfternoonHint(shouldShowAfternoonHint(now));
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */
  const [liveVoteCounts, setLiveVoteCounts] =
    useState<Record<string, MenuItemVoteCounts>>(voteCounts);
  const [liveMyVotes, setLiveMyVotes] =
    useState<Record<string, VoteChoice>>(myVotes);

  const handleVoteChange = useCallback(
    (itemId: string, prevVote: VoteChoice, nextVote: VoteChoice) => {
      setLiveMyVotes((prev) => {
        const next = { ...prev };
        if (nextVote === null) delete next[itemId];
        else next[itemId] = nextVote;
        return next;
      });
      setLiveVoteCounts((prev) => ({
        ...prev,
        [itemId]: applyVoteCountDelta(
          prev[itemId] ?? { likes: 0, dislikes: 0 },
          prevVote,
          nextVote,
        ),
      }));
    },
    [],
  );

  const periodItems = useMemo(
    () => filterItemsByMealPeriod(items, period),
    [items, period],
  );

  const menuSections = useMemo(
    () => groupMenuItemsBySvgKey(periodItems),
    [periodItems],
  );

  const visibleSections = useMemo(() => {
    if (sectionFilter === "all") return menuSections;
    return menuSections.filter((section) => section.svgKey === sectionFilter);
  }, [menuSections, sectionFilter]);

  const periodCounts = useMemo(() => {
    const out: Record<string, MenuItemVoteCounts> = {};
    for (const item of periodItems) {
      out[item.id] = liveVoteCounts[item.id] ?? { likes: 0, dislikes: 0 };
    }
    return out;
  }, [periodItems, liveVoteCounts]);

  const recommendRanked = useMemo(
    () => rankRecommendDishes(periodItems, periodCounts),
    [periodItems, periodCounts],
  );

  const avoidRanked = useMemo(
    () => rankAvoidDishes(periodItems, periodCounts),
    [periodItems, periodCounts],
  );

  function handlePeriodChange(next: MealPeriod) {
    setPeriod(next);
    setSectionFilter("all");
  }

  if (items.length === 0) {
    return (
      <div className="canteen-ledger border-b border-dashed border-[var(--canteen-line)] px-1 py-16 text-center">
        <p className="text-[var(--canteen-muted)]">该食堂暂无菜品</p>
      </div>
    );
  }

  return (
    <div className="min-w-0 space-y-6">
      <div className="sticky top-0 z-10 -mx-4 min-w-0 space-y-3 border-b border-[var(--canteen-line)] bg-[var(--canteen-cream)]/95 px-4 py-3 backdrop-blur-md sm:-mx-6 sm:px-6">
        <CanteenPeriodTabs value={period} onChange={handlePeriodChange} />
        <CanteenViewTabs value={view} onChange={setView} />
        {view === "menu" ? (
          <div
            className="min-h-9 min-w-0"
            aria-hidden={menuSections.length <= 1}
          >
            {menuSections.length > 1 ? (
              <div
                role="toolbar"
                aria-label="菜品分类"
                className="flex min-w-0 max-w-full gap-2 overflow-x-auto overscroll-x-contain pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              >
                <button
                  type="button"
                  aria-pressed={sectionFilter === "all"}
                  onClick={() => setSectionFilter("all")}
                  className={cn(
                    "canteen-section-chip shrink-0",
                    sectionFilter === "all" && "canteen-section-chip-on",
                  )}
                >
                  全部
                </button>
                {menuSections.map((section) => (
                  <button
                    key={section.svgKey}
                    type="button"
                    aria-pressed={sectionFilter === section.svgKey}
                    onClick={() => setSectionFilter(section.svgKey)}
                    className={cn(
                      "canteen-section-chip shrink-0",
                      sectionFilter === section.svgKey &&
                        "canteen-section-chip-on",
                    )}
                  >
                    {section.label}
                    <span className="font-mono tabular-nums text-[var(--canteen-muted)]">
                      {section.items.length}
                    </span>
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
        {showAfternoonHint ? (
          <p
            role="status"
            aria-hidden={period !== "lunch"}
            className={cn(
              "border border-[var(--canteen-noon)]/25 bg-[var(--canteen-noon)]/10 px-3 py-2 text-sm text-[var(--canteen-ink)]",
              period !== "lunch" && "invisible",
            )}
          >
            {AFTERNOON_HINT_TEXT}
          </p>
        ) : null}
      </div>

      {periodItems.length === 0 ? (
        <div className="canteen-ledger border-b border-dashed border-[var(--canteen-line)] px-1 py-16 text-center">
          <p className="text-[var(--canteen-muted)]">该餐段暂无菜品</p>
        </div>
      ) : view === "menu" ? (
        <div className="space-y-8">
          {visibleSections.map((section) => (
            <section
              key={section.svgKey}
              aria-labelledby={`canteen-section-${section.svgKey}`}
            >
              <h2
                id={`canteen-section-${section.svgKey}`}
                className="canteen-display mb-1 border-b border-[var(--canteen-line)] pb-2 text-lg font-semibold text-[var(--canteen-ink)]"
              >
                {section.label}
                <span className="ml-2 font-mono text-sm font-normal tabular-nums text-[var(--canteen-muted)]">
                  {section.items.length}
                </span>
              </h2>
              <ul className="canteen-ledger">
                {section.items.map((item) => (
                  <MenuItemVoteRow
                    key={item.id}
                    item={item}
                    counts={periodCounts[item.id]}
                    myVote={liveMyVotes[item.id] ?? null}
                    onVoteChange={handleVoteChange}
                    currentUserId={currentUserId}
                    commentBlocked={commentBlocked}
                    initialCommentCount={commentCounts[item.id] ?? 0}
                  />
                ))}
              </ul>
            </section>
          ))}
        </div>
      ) : view === "recommend" ? (
        <section aria-label="大众推荐榜">
          <ul className="canteen-ledger">
            {recommendRanked.map((entry, index) => (
              <CanteenRankingRow
                key={entry.item.id}
                rank={index + 1}
                entry={entry}
                emphasis="recommend"
                currentUserId={currentUserId}
                commentBlocked={commentBlocked}
                initialCommentCount={commentCounts[entry.item.id] ?? 0}
              />
            ))}
          </ul>
        </section>
      ) : (
        <section aria-label="大众避雷榜">
          <ul className="canteen-ledger">
            {avoidRanked.map((entry, index) => (
              <CanteenRankingRow
                key={entry.item.id}
                rank={index + 1}
                entry={entry}
                emphasis="avoid"
                currentUserId={currentUserId}
                commentBlocked={commentBlocked}
                initialCommentCount={commentCounts[entry.item.id] ?? 0}
              />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
