"use client";

import { ArrowLeft, Heart, Info, Sparkles, Star, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { FoodleMatch } from "@/components/food-map/foodle-match";
import { RestaurantArtwork } from "@/components/food-map/restaurant-artwork";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  FOODLE_CANDIDATE_DECISIONS_STORAGE_KEY,
  decideCandidate,
  emptyCandidateDecisionStore,
  getCandidateDecision,
  parseCandidateDecisionStore,
  serializeCandidateDecisionStore,
  type CandidateDecision,
  type CandidateDecisionState,
} from "@/lib/food-map/candidate-decisions";
import {
  type FoodMapBudget,
  MTR_STATIONS,
  type MtrStation,
} from "@/lib/food-map/data";
import { buildFoodleDiscoveryBatch } from "@/lib/food-map/discovery";
import {
  FOODLE_MATCH_STORAGE_KEY,
  parseFoodleMatchStore,
  type FoodleMatchResult,
} from "@/lib/food-map/match";
import {
  FOODLE_PENDING_INTENT_STORAGE_KEY,
  serializeFoodlePendingIntent,
  type FoodlePendingIntent,
} from "@/lib/food-map/pending-intent";
import {
  migrateFoodleLocalStateAction,
  saveFoodleCandidateDecisionAction,
  saveFoodleMatchResultAction,
} from "@/lib/food-map/personal-state-actions";
import {
  hasFoodlePersonalState,
  parseFoodlePersonalState,
  type FoodlePersonalSnapshot,
  type FoodlePersonalState,
} from "@/lib/food-map/personal-state";
import {
  FOODLE_RESTAURANT_CATALOG_STATE,
  FOODLE_RESTAURANTS,
  type FoodleRestaurant,
} from "@/lib/food-map/restaurant-catalog";
import type { FoodleCatalogState } from "@/lib/food-map/restaurant-import";

const DECISION_LABELS: Record<CandidateDecisionState, string> = {
  unseen: "未选择",
  saved: "已想吃",
  passed: "已略过",
};

const stationById = new Map(
  MTR_STATIONS.map((station) => [station.id, station]),
);

function available(value: string | number | null) {
  return value ?? "资料暂缺";
}

const countFormatter = new Intl.NumberFormat("zh-HK");

function count(value: number | null) {
  return value === null ? "资料暂缺" : countFormatter.format(value);
}

function openingClass(state: FoodleRestaurant["sourceFacts"]["openingState"]) {
  if (state === "open") {
    return "bg-[#e9f2ea] text-[#315b36] dark:bg-[#203427] dark:text-[#b7d3be]";
  }
  if (state === "closed") {
    return "bg-muted text-muted-foreground";
  }
  return "bg-[#f5f0e7] text-[#6f562c] dark:bg-[#332b20] dark:text-[#dfc79c]";
}

