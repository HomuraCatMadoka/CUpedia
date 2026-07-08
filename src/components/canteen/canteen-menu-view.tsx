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

type CanteenMenuViewProps = {
  items: CanteenMenuItem[];
  voteCounts: Record<string, MenuItemVoteCounts>;
  myVotes: Record<string, VoteChoice>;
  currentUserId?: string | null;
  commentBlocked?: "banned" | null;
};

export function CanteenMenuView({
  items,
  voteCounts,
  myVotes,
  currentUserId = null,
  commentBlocked = null,
}: CanteenMenuViewProps) {
  const [period, setPeriod] = useState<MealPeriod>("lunch");
  const [showAfternoonHint, setShowAfternoonHint] = useState(false);
  const [view, setView] = useState<CanteenViewMode>("menu");

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

  if (items.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-[var(--canteen-bamboo)]/40 bg-white/50 px-6 py-16 text-center">
        <p className="text-[var(--canteen-muted)]">该食堂暂无菜品</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="sticky top-0 z-10 -mx-4 space-y-3 border-b border-[var(--canteen-bamboo)]/15 bg-[var(--canteen-cream)]/95 px-4 py-3 backdrop-blur-md sm:-mx-6 sm:px-6">
        <CanteenPeriodTabs value={period} onChange={setPeriod} />
        <CanteenViewTabs value={view} onChange={setView} />
        {showAfternoonHint && period === "lunch" ? (
          <p
            role="status"
            className="rounded-lg border border-[var(--canteen-noon)]/25 bg-[var(--canteen-noon)]/10 px-3 py-2 text-sm text-[var(--canteen-ink)]"
          >
            {AFTERNOON_HINT_TEXT}
          </p>
        ) : null}
      </div>

      {periodItems.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[var(--canteen-bamboo)]/40 bg-white/50 px-6 py-16 text-center">
          <p className="text-[var(--canteen-muted)]">该餐段暂无菜品</p>
        </div>
      ) : view === "menu" ? (
        <ul className="space-y-2">
          {periodItems.map((item) => (
            <MenuItemVoteRow
              key={item.id}
              item={item}
              counts={periodCounts[item.id]}
              myVote={liveMyVotes[item.id] ?? null}
              onVoteChange={handleVoteChange}
              currentUserId={currentUserId}
              commentBlocked={commentBlocked}
            />
          ))}
        </ul>
      ) : view === "recommend" ? (
        <section aria-label="大众推荐榜">
          <ul className="space-y-2">
            {recommendRanked.map((entry, index) => (
              <CanteenRankingRow
                key={entry.item.id}
                rank={index + 1}
                entry={entry}
                emphasis="recommend"
              />
            ))}
          </ul>
        </section>
      ) : (
        <section aria-label="大众避雷榜">
          <ul className="space-y-2">
            {avoidRanked.map((entry, index) => (
              <CanteenRankingRow
                key={entry.item.id}
                rank={index + 1}
                entry={entry}
                emphasis="avoid"
              />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
