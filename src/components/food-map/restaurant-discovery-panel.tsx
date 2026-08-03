"use client";

import { ChevronLeft, ChevronRight, Heart, Info, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
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
import type { FoodMapBudget, MtrStation } from "@/lib/food-map/data";
import {
  getFoodleRestaurantsForStation,
  type FoodleRestaurant,
} from "@/lib/food-map/restaurant-catalog";

const DECISION_LABELS: Record<CandidateDecisionState, string> = {
  unseen: "未选择",
  saved: "已想吃",
  passed: "已略过",
};

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
        <RestaurantFacts restaurant={restaurant} station={station} expanded />
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
          "touch-pan-y select-none overflow-hidden rounded-2xl border bg-background shadow-[0_12px_30px_rgba(27,20,30,0.08)] dark:shadow-none",
          dragX === 0 ? "transition-transform" : "",
          "motion-reduce:transition-none",
        ].join(" ")}
        style={{
          transform: `translateX(${dragX}px) rotate(${dragX / 32}deg)`,
        }}
      >
        <div className="h-1.5 bg-[#672d7e] dark:bg-[#c48fda]" />
        <div className="p-4 sm:p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-medium tracking-[0.16em] text-[#672d7e] uppercase dark:text-[#c48fda]">
                {station.nameZh} · Restaurant
              </p>
              <h3 className="mt-2 break-words text-2xl leading-tight font-semibold tracking-tight text-balance">
                {restaurant.sourceFacts.name}
              </h3>
            </div>
            <button
              type="button"
              onClick={() => setDetailsOpen(true)}
              className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-lg border px-3 text-sm font-medium hover:bg-muted focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <Info className="size-4" aria-hidden="true" />
              详情
            </button>
          </div>

          <div className="mt-5">
            <RestaurantFacts restaurant={restaurant} station={station} />
          </div>

          <div className="mt-5 flex items-center justify-between border-t pt-4 text-xs text-muted-foreground">
            <span>向左滑略过</span>
            <span
              className="rounded-full bg-muted px-2.5 py-1 font-medium text-foreground"
              aria-label={`当前状态：${DECISION_LABELS[decision]}`}
            >
              {DECISION_LABELS[decision]}
            </span>
            <span>向右滑想吃</span>
          </div>
        </div>
      </article>

      <div className="mt-3 grid grid-cols-2 gap-3">
        <button
          type="button"
          disabled={!ready}
          onClick={() => onDecision("passed")}
          className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border bg-background px-4 text-sm font-semibold hover:bg-muted focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-wait disabled:opacity-55"
        >
          <X className="size-4" aria-hidden="true" />
          略过
        </button>
        <button
          type="button"
          disabled={!ready}
          onClick={() => onDecision("saved")}
          className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[#672d7e] px-4 text-sm font-semibold text-white hover:bg-[#552268] focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-[#672d7e]/45 disabled:cursor-wait disabled:opacity-55 dark:bg-[#c48fda] dark:text-[#211225] dark:hover:bg-[#d3a8e5]"
        >
          <Heart className="size-4" aria-hidden="true" />
          想吃
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

function EmptyDiscovery({
  station,
  notice,
}: {
  station: MtrStation | null;
  notice: string | null;
}) {
  const title = notice
    ? "当前范围已更新"
    : station?.id === "UNI"
      ? "校内餐厅在食堂页"
      : station
        ? `${station.nameZh}暂未收录餐厅`
        : "从地铁图选择一站";
  const description = notice
    ? notice
    : station?.id === "UNI"
      ? "这里不重复收录大学站校内餐厅，请从其他车站开始发现。"
      : station
        ? "这个站点会保留在通勤范围内，等餐厅资料准备好后即可浏览。"
        : "沙田和大埔墟已有多家示例餐厅。点击站点后，可逐张选择想吃或略过。";

  return (
    <div className="grid min-h-[24rem] place-items-center rounded-2xl border border-dashed bg-muted/20 p-8 text-center">
      <div className="max-w-sm">
        <span className="mx-auto grid size-12 place-items-center rounded-xl bg-[#eee6f1] text-sm font-semibold text-[#672d7e] dark:bg-[#34253a] dark:text-[#c48fda]">
          CU
        </span>
        <h2 className="mt-5 text-xl font-semibold tracking-tight text-balance">
          {title}
        </h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          {description}
        </p>
      </div>
    </div>
  );
}

export function RestaurantDiscoveryPanel({
  station,
  budget,
  notice,
}: {
  station: MtrStation | null;
  budget: FoodMapBudget;
  notice: string | null;
}) {
  const restaurants = useMemo(
    () => (station ? getFoodleRestaurantsForStation(station.id) : []),
    [station],
  );
  const [activeIndex, setActiveIndex] = useState(0);
  const [store, setStore] = useState(emptyCandidateDecisionStore);
  const [ready, setReady] = useState(false);
  const [announcement, setAnnouncement] = useState("");

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setStore(
        parseCandidateDecisionStore(
          window.localStorage.getItem(FOODLE_CANDIDATE_DECISIONS_STORAGE_KEY),
        ),
      );
      setReady(true);
    }, 0);
    return () => window.clearTimeout(timeout);
  }, []);

  if (!station || restaurants.length === 0) {
    return <EmptyDiscovery station={station} notice={notice} />;
  }

  const safeIndex = activeIndex % restaurants.length;
  const restaurant = restaurants[safeIndex];
  const decision = getCandidateDecision(store, restaurant.id);
  const stationStates = restaurants.map((item) =>
    getCandidateDecision(store, item.id),
  );
  const savedCount = stationStates.filter((state) => state === "saved").length;
  const passedCount = stationStates.filter(
    (state) => state === "passed",
  ).length;
  const unseenCount = restaurants.length - savedCount - passedCount;

  function showRestaurant(nextIndex: number) {
    setActiveIndex((nextIndex + restaurants.length) % restaurants.length);
  }

  function commitDecision(nextDecision: CandidateDecision) {
    const nextStore = decideCandidate(store, restaurant.id, nextDecision);
    setStore(nextStore);
    try {
      window.localStorage.setItem(
        FOODLE_CANDIDATE_DECISIONS_STORAGE_KEY,
        serializeCandidateDecisionStore(nextStore),
      );
    } catch {
      // Keep the decision for this tab when browser storage is unavailable.
    }
    setAnnouncement(
      `${restaurant.sourceFacts.name}${
        nextDecision === "saved" ? "已加入想吃" : "已略过"
      }`,
    );
    showRestaurant(safeIndex + 1);
  }

  return (
    <div className="min-w-0" aria-label={`${station.nameZh}餐厅发现`}>
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-medium tracking-[0.16em] text-[#672d7e] uppercase dark:text-[#c48fda]">
            Foodle · Station picks
          </p>
          <h2 className="mt-1 text-xl font-semibold tracking-tight text-balance">
            {station.nameZh}站附近
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {budget} 分钟范围 · 港铁 {station.minutes} 分钟 ·{" "}
            {restaurants.length} 家餐厅
          </p>
        </div>
        <div className="flex items-center gap-1" aria-label="切换餐厅">
          <button
            type="button"
            aria-label="上一家餐厅"
            onClick={() => showRestaurant(safeIndex - 1)}
            className="grid min-h-11 min-w-11 place-items-center rounded-lg border hover:bg-muted focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <ChevronLeft className="size-4" aria-hidden="true" />
          </button>
          <span className="min-w-14 text-center text-xs tabular-nums text-muted-foreground">
            {safeIndex + 1} / {restaurants.length}
          </span>
          <button
            type="button"
            aria-label="下一家餐厅"
            onClick={() => showRestaurant(safeIndex + 1)}
            className="grid min-h-11 min-w-11 place-items-center rounded-lg border hover:bg-muted focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <ChevronRight className="size-4" aria-hidden="true" />
          </button>
        </div>
      </div>

      <div className="mb-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
        <span className="rounded-full border px-2.5 py-1">
          想吃 {savedCount}
        </span>
        <span className="rounded-full border px-2.5 py-1">
          略过 {passedCount}
        </span>
        <span className="rounded-full border px-2.5 py-1">
          未看 {unseenCount}
        </span>
      </div>

      <RestaurantCard
        restaurant={restaurant}
        station={station}
        decision={decision}
        ready={ready}
        onDecision={commitDecision}
      />

      <p className="sr-only" aria-live="polite">
        {ready ? announcement : "正在读取餐厅选择记录"}
      </p>
    </div>
  );
}