function RestaurantFacts({
  restaurant,
  station,
  expanded = false,
}: {
  restaurant: FoodleRestaurant;
  station: MtrStation;
  expanded?: boolean;
}) {
  const { sourceFacts, foodle } = restaurant;
  const openingLabel =
    sourceFacts.openingLabel ??
    (sourceFacts.openingState === "unknown" ? "营业时间资料暂缺" : "资料暂缺");

  if (!expanded) {
    return (
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
          <span
            className={`rounded-full px-2.5 py-1 text-xs font-medium ${openingClass(sourceFacts.openingState)}`}
          >
            {openingLabel}
          </span>
          <span className="text-muted-foreground">
            {sourceFacts.cuisines?.join(" · ") ?? "菜系资料暂缺"}
          </span>
          <span aria-hidden="true" className="text-border">
            /
          </span>
          <span>{available(sourceFacts.priceRange)}</span>
        </div>

        <dl className="flex flex-wrap items-center gap-x-2 gap-y-1 border-t pt-3 text-xs font-medium">
          <div>
            <dt className="sr-only">港铁车程</dt>
            <dd>港铁 {station.minutes} 分钟</dd>
          </div>
          <span aria-hidden="true" className="text-border">
            ·
          </span>
          <div>
            <dt className="sr-only">出站步行</dt>
            <dd>
              步行{" "}
              {foodle.walkMinutes === null ? (
                <span>资料暂缺</span>
              ) : (
                `${foodle.walkMinutes} 分钟`
              )}
            </dd>
          </div>
          <span aria-hidden="true" className="text-border">
            ·
          </span>
          <div>
            <dt className="sr-only">累计打卡</dt>
            <dd>
              Foodle{" "}
              {foodle.totalCheckins === null ? (
                <span>资料暂缺</span>
              ) : (
                `${count(foodle.totalCheckins)} 次打卡`
              )}
            </dd>
          </div>
        </dl>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span
          className={`rounded-full px-2.5 py-1 text-xs font-medium ${openingClass(sourceFacts.openingState)}`}
        >
          {openingLabel}
        </span>
        <span className="text-muted-foreground">
          {sourceFacts.cuisines?.join(" · ") ?? "菜系资料暂缺"}
        </span>
        <span aria-hidden="true" className="text-border">
          /
        </span>
        <span>{available(sourceFacts.priceRange)}</span>
      </div>

      <dl className="grid grid-cols-2 overflow-hidden rounded-xl border bg-muted/25 text-sm">
        <div className="border-r p-3">
          <dt className="text-xs text-muted-foreground">港铁车程</dt>
          <dd className="mt-1 font-medium">
            大学至{station.nameZh} · {station.minutes} 分钟
          </dd>
        </div>
        <div className="p-3">
          <dt className="text-xs text-muted-foreground">出站步行</dt>
          <dd className="mt-1 font-medium">
            {foodle.walkMinutes === null
              ? "资料暂缺"
              : `${foodle.walkMinutes} 分钟`}
          </dd>
        </div>
      </dl>

      <dl className="grid grid-cols-3 gap-px overflow-hidden rounded-xl border bg-border text-center">
        <div className="bg-background px-2 py-3">
          <dt className="text-[11px] text-muted-foreground">Foodle 均分</dt>
          <dd className="mt-1 text-base font-semibold tabular-nums">
            {available(foodle.averageScore)}
          </dd>
        </div>
        <div className="bg-background px-2 py-3">
          <dt className="text-[11px] text-muted-foreground">到访人数</dt>
          <dd className="mt-1 text-base font-semibold tabular-nums">
            {count(foodle.uniqueVisitors)}
          </dd>
        </div>
        <div className="bg-background px-2 py-3">
          <dt className="text-[11px] text-muted-foreground">累计打卡</dt>
          <dd className="mt-1 text-base font-semibold tabular-nums">
            {count(foodle.totalCheckins)}
          </dd>
        </div>
      </dl>

      {expanded ? (
        <dl className="divide-y rounded-xl border px-3 text-sm">
          <div className="grid grid-cols-[6rem_1fr] gap-3 py-3">
            <dt className="text-muted-foreground">车站</dt>
            <dd>{station.nameZh}站</dd>
          </div>
          <div className="grid grid-cols-[6rem_1fr] gap-3 py-3">
            <dt className="text-muted-foreground">菜系</dt>
            <dd>{sourceFacts.cuisines?.join("、") ?? "资料暂缺"}</dd>
          </div>
          <div className="grid grid-cols-[6rem_1fr] gap-3 py-3">
            <dt className="text-muted-foreground">价格范围</dt>
            <dd>{available(sourceFacts.priceRange)}</dd>
          </div>
        </dl>
      ) : null}
    </div>
  );
}

function RestaurantDetails({
  restaurant,
  station,
  open,
  onOpenChange,
}: {
  restaurant: FoodleRestaurant;
  station: MtrStation;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="max-h-[min(42rem,calc(100dvh-2rem))] overflow-y-auto overscroll-contain motion-reduce:duration-0 motion-reduce:data-open:animate-none motion-reduce:data-closed:animate-none sm:max-w-lg"
      >
        <DialogHeader className="pr-12">
          <DialogTitle className="text-xl leading-tight">
            {restaurant.sourceFacts.name}
          </DialogTitle>
          <DialogDescription>
            查看资料不会改变你的想吃或略过选择。
          </DialogDescription>
        </DialogHeader>
        <RestaurantArtwork key={restaurant.id} restaurant={restaurant} />
        <RestaurantFacts restaurant={restaurant} station={station} expanded />
        {restaurant.source.url ? (
          <a
            href={restaurant.source.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-11 items-center justify-center rounded-lg border px-4 text-sm font-medium hover:bg-muted focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            在 OpenRice 查看
          </a>
        ) : (
          <p className="rounded-lg bg-muted/55 px-3 py-2 text-sm text-muted-foreground">
            OpenRice 链接资料暂缺
          </p>
        )}
        <DialogClose
          render={
            <button
              type="button"
              className="min-h-11 rounded-lg border px-4 text-sm font-medium hover:bg-muted focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            />
          }
        >
          关闭详情
        </DialogClose>
      </DialogContent>
    </Dialog>
  );
}

interface DragStart {
  x: number;
  y: number;
  cancelled: boolean;
}

function RestaurantCard({
  restaurant,
  station,
  decision,
  ready,
  onDecision,
}: {
  restaurant: FoodleRestaurant;
  station: MtrStation;
  decision: CandidateDecisionState;
  ready: boolean;
  onDecision: (decision: CandidateDecision) => void;
}) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [dragX, setDragX] = useState(0);
  const dragStart = useRef<DragStart | null>(null);

  function startDrag(event: React.PointerEvent<HTMLElement>) {
    if ((event.target as Element).closest("button")) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    dragStart.current = {
      x: event.clientX,
      y: event.clientY,
      cancelled: false,
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }

  function moveDrag(event: React.PointerEvent<HTMLElement>) {
    const start = dragStart.current;
    if (!start) return;
    const deltaX = event.clientX - start.x;
    const deltaY = event.clientY - start.y;

    if (Math.abs(deltaY) > Math.abs(deltaX) && Math.abs(deltaY) > 12) {
      start.cancelled = true;
      setDragX(0);
      return;
    }
    if (start.cancelled) return;
    setDragX(Math.max(-96, Math.min(96, deltaX)));
  }

  function finishDrag(event: React.PointerEvent<HTMLElement>) {
    const start = dragStart.current;
    dragStart.current = null;
    setDragX(0);
    if (!start || start.cancelled || !ready) return;

    const deltaX = event.clientX - start.x;
    const deltaY = event.clientY - start.y;
    if (Math.abs(deltaX) < 72 || Math.abs(deltaX) <= Math.abs(deltaY) * 1.2) {
      return;
    }
    onDecision(deltaX > 0 ? "saved" : "passed");
  }

  return (
    <>
      <div className="relative pt-3">
        <div
          className="pointer-events-none absolute inset-x-6 top-0 bottom-3 rounded-2xl border bg-muted/40"
          aria-hidden="true"
        />
        <div
          className="pointer-events-none absolute inset-x-3 top-1.5 bottom-1.5 rounded-2xl border bg-background"
          aria-hidden="true"
        />
        <article
          data-testid="restaurant-card"
          onPointerDown={startDrag}
          onPointerMove={moveDrag}
          onPointerUp={finishDrag}
          onPointerCancel={() => {
            dragStart.current = null;
            setDragX(0);
          }}
          className={[
            "relative touch-pan-y select-none overflow-hidden rounded-2xl border bg-background shadow-[0_8px_24px_rgba(27,20,30,0.08)] dark:shadow-none",
            dragX === 0 ? "transition-transform" : "",
            "motion-reduce:transition-none",
          ].join(" ")}
          style={{
            transform: `translateX(${dragX}px) rotate(${dragX / 32}deg)`,
          }}
        >
          <RestaurantArtwork
            key={restaurant.id}
            restaurant={restaurant}
            immersive
          />
          <span
            aria-hidden="true"
            className="pointer-events-none absolute top-20 left-5 rotate-[-10deg] rounded-lg border-4 border-[#672d7e] px-3 py-1 text-xl font-black text-[#672d7e] uppercase"
            style={{ opacity: Math.max(0, dragX / 72) }}
          >
            想吃
          </span>
          <span
            aria-hidden="true"
            className="pointer-events-none absolute top-20 right-5 rotate-[10deg] rounded-lg border-4 border-foreground/70 px-3 py-1 text-xl font-black text-foreground/70 uppercase"
            style={{ opacity: Math.max(0, -dragX / 72) }}
          >
            略过
          </span>
          <div className="p-4 sm:p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-medium tracking-[0.16em] text-[#672d7e] uppercase dark:text-[#c48fda]">
                  {station.nameZh} ·{" "}
                  {restaurant.sourceFacts.cuisines?.[0] ?? "菜系暂缺"}
                </p>
                <h3 className="mt-2 break-words text-2xl leading-tight font-semibold tracking-tight text-balance">
                  {restaurant.sourceFacts.name}
                </h3>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <span
                  aria-label={`Foodle 均分：${available(restaurant.foodle.averageScore)}`}
                  className="inline-flex items-center gap-1 text-sm font-semibold tabular-nums"
                >
                  <Star
                    className="size-4 fill-[#672d7e] text-[#672d7e] dark:fill-[#c48fda] dark:text-[#c48fda]"
                    aria-hidden="true"
                  />
                  {available(restaurant.foodle.averageScore)}
                </span>
                <button
                  type="button"
                  aria-label="查看餐厅详情"
                  onClick={() => setDetailsOpen(true)}
                  className="grid size-11 place-items-center rounded-full border hover:bg-muted focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  <Info className="size-4" aria-hidden="true" />
                </button>
              </div>
            </div>

            <div className="mt-5">
              <RestaurantFacts restaurant={restaurant} station={station} />
            </div>

            <div
              className="sr-only"
              aria-label={`当前状态：${DECISION_LABELS[decision]}`}
            >
              {DECISION_LABELS[decision]}
            </div>
          </div>
        </article>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-[45] mx-auto flex max-w-[31rem] items-center justify-center gap-6 border-t bg-background/95 px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] backdrop-blur-sm sm:bottom-4 sm:rounded-b-2xl sm:border-x sm:border-b">
        <button
          type="button"
          aria-label="略过"
          disabled={!ready}
          onClick={() => onDecision("passed")}
          className="grid size-16 place-items-center rounded-full border bg-background text-foreground shadow-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-wait disabled:opacity-55"
        >
          <X className="size-7" strokeWidth={2.2} aria-hidden="true" />
        </button>
        <button
          type="button"
          aria-label="想吃"
          disabled={!ready}
          onClick={() => onDecision("saved")}
          className="grid size-16 place-items-center rounded-full bg-[#672d7e] text-white shadow-sm hover:bg-[#552268] focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-[#672d7e]/45 disabled:cursor-wait disabled:opacity-55 dark:bg-[#c48fda] dark:text-[#211225] dark:hover:bg-[#d3a8e5]"
        >
          <Heart className="size-8" fill="currentColor" aria-hidden="true" />
        </button>
      </div>

      <RestaurantDetails
        restaurant={restaurant}
        station={station}
        open={detailsOpen}
        onOpenChange={setDetailsOpen}
      />
    </>
  );
}

interface DiscoverySnapshot {
  budget: FoodMapBudget;
  station: MtrStation | null;
  sourceLabel: string;
  eligibleCount: number;
}

function discoverySourceLabel(
  station: MtrStation | null,
  budget: FoodMapBudget,
) {
  return station
    ? `${station.nameZh}站 · ${budget} 分钟范围`
    : `${budget} 分钟范围`;
}

function catalogStatusLabel(state: FoodleCatalogState) {
  if (state === "partial") return "部分餐厅资料未载入";
  if (state === "stale") return "餐厅资料可能已过期";
  if (state === "empty") return "当前范围没有餐厅资料";
  if (state === "failed") return "餐厅资料暂时无法载入";
  return null;
}

const MATCH_FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

function handleMatchSurfaceKeyDown(
  event: React.KeyboardEvent<HTMLElement>,
  onEscape: () => void,
) {
  if (event.key === "Escape") {
    event.preventDefault();
    event.stopPropagation();
    onEscape();
    return;
  }
  if (event.key !== "Tab") return;
  const focusable = [
    ...event.currentTarget.querySelectorAll<HTMLElement>(
      MATCH_FOCUSABLE_SELECTOR,
    ),
  ].filter(
    (element) =>
      !element.hidden && element.getAttribute("aria-hidden") !== "true",
  );
  const first = focusable[0];
  const last = focusable.at(-1);
  if (!first || !last) return;

  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

export function RestaurantDiscoveryPanel({
  station,
  budget,
  notice,
  personalSnapshot,
  catalogState = FOODLE_RESTAURANT_CATALOG_STATE,
  pendingIntent = null,
  onPendingIntentHandled,
}: {
  station: MtrStation | null;
  budget: FoodMapBudget;
  notice: string | null;
  personalSnapshot?: FoodlePersonalSnapshot;
  catalogState?: FoodleCatalogState;
  pendingIntent?: FoodlePendingIntent | null;
  onPendingIntentHandled?: () => void;
}) {
  const usesLegacyStorage = personalSnapshot === undefined;
  const personalUnavailable = personalSnapshot?.kind === "unavailable";
  const catalogUnavailable =
    catalogState === "empty" || catalogState === "failed";
  const sourceLabel = discoverySourceLabel(station, budget);
  const [activeIndex, setActiveIndex] = useState(0);
  const [batchIds, setBatchIds] = useState<readonly string[]>([]);
  const [store, setStore] = useState(emptyCandidateDecisionStore);
  const [matchResult, setMatchResult] = useState<FoodleMatchResult | null>(
    null,
  );
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState(false);
  const [snapshot, setSnapshot] = useState<DiscoverySnapshot | null>(null);
  const [view, setView] = useState<"discover" | "saved">("discover");
  const [announcement, setAnnouncement] = useState("");
  const [personalError, setPersonalError] = useState<string | null>(null);
  const [accountNotice, setAccountNotice] = useState<string | null>(null);
  const [pendingChoice, setPendingChoice] = useState<{
    restaurant: FoodleRestaurant;
    decision: CandidateDecision;
  } | null>(null);
  const [legacyState, setLegacyState] = useState<FoodlePersonalState | null>(
    null,
  );
  const [migrationOpen, setMigrationOpen] = useState(false);
  const entryButtonRef = useRef<HTMLButtonElement>(null);
  const backButtonRef = useRef<HTMLButtonElement>(null);
  const resumeHandledRef = useRef(false);

  const eligibleBatch = useMemo(
    () =>
      buildFoodleDiscoveryBatch({
        budget,
        stationId: station?.id ?? null,
        decisions: emptyCandidateDecisionStore(),
      }),
    [budget, station],
  );
  const entryBatch = useMemo(
    () =>
      buildFoodleDiscoveryBatch({
        budget,
        stationId: station?.id ?? null,
        decisions: ready ? store : emptyCandidateDecisionStore(),
      }),
    [budget, ready, station, store],
  );
  const restaurants = useMemo(
    () =>
      batchIds
        .map((id) => FOODLE_RESTAURANTS.find((item) => item.id === id))
        .filter((item): item is FoodleRestaurant => Boolean(item)),
    [batchIds],
  );

  const openDiscovery = useCallback(
    (preferredRestaurantId?: string) => {
      if (catalogUnavailable) return;
      const batch = buildFoodleDiscoveryBatch({
        budget,
        stationId: station?.id ?? null,
        decisions: store,
      });
      const ids = batch.map((item) => item.id);
      if (
        preferredRestaurantId &&
        eligibleBatch.some((item) => item.id === preferredRestaurantId)
      ) {
        const remaining = ids.filter((id) => id !== preferredRestaurantId);
        ids.splice(0, ids.length, preferredRestaurantId, ...remaining);
      }
      setSnapshot({
        budget,
        station,
        sourceLabel,
        eligibleCount: eligibleBatch.length,
      });
      setBatchIds(ids);
      setActiveIndex(0);
      setView("discover");
      setOpen(true);
    },
    [budget, catalogUnavailable, eligibleBatch, sourceLabel, station, store],
  );

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      try {
        if (usesLegacyStorage) {
          setPersonalError(null);
          setStore(
            parseCandidateDecisionStore(
              window.localStorage.getItem(
                FOODLE_CANDIDATE_DECISIONS_STORAGE_KEY,
              ),
            ),
          );
        } else if (personalSnapshot.kind === "authenticated") {
          setPersonalError(null);
          setStore(personalSnapshot.state.decisions);
          setMatchResult(personalSnapshot.state.matchResult);

          const local = parseFoodlePersonalState({
            version: 1,
            decisions: parseCandidateDecisionStore(
              window.localStorage.getItem(
                FOODLE_CANDIDATE_DECISIONS_STORAGE_KEY,
              ),
            ),
            matchResult: parseFoodleMatchStore(
              window.localStorage.getItem(FOODLE_MATCH_STORAGE_KEY),
            ).result,
          });
          if (hasFoodlePersonalState(local)) {
            setLegacyState(local);
            setMigrationOpen(true);
          }
        } else if (personalSnapshot.kind === "unavailable") {
          setPersonalError(personalSnapshot.message);
          setStore(emptyCandidateDecisionStore());
          setMatchResult(null);
        } else {
          setPersonalError(null);
          setStore(emptyCandidateDecisionStore());
          setMatchResult(null);
        }
      } catch {
        if (usesLegacyStorage) setStore(emptyCandidateDecisionStore());
      } finally {
        setReady(true);
      }
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [personalSnapshot, usesLegacyStorage]);

  useEffect(() => {
    if (
      resumeHandledRef.current ||
      !ready ||
      !pendingIntent ||
      legacyState ||
      personalSnapshot?.kind !== "authenticated" ||
      pendingIntent.budget !== budget ||
      pendingIntent.stationId !== (station?.id ?? null)
    ) {
      return;
    }

    resumeHandledRef.current = true;
    openDiscovery(pendingIntent.restaurantId);
    const resumedRestaurant = FOODLE_RESTAURANTS.find(
      (item) => item.id === pendingIntent.restaurantId,
    );
    setAnnouncement(
      resumedRestaurant
        ? `已回到${resumedRestaurant.sourceFacts.name}，请再次选择`
        : "已恢复 Foodle 范围，请再次选择",
    );
    window.localStorage.removeItem(FOODLE_PENDING_INTENT_STORAGE_KEY);
    onPendingIntentHandled?.();
  }, [
    budget,
    legacyState,
    onPendingIntentHandled,
    openDiscovery,
    pendingIntent,
    personalSnapshot,
    ready,
    station,
  ]);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    const surface = document.querySelector<HTMLElement>(
      "[data-foodle-match-surface]",
    );
    const background = [...document.body.children]
      .filter((element) => element !== surface)
      .map((element) => {
        const htmlElement = element as HTMLElement;
        return {
          element: htmlElement,
          inert: htmlElement.inert,
          ariaHidden: htmlElement.getAttribute("aria-hidden"),
        };
      });

    document.body.style.overflow = "hidden";
    for (const item of background) {
      item.element.inert = true;
      item.element.setAttribute("aria-hidden", "true");
    }
    backButtonRef.current?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      for (const item of background) {
        item.element.inert = item.inert;
        if (item.ariaHidden === null) {
          item.element.removeAttribute("aria-hidden");
        } else {
          item.element.setAttribute("aria-hidden", item.ariaHidden);
        }
      }
    };
  }, [open]);

  const restaurant = restaurants[activeIndex] ?? null;
  const restaurantStation = restaurant
    ? stationById.get(restaurant.foodle.stationId)
    : null;
  const savedRestaurants = FOODLE_RESTAURANTS.filter(
    (item) => getCandidateDecision(store, item.id) === "saved",
  );
  const savedCount = savedRestaurants.length;

  function isInSnapshot(item: FoodleRestaurant) {
    if (!snapshot) return false;
    const itemStation = stationById.get(item.foodle.stationId);
    return Boolean(
      itemStation &&
      itemStation.minutes <= snapshot.budget &&
      (!snapshot.station || snapshot.station.id === itemStation.id),
    );
  }

  const inScopeSavedRestaurants = savedRestaurants.filter(isInSnapshot);
  const inScopeSavedCount = inScopeSavedRestaurants.length;
  const outsideScopeSavedCount = savedCount - inScopeSavedCount;

  function closeDiscovery() {
    setOpen(false);
    window.setTimeout(() => entryButtonRef.current?.focus(), 0);
  }

  function changeDecision(
    target: FoodleRestaurant,
    nextDecision: CandidateDecision,
    onFailure?: () => void,
  ) {
    setPersonalError(null);
    if (personalSnapshot?.kind === "anonymous") {
      setPendingChoice({ restaurant: target, decision: nextDecision });
      return false;
    }
    if (personalSnapshot?.kind === "unavailable") {
      setPersonalError(personalSnapshot.message);
      setAnnouncement(personalSnapshot.message);
      return false;
    }

    const previousStore = store;
    const nextStore = decideCandidate(store, target.id, nextDecision);
    setStore(nextStore);
    if (usesLegacyStorage) {
      try {
        window.localStorage.setItem(
          FOODLE_CANDIDATE_DECISIONS_STORAGE_KEY,
          serializeCandidateDecisionStore(nextStore),
        );
      } catch {
        // Keep the decision for this tab when browser storage is unavailable.
      }
    } else if (personalSnapshot?.kind === "authenticated") {
      setSaving(true);
      void saveFoodleCandidateDecisionAction(target.id, nextDecision)
        .then((state) => setStore(state?.decisions ?? nextStore))
        .catch(() => {
          setStore(previousStore);
          setPersonalError("选择未保存，请重试");
          setAnnouncement("选择未保存，请重试");
          onFailure?.();
        })
        .finally(() => setSaving(false));
    }
    setAnnouncement(
      `${target.sourceFacts.name}${
        nextDecision === "saved" ? "已加入想吃" : "已略过"
      }`,
    );
    return true;
  }

  function commitDecision(nextDecision: CandidateDecision) {
    if (!restaurant) return;
    const changed = changeDecision(restaurant, nextDecision, () =>
      setActiveIndex((index) => Math.max(0, index - 1)),
    );
    if (changed) setActiveIndex((index) => index + 1);
  }

  function clearLegacyStorage() {
    window.localStorage.removeItem(FOODLE_CANDIDATE_DECISIONS_STORAGE_KEY);
    window.localStorage.removeItem(FOODLE_MATCH_STORAGE_KEY);
  }

  function keepLegacyStorage() {
    setMigrationOpen(false);
    setLegacyState(null);
    setAccountNotice("本机记录已保留");
    setAnnouncement("当前继续使用账号记录，本机记录仍保留");
  }

  function discardLegacyStorage() {
    clearLegacyStorage();
    setMigrationOpen(false);
    setLegacyState(null);
    setAccountNotice("本机记录已清除");
    setAnnouncement("本机 Foodle 记录已清除");
  }

  async function migrateLegacyStorage() {
    if (!legacyState) return;
    setSaving(true);
    setPersonalError(null);
    try {
      const state = await migrateFoodleLocalStateAction(legacyState);
      setStore(state.decisions);
      setMatchResult(state.matchResult);
      clearLegacyStorage();
      setMigrationOpen(false);
      setLegacyState(null);
      setAccountNotice("本机记录已迁移");
      setAnnouncement("本机 Foodle 记录已迁移到账号");
    } catch {
      setPersonalError("本机记录迁移失败，请重试");
    } finally {
      setSaving(false);
    }
  }

  function prepareLogin(event: React.MouseEvent<HTMLAnchorElement>) {
    if (!pendingChoice) return;
    try {
      window.localStorage.setItem(
        FOODLE_PENDING_INTENT_STORAGE_KEY,
        serializeFoodlePendingIntent({
          version: 1,
          restaurantId: pendingChoice.restaurant.id,
          decision: pendingChoice.decision,
          budget: snapshot?.budget ?? budget,
          stationId: snapshot?.station?.id ?? station?.id ?? null,
          createdAt: new Date().toISOString(),
        }),
      );
    } catch {
      event.preventDefault();
      setPersonalError("无法保存当前位置，请检查浏览器存储权限");
    }
  }

  async function persistMatchResult(result: FoodleMatchResult) {
    if (personalSnapshot?.kind !== "authenticated") return;
    const previousResult = matchResult;
    setMatchResult(result);
    setPersonalError(null);
    try {
      const state = await saveFoodleMatchResultAction(result);
      setMatchResult(state.matchResult);
    } catch {
      setMatchResult(previousResult);
      setPersonalError("Match 结果未保存，请重试");
      setAnnouncement("Match 结果未保存，请重试");
    }
  }

  const catalogMessage = catalogUnavailable
    ? catalogStatusLabel(catalogState)
    : !ready
      ? "正在载入餐厅"
      : catalogStatusLabel(catalogState);
  const accountDialogs = (
    <>
      <Dialog
        open={pendingChoice !== null}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) setPendingChoice(null);
        }}
      >
        <DialogContent showCloseButton={false} className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>登录后继续</DialogTitle>
            <DialogDescription>
              这次{pendingChoice?.decision === "saved" ? "想吃" : "略过"}
              尚未提交。登录后会回到同一家餐厅，由你再次确认。
            </DialogDescription>
          </DialogHeader>
          {personalError ? (
            <p role="alert" className="text-sm text-destructive">
              {personalError}
            </p>
          ) : null}
          <DialogFooter>
            <DialogClose
              render={
                <button
                  type="button"
                  className="min-h-11 rounded-lg border bg-background px-4 text-sm font-medium hover:bg-muted focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                />
              }
            >
              继续浏览
            </DialogClose>
            <a
              href="/login?next=%2Ffood-map"
              onClick={prepareLogin}
              className="inline-flex min-h-11 items-center justify-center rounded-lg bg-[#672d7e] px-4 text-sm font-semibold text-white hover:bg-[#552268] focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-[#672d7e]/45 dark:bg-[#c48fda] dark:text-[#211225]"
            >
              登录并继续
            </a>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={migrationOpen}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) keepLegacyStorage();
        }}
      >
        <DialogContent
          showCloseButton={false}
          aria-busy={saving}
          className="sm:max-w-md"
        >
          <DialogHeader>
            <DialogTitle>处理本机 Foodle 记录</DialogTitle>
            <DialogDescription>
              账号与这台设备都有独立记录。请选择迁移、清除或暂时保留；系统不会自动合并。
            </DialogDescription>
          </DialogHeader>
          {personalError ? (
            <p role="alert" className="text-sm text-destructive">
              {personalError}
            </p>
          ) : null}
          <DialogFooter className="sm:flex-col">
            <button
              type="button"
              disabled={saving}
              onClick={() => void migrateLegacyStorage()}
              className="min-h-11 rounded-lg bg-[#672d7e] px-4 text-sm font-semibold text-white hover:bg-[#552268] focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-[#672d7e]/45 disabled:opacity-55 dark:bg-[#c48fda] dark:text-[#211225]"
            >
              {saving ? "正在迁移" : "迁移到账号"}
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={discardLegacyStorage}
              className="min-h-11 rounded-lg border bg-background px-4 text-sm font-medium hover:bg-muted focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-55"
            >
              清除本机
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={keepLegacyStorage}
              className="min-h-11 rounded-lg px-4 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-55"
            >
              暂不处理
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );

  if (open && snapshot) {
    return createPortal(
      <>
        <div
          data-testid="foodle-match-surface"
          data-foodle-match-surface
          role="dialog"
          aria-modal="true"
          aria-label="餐厅发现"
          onKeyDown={(event) =>
            handleMatchSurfaceKeyDown(event, closeDiscovery)
          }
          className="fixed inset-0 z-40 overflow-y-auto overscroll-contain bg-muted/25"
        >
          <section
            className="mx-auto min-h-dvh w-full max-w-[31rem] bg-background p-3 pb-28 sm:my-4 sm:min-h-[calc(100dvh-2rem)] sm:rounded-2xl sm:border sm:p-4 sm:pb-28"
            aria-label="Foodle Match 餐厅发现"
          >
            <header className="sticky top-0 z-30 -mx-3 -mt-3 flex items-start gap-3 border-b bg-background/95 px-3 pt-[calc(0.75rem+env(safe-area-inset-top))] pb-3 backdrop-blur-sm sm:-mx-4 sm:-mt-4 sm:px-4">
              <button
                ref={backButtonRef}
                type="button"
                aria-label="返回通勤地图"
                onClick={closeDiscovery}
                className="grid size-11 shrink-0 place-items-center rounded-full border hover:bg-muted focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <ArrowLeft className="size-4" aria-hidden="true" />
              </button>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium tracking-[0.16em] text-[#672d7e] uppercase dark:text-[#c48fda]">
                  Foodle Match
                </p>
                <h2 className="mt-1 text-xl font-semibold tracking-tight">
                  {view === "saved" ? "想吃候选" : snapshot.sourceLabel}
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {view === "saved"
                    ? `此范围 ${inScopeSavedCount} 家 · 共 ${savedCount} 家`
                    : `本轮 ${restaurants.length} 家${
                        snapshot.station
                          ? ` · 港铁 ${snapshot.station.minutes} 分钟`
                          : ""
                      }`}
                </p>
              </div>
              {view === "discover" ? (
                <button
                  type="button"
                  disabled={personalUnavailable}
                  aria-label={
                    personalUnavailable
                      ? "想吃记录无法读取"
                      : `查看想吃候选，${savedCount} 家`
                  }
                  onClick={() => setView("saved")}
                  className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold hover:bg-muted focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-55"
                >
                  <Heart className="size-4" aria-hidden="true" />
                  {personalUnavailable ? "—" : savedCount}
                </button>
              ) : null}
            </header>

            <div className="mt-3">
              {personalError ? (
                <p
                  role="alert"
                  className="mb-3 rounded-xl border border-destructive/25 bg-destructive/5 px-3 py-2 text-sm text-destructive"
                >
                  {personalError}
                </p>
              ) : null}
              {view === "saved" ? (
                <div>
                  <button
                    type="button"
                    onClick={() => setView("discover")}
                    className="mb-3 inline-flex min-h-11 items-center gap-2 rounded-lg px-2 text-sm font-medium hover:bg-muted focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                  >
                    <ArrowLeft className="size-4" aria-hidden="true" />
                    继续发现
                  </button>
                  <FoodleMatch
                    candidates={inScopeSavedRestaurants}
                    sourceLabel={snapshot.sourceLabel}
                    ready={ready && !saving}
                    initialResult={usesLegacyStorage ? undefined : matchResult}
                    onResult={
                      personalSnapshot?.kind === "authenticated"
                        ? persistMatchResult
                        : undefined
                    }
                  />
                  {savedCount > 0 && inScopeSavedCount === 0 ? (
                    <div className="mb-3 grid min-h-36 place-items-center rounded-2xl border border-dashed bg-muted/20 p-5 text-center">
                      <div>
                        <Heart
                          className="mx-auto size-6 text-[#672d7e] dark:text-[#c48fda]"
                          aria-hidden="true"
                        />
                        <p className="mt-3 font-semibold">此范围没有想吃候选</p>
                      </div>
                    </div>
                  ) : null}
                  {outsideScopeSavedCount > 0 ? (
                    <p className="mb-3 rounded-xl bg-muted/55 px-3 py-2 text-xs text-muted-foreground">
                      范围外 {outsideScopeSavedCount} 家仍保留在想吃候选。
                    </p>
                  ) : null}
                  {savedRestaurants.length === 0 ? (
                    <div className="grid min-h-56 place-items-center rounded-2xl border border-dashed bg-muted/20 p-6 text-center">
                      <div>
                        <Heart
                          className="mx-auto size-6 text-[#672d7e] dark:text-[#c48fda]"
                          aria-hidden="true"
                        />
                        <p className="mt-3 font-semibold">还没有想吃候选</p>
                      </div>
                    </div>
                  ) : (
                    <ul
                      className="divide-y overflow-hidden rounded-2xl border"
                      aria-label="想吃候选"
                    >
                      {savedRestaurants.map((item) => {
                        const itemStation = stationById.get(
                          item.foodle.stationId,
                        );
                        return (
                          <li
                            key={item.id}
                            className="flex min-w-0 items-center justify-between gap-3 p-3"
                          >
                            <div className="min-w-0">
                              <p className="truncate font-semibold">
                                {item.sourceFacts.name}
                              </p>
                              <p className="mt-1 text-xs text-muted-foreground">
                                {itemStation?.nameZh ?? "车站资料暂缺"} · 港铁{" "}
                                {itemStation?.minutes ?? "资料暂缺"} 分钟 · 步行{" "}
                                {item.foodle.walkMinutes ?? "资料暂缺"}
                              </p>
                              <p className="mt-1 text-xs text-muted-foreground">
                                Foodle 均分{" "}
                                {available(item.foodle.averageScore)}
                                {!isInSnapshot(item) ? " · 当前范围外" : ""}
                              </p>
                            </div>
                            <button
                              type="button"
                              disabled={saving}
                              aria-label={`取消想吃：${item.sourceFacts.name}`}
                              onClick={() => changeDecision(item, "passed")}
                              className="grid size-11 shrink-0 place-items-center rounded-full border hover:bg-muted focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                            >
                              <X className="size-4" aria-hidden="true" />
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              ) : restaurant && restaurantStation ? (
                <>
                  <p className="mb-2 text-center text-xs tabular-nums text-muted-foreground">
                    {activeIndex + 1} / {restaurants.length}
                  </p>
                  <RestaurantCard
                    restaurant={restaurant}
                    station={restaurantStation}
                    decision={getCandidateDecision(store, restaurant.id)}
                    ready={ready && !saving && !personalUnavailable}
                    onDecision={commitDecision}
                  />
                </>
              ) : (
                <div className="grid min-h-64 place-items-center rounded-2xl border border-dashed bg-muted/20 p-6 text-center">
                  <div>
                    <Sparkles
                      className="mx-auto size-6 text-[#672d7e] dark:text-[#c48fda]"
                      aria-hidden="true"
                    />
                    <h3 className="mt-3 text-lg font-semibold">
                      {snapshot.eligibleCount === 0
                        ? "这个范围暂时没有餐厅"
                        : restaurants.length === 0
                          ? "这个范围没有未看候选"
                          : `本轮 ${restaurants.length} 家看完了`}
                    </h3>
                    <p className="mt-2 text-sm text-muted-foreground">
                      {savedCount > 0
                        ? `已有 ${savedCount} 家想吃候选。`
                        : "换一个通勤范围或车站再看看。"}
                    </p>
                    <button
                      type="button"
                      aria-label={`查看想吃候选，${savedCount} 家`}
                      onClick={() => setView("saved")}
                      className="mt-4 min-h-11 rounded-xl border bg-background px-4 text-sm font-semibold hover:bg-muted focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                    >
                      查看想吃候选 · {savedCount}
                    </button>
                  </div>
                </div>
              )}
            </div>

            <p className="sr-only" aria-live="polite">
              {announcement}
            </p>
          </section>
        </div>
        {accountDialogs}
      </>,
      document.body,
    );
  }

  return (
    <div className="min-w-0" aria-label="Foodle Match 入口">
      <button
        ref={entryButtonRef}
        type="button"
        disabled={!ready || catalogUnavailable}
        onClick={() => openDiscovery()}
        aria-label={
          catalogUnavailable
            ? `Foodle Match 暂不可用，${catalogStatusLabel(catalogState)}`
            : ready
              ? `打开 Foodle Match，${sourceLabel}，${entryBatch.length} 家餐厅`
              : "打开 Foodle Match，候选载入中"
        }
        className="group flex min-h-28 w-full items-center gap-4 rounded-2xl border bg-background p-4 text-left hover:border-[#672d7e]/45 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-[#672d7e]/35 disabled:cursor-wait disabled:opacity-65"
      >
        <span className="grid size-12 shrink-0 place-items-center rounded-full bg-[#672d7e] text-white dark:bg-[#c48fda] dark:text-[#211225]">
          <Sparkles className="size-5" aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-xs font-medium tracking-[0.16em] text-[#672d7e] uppercase dark:text-[#c48fda]">
            Foodle Match
          </span>
          <span className="mt-1 block text-xl font-semibold">开始找餐厅</span>
          <span className="mt-1 block text-sm text-muted-foreground">
            {sourceLabel} ·{" "}
            {ready && !catalogUnavailable ? entryBatch.length : "—"} 家未看
          </span>
        </span>
        <span className="shrink-0 rounded-full border px-2.5 py-1 text-xs tabular-nums text-muted-foreground">
          想吃 {personalUnavailable ? "—" : savedCount}
        </span>
      </button>

      {notice ? (
        <p className="mt-3 rounded-xl border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
          {notice}
        </p>
      ) : null}
      {catalogMessage ? (
        <p
          role={catalogState === "failed" ? "alert" : "status"}
          className={
            catalogState === "failed"
              ? "mt-3 rounded-xl border border-destructive/25 bg-destructive/5 px-3 py-2 text-sm text-destructive"
              : "mt-3 rounded-xl border bg-muted/30 px-3 py-2 text-sm text-muted-foreground"
          }
        >
          {catalogMessage}
        </p>
      ) : null}
      {personalError ? (
        <p
          role="alert"
          className="mt-3 rounded-xl border border-destructive/25 bg-destructive/5 px-3 py-2 text-sm text-destructive"
        >
          {personalError}
        </p>
      ) : null}
      {accountNotice ? (
        <p
          role="status"
          className="mt-3 rounded-xl border bg-muted/30 px-3 py-2 text-sm text-muted-foreground"
        >
          {accountNotice}
        </p>
      ) : null}
      <p className="sr-only" aria-live="polite">
        {ready ? announcement : "正在读取餐厅选择记录"}
      </p>
      {accountDialogs}
    </div>
  );
}
