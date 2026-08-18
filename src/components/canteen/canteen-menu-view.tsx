"use client";

import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Search, X } from "lucide-react";
import type {
  CanteenMenuItem,
  MealPeriod,
  MenuItemVoteCounts,
  VoteChoice,
} from "@/lib/canteen-types";
import { applyVoteCountDelta, MEAL_PERIODS } from "@/lib/canteen-types";
import {
  AFTERNOON_HINT_TEXT,
  defaultMealPeriodForHkt,
  shouldShowAfternoonHint,
} from "@/lib/canteen-meal-period";
import {
  groupMenuItemsBySvgKey,
  type MenuSection,
} from "@/lib/canteen-menu-sections";
import {
  availableMealPeriods,
  rankAvoidDishes,
  rankRecommendDishes,
} from "@/lib/canteen-rankings";
import { itemHasAllDay } from "@/lib/canteen-meal-periods";
import {
  CanteenViewTabs,
  type CanteenViewMode,
} from "@/components/canteen/canteen-period-tabs";
import { CanteenMealSidebar } from "@/components/canteen/canteen-meal-sidebar";
import { CanteenRankingRow } from "@/components/canteen/canteen-ranking-row";
import { CanteenDishDetailsDialog } from "@/components/canteen/canteen-dish-details-dialog";
import { MenuItemVoteRow } from "@/components/canteen/menu-item-vote-row";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  restoreWindowScroll,
  useRestorePinnedWindowScrollOnMount,
} from "@/lib/pin-window-scroll";

type CanteenMenuViewProps = {
  items: CanteenMenuItem[];
  voteCounts: Record<string, MenuItemVoteCounts>;
  myVotes: Record<string, VoteChoice>;
  commentCounts?: Record<string, number>;
  currentUserId?: string | null;
  commentBlocked?: "banned" | null;
};

type PeriodMenuData = {
  items: CanteenMenuItem[];
  sections: MenuSection[];
};

type MenuDataByPeriod = Record<MealPeriod, PeriodMenuData>;

const EMPTY_COMMENT_COUNTS: Record<string, number> = {};
const MIN_REPUTATION_VOTES = 5;
/** First paint only mounts this many dish rows; more load as the user scrolls. */
export const MENU_INITIAL_VISIBLE_COUNT = 15;
const MENU_VISIBLE_PAGE_SIZE = 15;

type MenuRevealTarget =
  | { kind: "item"; id: string }
  | { kind: "section"; svgKey: string };

type VisibleMenuSection = {
  svgKey: string;
  label: string;
  /** Full section size (for the heading), may exceed mounted `items`. */
  totalCount: number;
  items: CanteenMenuItem[];
};

function pickInitialPeriod(
  available: MealPeriod[],
  preferred: MealPeriod,
): MealPeriod {
  if (available.length === 0) return preferred;
  if (available.includes(preferred)) return preferred;
  return available[0]!;
}

function countItemsToMountSection(
  sections: MenuSection[],
  svgKey: string,
): number {
  let countBeforeSection = 0;
  for (const section of sections) {
    if (section.svgKey === svgKey) {
      return countBeforeSection + Math.min(1, section.items.length);
    }
    countBeforeSection += section.items.length;
  }
  return 0;
}

function indexOfMenuItem(sections: MenuSection[], itemId: string): number {
  let index = 0;
  for (const section of sections) {
    for (const item of section.items) {
      if (item.id === itemId) return index;
      index += 1;
    }
  }
  return -1;
}

function visibleMenuSections(
  sections: MenuSection[],
  limit: number,
): VisibleMenuSection[] {
  let remaining = limit;
  const visible: VisibleMenuSection[] = [];
  for (const section of sections) {
    if (remaining <= 0) break;
    const items = section.items.slice(0, remaining);
    if (items.length === 0) continue;
    visible.push({
      svgKey: section.svgKey,
      label: section.label,
      totalCount: section.items.length,
      items,
    });
    remaining -= items.length;
  }
  return visible;
}

