"use client";

import {
  memo,
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useState,
} from "react";
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
  groupMenuItemsBySvgKey,
  type MenuSection,
} from "@/lib/canteen-menu-sections";
import type { DishSvgKey } from "@/lib/canteen-svg-keys";
import { rankAvoidDishes, rankRecommendDishes } from "@/lib/canteen-rankings";
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

type MenuSelection = {
  period: MealPeriod;
  view: CanteenViewMode;
  section: DishSvgKey | "all";
};

type PeriodMenuData = {
  items: CanteenMenuItem[];
  sections: MenuSection[];
};

type MenuDataByPeriod = Record<MealPeriod, PeriodMenuData>;

const INITIAL_SELECTION: MenuSelection = {
  period: "lunch",
  view: "menu",
  section: "all",
};

const EMPTY_COMMENT_COUNTS: Record<string, number> = {};

function buildMenuDataByPeriod(items: CanteenMenuItem[]): MenuDataByPeriod {
  const itemsByPeriod: Record<MealPeriod, CanteenMenuItem[]> = {
    breakfast: [],
    lunch: [],
    dinner: [],
  };

  for (const item of items) {
    itemsByPeriod[item.mealPeriod].push(item);
  }

  return {
    breakfast: {
      items: itemsByPeriod.breakfast,
      sections: groupMenuItemsBySvgKey(itemsByPeriod.breakfast),
    },
    lunch: {
      items: itemsByPeriod.lunch,
      sections: groupMenuItemsBySvgKey(itemsByPeriod.lunch),
    },
    dinner: {
      items: itemsByPeriod.dinner,
      sections: groupMenuItemsBySvgKey(itemsByPeriod.dinner),
    },
  };
}

const CanteenMenuContent = memo(function CanteenMenuContent({
  selection,
  menuDataByPeriod,
  liveVoteCounts,
  liveMyVotes,
  commentCounts,
  currentUserId,
  commentBlocked,
  onVoteChange,
}: {
  selection: MenuSelection;
  menuDataByPeriod: MenuDataByPeriod;
  liveVoteCounts: Record<string, MenuItemVoteCounts>;
  liveMyVotes: Record<string, VoteChoice>;
  commentCounts: Record<string, number>;
  currentUserId: string | null;
  commentBlocked: "banned" | null;
  onVoteChange: (
    itemId: string,
    prevVote: VoteChoice,
    nextVote: VoteChoice,
  ) => void;
}) {
  const { items: periodItems, sections: menuSections } =
    menuDataByPeriod[selection.period];

  const visibleSections = useMemo(() => {
    if (selection.section === "all") return menuSections;
    return menuSections.filter(
      (section) => section.svgKey === selection.section,
    );
  }, [menuSections, selection.section]);

  const periodCounts = useMemo(() => {
    const out: Record<string, MenuItemVoteCounts> = {};
    for (const item of periodItems) {
      out[item.id] = liveVoteCounts[item.id] ?? { likes: 0, dislikes: 0 };
    }
    return out;
  }, [periodItems, liveVoteCounts]);

  const ranked = useMemo(() => {
    if (selection.view === "recommend") {
      return rankRecommendDishes(periodItems, periodCounts);
    }
    if (selection.view === "avoid") {
      return rankAvoidDishes(periodItems, periodCounts);
    }
    return [];
  }, [periodItems, periodCounts, selection.view]);

  if (periodItems.length === 0) {
    return (
      <div className="canteen-ledger border-b border-dashed border-[var(--canteen-line)] px-1 py-10 text-center sm:py-16">
        <p className="text-[var(--canteen-muted)]">该餐段暂无菜品</p>
      </div>
    );
  }

  if (selection.view === "menu") {
    return (
      <div className="space-y-5 sm:space-y-8">
        {visibleSections.map((section) => (
          <section
            key={section.svgKey}
            aria-labelledby={`canteen-section-${section.svgKey}`}
          >
            <h2
              id={`canteen-section-${section.svgKey}`}
              className="canteen-display mb-0.5 border-b border-[var(--canteen-line)] pb-1.5 text-base font-semibold text-[var(--canteen-ink)] sm:mb-1 sm:pb-2 sm:text-lg"
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
                  onVoteChange={onVoteChange}
                  currentUserId={currentUserId}
                  commentBlocked={commentBlocked}
                  initialCommentCount={commentCounts[item.id] ?? 0}
                />
              ))}
            </ul>
          </section>
        ))}
      </div>
    );
  }

  const recommend = selection.view === "recommend";
  return (
    <section aria-label={recommend ? "大众推荐榜" : "大众避雷榜"}>
      <ul className="canteen-ledger">
        {ranked.map((entry, index) => (
          <CanteenRankingRow
            key={entry.item.id}
            rank={index + 1}
            entry={entry}
            emphasis={recommend ? "recommend" : "avoid"}
            currentUserId={currentUserId}
            commentBlocked={commentBlocked}
            initialCommentCount={commentCounts[entry.item.id] ?? 0}
          />
        ))}
      </ul>
    </section>
  );
});