function buildMenuDataByPeriod(items: CanteenMenuItem[]): MenuDataByPeriod {
  const itemsByPeriod: Record<MealPeriod, CanteenMenuItem[]> = {
    breakfast: [],
    lunch: [],
    dinner: [],
  };

  for (const item of items) {
    if (itemHasAllDay(item.mealPeriods)) {
      for (const period of MEAL_PERIODS) itemsByPeriod[period].push(item);
      continue;
    }
    for (const period of MEAL_PERIODS) {
      if (item.mealPeriods.includes(period)) itemsByPeriod[period].push(item);
    }
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
  period,
  view,
  menuDataByPeriod,
  liveVoteCounts,
  liveMyVotes,
  commentCounts,
  revealTarget,
  onRevealHandled,
  onVoteChange,
  onOpenDetails,
}: {
  period: MealPeriod;
  view: CanteenViewMode;
  menuDataByPeriod: MenuDataByPeriod;
  liveVoteCounts: Record<string, MenuItemVoteCounts>;
  liveMyVotes: Record<string, VoteChoice>;
  commentCounts: Record<string, number>;
  revealTarget: MenuRevealTarget | null;
  onRevealHandled: () => void;
  onVoteChange: (
    itemId: string,
    prevVote: VoteChoice,
    nextVote: VoteChoice,
  ) => void;
  onOpenDetails: (item: CanteenMenuItem) => void;
}) {
  const { items: periodItems, sections } = menuDataByPeriod[period];
  const [loadedCount, setLoadedCount] = useState(MENU_INITIAL_VISIBLE_COUNT);
  const loadMoreRef = useRef<HTMLDivElement>(null);

  const revealFloor = useMemo(() => {
    if (!revealTarget) return 0;
    if (revealTarget.kind === "item") {
      const index = indexOfMenuItem(sections, revealTarget.id);
      return index >= 0 ? index + 1 : 0;
    }
    return countItemsToMountSection(sections, revealTarget.svgKey);
  }, [revealTarget, sections]);

  if (revealFloor > loadedCount) {
    setLoadedCount(revealFloor);
  }

  const visibleCount = Math.min(
    periodItems.length,
    Math.max(loadedCount, MENU_INITIAL_VISIBLE_COUNT),
  );
  const hasMore = visibleCount < periodItems.length;
  const mountedSections = useMemo(
    () => visibleMenuSections(sections, visibleCount),
    [sections, visibleCount],
  );

  useLayoutEffect(() => {
    if (!revealTarget) return;
    onRevealHandled();
  }, [revealTarget, onRevealHandled]);

  useEffect(() => {
    if (view !== "menu" || !hasMore) return;
    const node = loadMoreRef.current;
    if (!node || typeof IntersectionObserver === "undefined") return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        setLoadedCount((current) =>
          Math.min(periodItems.length, current + MENU_VISIBLE_PAGE_SIZE),
        );
      },
      { rootMargin: "240px 0px", threshold: 0 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [view, hasMore, periodItems.length, visibleCount]);

  const periodCounts = useMemo(() => {
    const out: Record<string, MenuItemVoteCounts> = {};
    for (const item of periodItems) {
      out[item.id] = liveVoteCounts[item.id] ?? { likes: 0, dislikes: 0 };
    }
    return out;
  }, [periodItems, liveVoteCounts]);

  const ranked = useMemo(() => {
    if (view === "menu") return [];
    const eligible = periodItems.filter((item) => {
      const counts = periodCounts[item.id] ?? { likes: 0, dislikes: 0 };
      return (
        counts.likes + counts.dislikes >= MIN_REPUTATION_VOTES &&
        (view === "recommend"
          ? counts.likes > counts.dislikes
          : counts.dislikes > counts.likes)
      );
    });
    return (
      view === "recommend"
        ? rankRecommendDishes(eligible, periodCounts)
        : rankAvoidDishes(eligible, periodCounts)
    ).slice(0, 5);
  }, [periodItems, periodCounts, view]);

  if (periodItems.length === 0) {
    return (
      <div
        id={`canteen-view-panel-${view}`}
        role="tabpanel"
        aria-labelledby={`canteen-view-tab-${view}`}
        className="px-1 py-10 text-center sm:py-16"
      >
        <p className="text-[var(--canteen-muted)]">该餐段菜单待更新</p>
      </div>
    );
  }

  if (view === "menu") {
    return (
      <div
        id="canteen-view-panel-menu"
        className="canteen-menu-sections"
        role="tabpanel"
        aria-labelledby="canteen-view-tab-menu"
      >
        {mountedSections.map((section) => (
          <section
            key={section.svgKey}
            data-menu-section-key={section.svgKey}
            aria-labelledby={`canteen-section-${section.svgKey}`}
            className="canteen-menu-section"
          >
            <h2
              id={`canteen-section-${section.svgKey}`}
              data-section-key={section.svgKey}
              tabIndex={-1}
              className="canteen-menu-section-title"
            >
              {section.label}
              <span className="text-xs font-normal tabular-nums text-[var(--canteen-muted)]">
                {section.totalCount} 款
              </span>
            </h2>
            <ul className="canteen-menu-list">
              {section.items.map((item) => (
                <MenuItemVoteRow
                  key={item.id}
                  item={item}
                  counts={periodCounts[item.id]}
                  myVote={liveMyVotes[item.id] ?? null}
                  onVoteChange={onVoteChange}
                  initialCommentCount={commentCounts[item.id] ?? 0}
                  onOpenDetails={onOpenDetails}
                />
              ))}
            </ul>
          </section>
        ))}
        {hasMore ? (
          <div
            ref={loadMoreRef}
            className="flex flex-col items-center gap-2 px-1 py-6"
          >
            <p className="text-xs text-[var(--canteen-muted)]">
              已显示 {visibleCount} / {periodItems.length} 道菜
            </p>
            <button
              type="button"
              className="inline-flex min-h-10 items-center justify-center rounded-lg border border-[var(--canteen-line)] bg-[var(--canteen-surface)] px-4 text-sm font-medium text-[var(--canteen-ink)] transition-colors hover:bg-[var(--canteen-fill)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--canteen-focus)]"
              onClick={() =>
                setLoadedCount((current) =>
                  Math.min(
                    periodItems.length,
                    current + MENU_VISIBLE_PAGE_SIZE,
                  ),
                )
              }
            >
              加载更多
            </button>
          </div>
        ) : null}
      </div>
    );
  }

  const recommend = view === "recommend";
  return (
    <section
      id={`canteen-view-panel-${view}`}
      role="tabpanel"
      aria-labelledby={`canteen-view-tab-${view}`}
      className="canteen-ranking-panel"
    >
      <header className="canteen-ranking-header">
        <div>
          <p className="canteen-ranking-kicker">
            {recommend ? "红榜" : "黑榜"} ·{" "}
            {period === "breakfast"
              ? "早餐"
              : period === "lunch"
                ? "午餐"
                : "晚餐"}
          </p>
          <h2>{recommend ? "近期推荐" : "近期避雷"}</h2>
        </div>
        <p>满 {MIN_REPUTATION_VOTES} 票入榜</p>
      </header>
      {ranked.length > 0 ? (
        <ol className="canteen-ranking-list">
          {ranked.map((entry, index) => (
            <CanteenRankingRow
              key={entry.item.id}
              rank={index + 1}
              entry={entry}
              emphasis={recommend ? "recommend" : "avoid"}
              myVote={liveMyVotes[entry.item.id] ?? null}
              onVoteChange={onVoteChange}
              initialCommentCount={commentCounts[entry.item.id] ?? 0}
              onOpenDetails={onOpenDetails}
            />
          ))}
        </ol>
      ) : (
        <div className="canteen-ranking-empty">
          <p>暂时还没有菜品达到入榜票数。</p>
        </div>
      )}
    </section>
  );
});

function MenuFinder({
  open,
  onOpenChange,
  sections,
  onNavigateToSection,
  onNavigateToItem,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sections: MenuSection[];
  onNavigateToSection: (svgKey: MenuSection["svgKey"]) => void;
  onNavigateToItem: (itemId: string) => void;
}) {
  const [query, setQuery] = useState("");
  const normalizedQuery = query.trim().toLocaleLowerCase("zh-HK");
  const allItems = useMemo(
    () => sections.flatMap((section) => section.items),
    [sections],
  );
  const results = useMemo(
    () =>
      normalizedQuery
        ? allItems.filter((item) =>
            item.name.toLocaleLowerCase("zh-HK").includes(normalizedQuery),
          )
        : [],
    [allItems, normalizedQuery],
  );

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) setQuery("");
      }}
    >
      <DialogContent
        showCloseButton={false}
        className="canteen-finder fixed top-auto bottom-0 left-0 max-h-[min(78dvh,42rem)] max-w-none translate-x-0 translate-y-0 overflow-hidden rounded-t-2xl rounded-b-none p-0 sm:top-1/2 sm:bottom-auto sm:left-1/2 sm:max-w-lg sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl"
      >
        <DialogHeader className="border-b border-[var(--canteen-line)] px-4 pt-4 pb-3">
          <div className="flex items-center justify-between gap-3">
            <DialogTitle className="canteen-display text-lg font-semibold">
              查找菜品
            </DialogTitle>
            <DialogClose className="canteen-finder-close">
              <X className="size-5" aria-hidden />
              <span className="sr-only">关闭</span>
            </DialogClose>
          </div>
          <DialogDescription>
            搜索当前餐段，或直接跳转到菜单分类。
          </DialogDescription>
          <label className="canteen-finder-search">
            <span className="sr-only">搜索菜品</span>
            <Search className="size-4 shrink-0" aria-hidden />
            <input
              type="search"
              name="menu-search"
              autoComplete="off"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索菜名…"
            />
          </label>
        </DialogHeader>

        <div className="overflow-y-auto overscroll-contain px-2 py-2">
          {normalizedQuery ? (
            <div aria-live="polite">
              <p className="px-2 py-2 text-xs text-[var(--canteen-muted)]">
                找到 {results.length} 道菜
              </p>
              {results.length > 0 ? (
                <ul>
                  {results.map((item) => (
                    <li key={item.id}>
                      <button
                        type="button"
                        className="canteen-finder-item"
                        onClick={() => onNavigateToItem(item.id)}
                      >
                        {item.name}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="px-2 py-8 text-center text-sm text-[var(--canteen-muted)]">
                  没有找到相关菜品
                </p>
              )}
            </div>
          ) : (
            <nav aria-label="菜单分类">
              <p className="px-2 py-2 text-xs text-[var(--canteen-muted)]">
                跳转分类
              </p>
              <ul>
                {sections.map((section) => (
                  <li key={section.svgKey}>
                    <button
                      type="button"
                      className="canteen-finder-item"
                      onClick={() => onNavigateToSection(section.svgKey)}
                    >
                      <span>{section.label}</span>
                      <span className="font-mono text-xs tabular-nums text-[var(--canteen-muted)]">
                        {section.items.length}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </nav>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function CanteenMenuView({
  items,
  voteCounts,
  myVotes,
  commentCounts = EMPTY_COMMENT_COUNTS,
  currentUserId = null,
  commentBlocked = null,
}: CanteenMenuViewProps) {
  const servedPeriods = useMemo(() => availableMealPeriods(items), [items]);
  const servedPeriodsKey = servedPeriods.join(",");
  const [period, setPeriod] = useState<MealPeriod>("lunch");
  const [expandedPeriod, setExpandedPeriod] = useState<MealPeriod | null>(
    "lunch",
  );
  const [clientReady, setClientReady] = useState(false);
  const [view, setView] = useState<CanteenViewMode>("menu");
  const [activeSection, setActiveSection] = useState("all");
  const [showAfternoonHint, setShowAfternoonHint] = useState(false);
  const [finderOpen, setFinderOpen] = useState(false);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [revealTarget, setRevealTarget] = useState<MenuRevealTarget | null>(
    null,
  );
  const [menuRevealEpoch, setMenuRevealEpoch] = useState(0);
  const pendingNavigateRef = useRef<MenuRevealTarget | null>(null);
  const [liveVoteCounts, setLiveVoteCounts] =
    useState<Record<string, MenuItemVoteCounts>>(voteCounts);
  const [liveMyVotes, setLiveMyVotes] =
    useState<Record<string, VoteChoice>>(myVotes);
  const [liveCommentCounts, setLiveCommentCounts] =
    useState<Record<string, number>>(commentCounts);
  const periodInitializedRef = useRef(false);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const trackMenuPositionRef = useRef(true);
  const sidebarScrollYRef = useRef<number | null>(null);
  const pendingPeriodScrollRef = useRef<{
    period: MealPeriod;
    sectionKey: string;
  } | null>(null);

  useRestorePinnedWindowScrollOnMount();

  useLayoutEffect(() => {
    const scrollY = sidebarScrollYRef.current;
    if (scrollY == null) return;
    restoreWindowScroll(scrollY);
    const frame = requestAnimationFrame(() => {
      restoreWindowScroll(scrollY);
      if (sidebarScrollYRef.current === scrollY) {
        sidebarScrollYRef.current = null;
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [expandedPeriod, period]);

  const menuDataByPeriod = useMemo(() => buildMenuDataByPeriod(items), [items]);
  const selectedSections = menuDataByPeriod[period].sections;
  const firstSectionKey = selectedSections[0]?.svgKey ?? "all";
  const activeCategory =
    activeSection !== "all" &&
    selectedSections.some((section) => section.svgKey === activeSection)
      ? activeSection
      : firstSectionKey;
  const selectedItem = items.find((item) => item.id === selectedItemId) ?? null;

  const getStickyToolbarBottom = useCallback(() => {
    const toolbar = toolbarRef.current;
    if (!toolbar) return 0;
    const rect = toolbar.getBoundingClientRect();
    const stickyTop = Number.parseFloat(getComputedStyle(toolbar).top);
    return (Number.isFinite(stickyTop) ? stickyTop : rect.top) + rect.height;
  }, []);

  const getStickyContentTop = useCallback(() => {
    const sectionTitle = contentRef.current?.querySelector<HTMLElement>(
      ".canteen-menu-section-title",
    );
    return (
      getStickyToolbarBottom() +
      (sectionTitle?.getBoundingClientRect().height ?? 30)
    );
  }, [getStickyToolbarBottom]);

  const getSectionElement = useCallback((svgKey: string) => {
    return Array.from(
      contentRef.current?.querySelectorAll<HTMLElement>(
        "[data-menu-section-key]",
      ) ?? [],
    ).find((section) => section.dataset.menuSectionKey === svgKey);
  }, []);

  useLayoutEffect(() => {
    const pending = pendingPeriodScrollRef.current;
    if (view !== "menu" || pending == null || pending.period !== period) {
      return;
    }

    const frame = requestAnimationFrame(() => {
      const section = getSectionElement(pending.sectionKey);
      if (!section) return;
      window.scrollTo({
        top: Math.max(
          0,
          window.scrollY +
            section.getBoundingClientRect().top -
            getStickyToolbarBottom(),
        ),
        behavior: "instant",
      });
      pendingPeriodScrollRef.current = null;
      requestAnimationFrame(() => {
        trackMenuPositionRef.current = true;
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [
    getSectionElement,
    getStickyToolbarBottom,
    menuRevealEpoch,
    period,
    selectedSections,
    view,
  ]);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    const periods = (
      servedPeriodsKey.length > 0 ? servedPeriodsKey.split(",") : []
    ) as MealPeriod[];
    const now = new Date();
    setShowAfternoonHint(
      periods.includes("lunch") &&
        periods.includes("dinner") &&
        shouldShowAfternoonHint(now),
    );

    if (!periodInitializedRef.current) {
      periodInitializedRef.current = true;
      const initialPeriod = pickInitialPeriod(
        periods,
        defaultMealPeriodForHkt(now),
      );
      setPeriod(initialPeriod);
      setExpandedPeriod(initialPeriod);
      setClientReady(true);
      return;
    }
    if (periods.length > 0 && !periods.includes(period)) {
      const nextPeriod = pickInitialPeriod(periods, period);
      setPeriod(nextPeriod);
      setExpandedPeriod(nextPeriod);
    }
  }, [period, servedPeriodsKey]);
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    if (view !== "menu" || typeof IntersectionObserver === "undefined") return;
    if (pendingPeriodScrollRef.current == null) {
      trackMenuPositionRef.current = true;
    }
    const sections = contentRef.current?.querySelectorAll<HTMLElement>(
      "[data-menu-section-key]",
    );
    if (!sections?.length) return;

    const visibleSections = new Set<Element>();
    const sectionObserver = new IntersectionObserver(
      (entries) => {
        if (!trackMenuPositionRef.current) return;
        for (const entry of entries) {
          if (entry.isIntersecting) visibleSections.add(entry.target);
          else visibleSections.delete(entry.target);
        }
        const sectionKey = Array.from(sections).find((section) =>
          visibleSections.has(section),
        )?.dataset.menuSectionKey;
        if (sectionKey) setActiveSection(sectionKey);
      },
      {
        rootMargin: `-${Math.round(getStickyContentTop())}px 0px -70% 0px`,
        threshold: 0,
      },
    );

    sections.forEach((section) => sectionObserver.observe(section));
    return () => sectionObserver.disconnect();
  }, [getStickyContentTop, selectedSections, view]);

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

  function handlePeriodChange(
    nextPeriod: MealPeriod,
    sectionKey?: MenuSection["svgKey"],
  ) {
    if (nextPeriod === period) return;
    const targetSection =
      sectionKey ?? menuDataByPeriod[nextPeriod].sections[0]?.svgKey;
    sidebarScrollYRef.current = null;
    trackMenuPositionRef.current = false;
    pendingPeriodScrollRef.current =
      view === "menu" && targetSection
        ? { period: nextPeriod, sectionKey: targetSection }
        : null;
    if (view === "menu" && targetSection) {
      setRevealTarget({ kind: "section", svgKey: targetSection });
    }
    setActiveSection(targetSection ?? "all");
    setPeriod(nextPeriod);
  }

  function handleViewChange(nextView: CanteenViewMode) {
    if (nextView === view) return;
    if (view === "menu") {
      trackMenuPositionRef.current = false;
    }
    setView(nextView);
    setFinderOpen(false);
    requestAnimationFrame(() => {
      if (nextView === "menu") return;
      setActiveSection("all");
      const top = contentRef.current?.getBoundingClientRect().top;
      if (top == null) return;
      const stickyBottom = getStickyContentTop();
      window.scrollTo({
        top: Math.max(0, window.scrollY + top - stickyBottom),
        behavior: "instant",
      });
    });
  }

  const navigateToElement = useCallback(
    (
      element: HTMLElement | null,
      belowToolbar = 0,
      smooth = true,
      focusElement: HTMLElement | null = element,
      onAfterNavigate?: () => void,
    ) => {
      if (!element) return;
      setFinderOpen(false);
      requestAnimationFrame(() => {
        const toolbarBottom = getStickyToolbarBottom();
        window.scrollTo({
          top: Math.max(
            0,
            window.scrollY +
              element.getBoundingClientRect().top -
              toolbarBottom -
              belowToolbar,
          ),
          behavior:
            !smooth ||
            window.matchMedia("(prefers-reduced-motion: reduce)").matches
              ? "instant"
              : "smooth",
        });
        focusElement?.focus({ preventScroll: true });
        onAfterNavigate?.();
      });
    },
    [getStickyToolbarBottom],
  );

  const handleRevealHandled = useCallback(() => {
    const pending = pendingNavigateRef.current;
    pendingNavigateRef.current = null;
    setRevealTarget(null);
    setMenuRevealEpoch((epoch) => epoch + 1);
    if (!pending) return;

    requestAnimationFrame(() => {
      if (pending.kind === "item") {
        navigateToElement(
          document.getElementById(`canteen-menu-item-${pending.id}`),
          30,
        );
        return;
      }
      const section = getSectionElement(pending.svgKey);
      const heading = document.getElementById(
        `canteen-section-${pending.svgKey}`,
      );
      trackMenuPositionRef.current = false;
      setActiveSection(pending.svgKey);
      navigateToElement(section ?? null, 0, false, heading, () => {
        requestAnimationFrame(() => {
          trackMenuPositionRef.current = true;
        });
      });
    });
  }, [getSectionElement, navigateToElement]);

  const navigateToSection = useCallback((svgKey: MenuSection["svgKey"]) => {
    pendingNavigateRef.current = { kind: "section", svgKey };
    setRevealTarget({ kind: "section", svgKey });
  }, []);

  const navigateToItem = useCallback((itemId: string) => {
    pendingNavigateRef.current = { kind: "item", id: itemId };
    setRevealTarget({ kind: "item", id: itemId });
  }, []);

  function handleSidebarPeriodToggle(nextPeriod: MealPeriod) {
    if (nextPeriod === period && sidebarScrollYRef.current == null) {
      sidebarScrollYRef.current = window.scrollY;
    }
    if (view !== "menu") {
      setExpandedPeriod(nextPeriod);
      if (nextPeriod !== period) handlePeriodChange(nextPeriod);
      return;
    }
    if (expandedPeriod === nextPeriod) {
      setExpandedPeriod(null);
      return;
    }
    setExpandedPeriod(nextPeriod);
    if (nextPeriod !== period) handlePeriodChange(nextPeriod);
  }

  function handleSidebarSectionSelect(
    nextPeriod: MealPeriod,
    svgKey: MenuSection["svgKey"],
  ) {
    if (nextPeriod !== period) {
      handlePeriodChange(nextPeriod, svgKey);
      return;
    }
    navigateToSection(svgKey);
  }

  const openDetails = useCallback((item: CanteenMenuItem) => {
    setSelectedItemId(item.id);
    setDetailsOpen(true);
  }, []);

  const handleCommentCountChange = useCallback(
    (itemId: string, count: number) => {
      setLiveCommentCounts((current) => ({
        ...current,
        [itemId]: count,
      }));
    },
    [],
  );

  if (items.length === 0) {
    return (
      <div className="px-1 py-10 text-center sm:py-16">
        <p className="text-[var(--canteen-muted)]">菜单待更新</p>
      </div>
    );
  }

  const showHintNow = showAfternoonHint && period === "lunch";

  return (
    <div
      className="mx-auto min-w-0 w-full max-w-[52rem]"
      data-canteen-menu-ready={clientReady}
    >
      <div
        ref={toolbarRef}
        className="canteen-toolbar sticky top-[var(--navbar-height)] z-20 -mx-3 sm:mx-0"
      >
        <div className="canteen-toolbar-primary">
          <CanteenViewTabs value={view} onChange={handleViewChange} />
          <button
            type="button"
            aria-label="查找菜品"
            aria-haspopup="dialog"
            aria-expanded={finderOpen}
            onClick={() => {
              setView("menu");
              setFinderOpen(true);
            }}
            className="canteen-toolbar-search"
          >
            <Search className="size-4" aria-hidden />
          </button>
        </div>
      </div>

      <div
        className={`canteen-order-workspace${
          view === "menu" ? "" : " canteen-order-workspace--ranking"
        }`}
      >
        <aside className="canteen-order-sidebar" aria-label="菜单分类">
          <CanteenMealSidebar
            periods={servedPeriods}
            sectionsByPeriod={{
              breakfast: menuDataByPeriod.breakfast.sections,
              lunch: menuDataByPeriod.lunch.sections,
              dinner: menuDataByPeriod.dinner.sections,
            }}
            currentPeriod={period}
            expandedPeriod={expandedPeriod}
            activeSection={activeCategory}
            showCategories={view === "menu"}
            onPreparePeriodToggle={(nextPeriod) => {
              sidebarScrollYRef.current =
                nextPeriod === period ? window.scrollY : null;
            }}
            onTogglePeriod={handleSidebarPeriodToggle}
            onSelectSection={handleSidebarSectionSelect}
          />
        </aside>

        <main className="canteen-order-content">
          {showHintNow ? (
            <p role="status" className="canteen-period-hint">
              {AFTERNOON_HINT_TEXT}
            </p>
          ) : null}

          <div ref={contentRef} className="min-w-0">
            <CanteenMenuContent
              key={period}
              period={period}
              view={view}
              menuDataByPeriod={menuDataByPeriod}
              liveVoteCounts={liveVoteCounts}
              liveMyVotes={liveMyVotes}
              commentCounts={liveCommentCounts}
              revealTarget={revealTarget}
              onRevealHandled={handleRevealHandled}
              onVoteChange={handleVoteChange}
              onOpenDetails={openDetails}
            />
          </div>
        </main>
      </div>

      <CanteenDishDetailsDialog
        item={selectedItem}
        open={detailsOpen}
        counts={
          selectedItem
            ? (liveVoteCounts[selectedItem.id] ?? { likes: 0, dislikes: 0 })
            : { likes: 0, dislikes: 0 }
        }
        myVote={selectedItem ? (liveMyVotes[selectedItem.id] ?? null) : null}
        onVoteChange={handleVoteChange}
        currentUserId={currentUserId}
        commentBlocked={commentBlocked}
        initialCommentCount={
          selectedItem ? (liveCommentCounts[selectedItem.id] ?? 0) : 0
        }
        onCommentCountChange={(count) => {
          if (!selectedItem) return;
          handleCommentCountChange(selectedItem.id, count);
        }}
        onOpenChange={setDetailsOpen}
        onAfterClose={() => setSelectedItemId(null)}
      />

      <MenuFinder
        open={finderOpen}
        onOpenChange={setFinderOpen}
        sections={selectedSections}
        onNavigateToSection={navigateToSection}
        onNavigateToItem={navigateToItem}
      />
    </div>
  );
}