export function CanteenMenuView({
  items,
  voteCounts,
  myVotes,
  commentCounts = EMPTY_COMMENT_COUNTS,
  currentUserId = null,
  commentBlocked = null,
}: CanteenMenuViewProps) {
  const [selection, setSelection] = useState<MenuSelection>(INITIAL_SELECTION);
  const deferredSelection = useDeferredValue(selection);
  const isStale = selection !== deferredSelection;
  const [showAfternoonHint, setShowAfternoonHint] = useState(false);
  const [liveVoteCounts, setLiveVoteCounts] =
    useState<Record<string, MenuItemVoteCounts>>(voteCounts);
  const [liveMyVotes, setLiveMyVotes] =
    useState<Record<string, VoteChoice>>(myVotes);

  const menuDataByPeriod = useMemo(() => buildMenuDataByPeriod(items), [items]);
  const selectedSections = menuDataByPeriod[selection.period].sections;

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
    const period = defaultMealPeriodForHkt(now);
    setSelection((current) => ({ ...current, period, section: "all" }));
    setShowAfternoonHint(shouldShowAfternoonHint(now));
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

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

  function handlePeriodChange(period: MealPeriod) {
    setSelection((current) => ({ ...current, period, section: "all" }));
  }

  function handleViewChange(view: CanteenViewMode) {
    setSelection((current) => ({ ...current, view }));
  }

  function handleSectionChange(section: DishSvgKey | "all") {
    setSelection((current) => {
      const isAvailable =
        section === "all" ||
        menuDataByPeriod[current.period].sections.some(
          (candidate) => candidate.svgKey === section,
        );
      return { ...current, section: isAvailable ? section : "all" };
    });
  }

  if (items.length === 0) {
    return (
      <div className="canteen-ledger border-b border-dashed border-[var(--canteen-line)] px-1 py-10 text-center sm:py-16">
        <p className="text-[var(--canteen-muted)]">该食堂暂无菜品</p>
      </div>
    );
  }

  return (
    <div className="min-w-0 space-y-4 sm:space-y-6">
      <div className="sticky top-0 z-10 -mx-3 min-w-0 space-y-2 border-b border-[var(--canteen-line)] bg-[var(--canteen-cream)]/95 px-3 py-2 backdrop-blur-md sm:-mx-6 sm:space-y-3 sm:px-6 sm:py-3">
        <CanteenPeriodTabs
          value={selection.period}
          onChange={handlePeriodChange}
        />
        <CanteenViewTabs value={selection.view} onChange={handleViewChange} />
        {selection.view === "menu" ? (
          <div
            className="min-h-9 min-w-0"
            aria-hidden={selectedSections.length <= 1}
          >
            {selectedSections.length > 1 ? (
              <div
                role="toolbar"
                aria-label="菜品分类"
                className="flex min-w-0 max-w-full gap-1.5 overflow-x-auto overscroll-x-contain pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:gap-2"
              >
                <button
                  type="button"
                  aria-pressed={selection.section === "all"}
                  onClick={() => handleSectionChange("all")}
                  className={cn(
                    "canteen-section-chip shrink-0",
                    selection.section === "all" && "canteen-section-chip-on",
                  )}
                >
                  全部
                </button>
                {selectedSections.map((section) => (
                  <button
                    key={section.svgKey}
                    type="button"
                    aria-pressed={selection.section === section.svgKey}
                    onClick={() => handleSectionChange(section.svgKey)}
                    className={cn(
                      "canteen-section-chip shrink-0",
                      selection.section === section.svgKey &&
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
            aria-hidden={selection.period !== "lunch"}
            className={cn(
              "border border-[var(--canteen-noon)]/25 bg-[var(--canteen-noon)]/10 px-2.5 py-1.5 text-xs text-[var(--canteen-ink)] sm:px-3 sm:py-2 sm:text-sm",
              selection.period !== "lunch" && "invisible",
            )}
          >
            {AFTERNOON_HINT_TEXT}
          </p>
        ) : null}
      </div>

      <div
        aria-busy={isStale || undefined}
        inert={isStale}
        className={cn(
          "transition-opacity duration-150",
          isStale && "pointer-events-none select-none opacity-60",
        )}
      >
        <CanteenMenuContent
          selection={deferredSelection}
          menuDataByPeriod={menuDataByPeriod}
          liveVoteCounts={liveVoteCounts}
          liveMyVotes={liveMyVotes}
          commentCounts={commentCounts}
          currentUserId={currentUserId}
          commentBlocked={commentBlocked}
          onVoteChange={handleVoteChange}
        />
      </div>
    </div>
  );
}
