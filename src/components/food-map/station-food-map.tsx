"use client";

import { Drawer } from "@base-ui/react/drawer";
import {
  ArrowLeftIcon,
  BanknoteIcon,
  CheckIcon,
  Clock3Icon,
  FlameIcon,
  FootprintsIcon,
  HeartIcon,
  ListIcon,
  MapIcon,
  MapPinIcon,
  MessageCircleIcon,
  NavigationIcon,
  SearchIcon,
  SlidersHorizontalIcon,
  StarIcon,
  XIcon,
} from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useMediaQuery } from "@/hooks/use-media-query";
import {
  FOODLE_CANDIDATE_DECISIONS_STORAGE_KEY,
  clearCandidateDecision,
  decideCandidate,
  emptyCandidateDecisionStore,
  getCandidateDecision,
  parseCandidateDecisionStore,
  serializeCandidateDecisionStore,
} from "@/lib/food-map/candidate-decisions";
import {
  FOOD_MAP_CHECKINS_STORAGE_KEY,
  countFoodMapVisits,
  emptyFoodMapCheckinStore,
  getFoodMapVisitDates,
  hktDateKey,
  parseFoodMapCheckinStore,
  recordFoodMapCheckin,
  serializeFoodMapCheckinStore,
} from "@/lib/food-map/checkins";
import {
  FOOD_MAP_COMMENTS_STORAGE_KEY,
  addFoodMapComment,
  emptyFoodMapCommentStore,
  parseFoodMapCommentStore,
  serializeFoodMapCommentStore,
} from "@/lib/food-map/comments";
import {
  FOODLE_STATION_MAPS,
  getFoodleRestaurantsForStation,
  getRestaurantHeat,
  getRestaurantOpeningStatus,
  type FoodleRestaurant,
  type FoodleStationId,
  type RestaurantOpeningStatus,
} from "@/lib/food-map/station-restaurant-catalog";

const StationMapCanvas = dynamic(
  () =>
    import("@/components/food-map/station-map-canvas").then(
      (module) => module.StationMapCanvas,
    ),
  {
    ssr: false,
    loading: () => (
      <div className="absolute inset-0 grid place-items-center bg-[#eef1eb] text-sm text-slate-600 dark:bg-[#1d211e] dark:text-slate-300">
        正在载入地图…
      </div>
    ),
  },
);

type PriceFilter = "all" | "under-50" | "51-100" | "over-100";
type PersonalFilter = "all" | "saved" | "visited";
type MobileView = "map" | "list";
type ComposerMode = "checkin" | "comment";
type SelectionOrigin = "map" | "list";

const PRICE_LABELS: Record<PriceFilter, string> = {
  all: "全部价格",
  "under-50": "HK$50 以下",
  "51-100": "HK$51 至 100",
  "over-100": "HK$100 以上",
};
const PERSONAL_FILTERS: readonly {
  value: PersonalFilter;
  label: string;
}[] = [
  { value: "all", label: "全部" },
  { value: "saved", label: "想吃" },
  { value: "visited", label: "去过" },
];

const HKD_FORMATTER = new Intl.NumberFormat("en-HK", {
  style: "currency",
  currency: "HKD",
  maximumFractionDigits: 0,
});
const HKT_DATE_FORMATTER = new Intl.DateTimeFormat("zh-HK", {
  dateStyle: "medium",
  timeZone: "Asia/Hong_Kong",
});

function formatHkd(value: number) {
  return HKD_FORMATTER.format(value);
}

function formatHktDate(value: string) {
  const date = /^\d{4}-\d{2}-\d{2}$/u.test(value)
    ? new Date(`${value}T12:00:00+08:00`)
    : new Date(value);
  return Number.isNaN(date.valueOf()) ? value : HKT_DATE_FORMATTER.format(date);
}

function priceMatches(restaurant: FoodleRestaurant, filter: PriceFilter) {
  const price = restaurant.sourceFacts.averagePriceHkd;
  if (filter === "all") return true;
  if (price === null) return false;
  if (filter === "under-50") return price <= 50;
  if (filter === "51-100") return price >= 51 && price <= 100;
  return price > 100;
}

function HeatLegend() {
  return (
    <div
      className="flex items-center gap-3 text-[11px] text-muted-foreground"
      aria-label="打卡热度图例"
    >
      <span className="inline-flex items-center gap-1.5">
        <span
          className="size-2.5 rounded-full bg-[#26734a]"
          aria-hidden="true"
        />
        较少
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span
          className="size-2.5 rounded-full bg-[#96500a]"
          aria-hidden="true"
        />
        较多
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span
          className="size-2.5 rounded-full bg-[#c83f3f]"
          aria-hidden="true"
        />
        热门
      </span>
      <span className="inline-flex items-center gap-1">
        <FlameIcon className="size-3.5 text-[#c83f3f]" aria-hidden="true" />
        很火
      </span>
    </div>
  );
}

function OpeningBadge({ status }: { status: RestaurantOpeningStatus }) {
  const colors =
    status.state === "open"
      ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
      : status.state === "closed"
        ? "bg-muted text-muted-foreground"
        : "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300";

  return (
    <span
      className={`rounded-full px-2 py-1 text-[11px] font-medium ${colors}`}
    >
      {status.label}
    </span>
  );
}

function RestaurantListItem({
  restaurant,
  status,
  checkinCount,
  personalVisits,
  wanted,
  selected,
  highlighted,
  onSelect,
  onHighlight,
}: {
  restaurant: FoodleRestaurant;
  status: RestaurantOpeningStatus;
  checkinCount: number;
  personalVisits: number;
  wanted: boolean;
  selected: boolean;
  highlighted: boolean;
  onSelect: () => void;
  onHighlight: (highlighted: boolean) => void;
}) {
  const heat = getRestaurantHeat(checkinCount);
  const heatColor =
    heat === "quiet"
      ? "bg-[#26734a]"
      : heat === "known"
        ? "bg-[#96500a]"
        : "bg-[#c83f3f]";

  return (
    <button
      type="button"
      aria-pressed={selected}
      data-foodle-list={restaurant.id}
      data-highlighted={highlighted}
      onClick={onSelect}
      onPointerEnter={() => onHighlight(true)}
      onPointerLeave={() => onHighlight(false)}
      onFocus={() => onHighlight(true)}
      onBlur={() => onHighlight(false)}
      className={[
        "w-full touch-manipulation rounded-xl border p-3 text-left outline-none transition-colors",
        "hover:bg-muted/50 focus-visible:ring-3 focus-visible:ring-[#672d7e]/35",
        selected || highlighted
          ? "border-[#672d7e] bg-[#672d7e]/5 dark:border-[#c48fda] dark:bg-[#c48fda]/10"
          : "border-border bg-background",
      ].join(" ")}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span
              className={`size-2.5 shrink-0 rounded-full ${heatColor}`}
              aria-hidden="true"
            />
            <h3 className="truncate font-semibold">
              {restaurant.sourceFacts.name}
            </h3>
            {heat === "hot" ? <span aria-label="热门">🔥</span> : null}
          </div>
          <p className="mt-1 truncate text-xs text-muted-foreground">
            {restaurant.sourceFacts.cuisines?.join(" · ") ?? "菜系待补"}
            {restaurant.sourceFacts.averagePriceHkd
              ? ` · 人均约 ${formatHkd(restaurant.sourceFacts.averagePriceHkd)}`
              : " · 价格待补"}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <span className="text-xs font-medium tabular-nums">
            {checkinCount} 次
          </span>
          {personalVisits > 0 ? (
            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-[#672d7e] dark:text-[#d9afe8]">
              <CheckIcon className="size-3" aria-hidden="true" />
              去过 {personalVisits} 次
            </span>
          ) : wanted ? (
            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-[#672d7e] dark:text-[#d9afe8]">
              <HeartIcon className="size-3 fill-current" aria-hidden="true" />
              想吃
            </span>
          ) : null}
        </div>
      </div>
      <div className="mt-3 flex items-center justify-between gap-3">
        <OpeningBadge status={status} />
        <span className="inline-flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
          <FootprintsIcon className="size-3.5" aria-hidden="true" />
          {restaurant.foodle.walkMinutes
            ? `${restaurant.foodle.walkMinutes} 分钟`
            : "待补"}
        </span>
      </div>
    </button>
  );
}

function Fact({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <div className="flex min-w-0 items-start gap-2 text-sm">
      <span className="mt-0.5 shrink-0 text-muted-foreground">{icon}</span>
      <span className="min-w-0 break-words leading-5">{children}</span>
    </div>
  );
}

function EmptyResults({
  title = "没有符合条件的餐厅",
  actionLabel = "清除筛选",
  onClear,
}: {
  title?: string;
  actionLabel?: string;
  onClear: () => void;
}) {
  return (
    <div className="rounded-xl border border-dashed px-4 py-8 text-center">
      <p className="text-sm font-medium">{title}</p>
      <button
        type="button"
        onClick={onClear}
        className="mt-3 min-h-11 touch-manipulation rounded-lg border px-3 text-sm font-medium outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        {actionLabel}
      </button>
    </div>
  );
}

function RestaurantDetails({
  restaurant,
  status,
  totalCheckins,
  personalVisits,
  visitDates,
  checkedToday,
  checkinsReady,
  wanted,
  personalStateError,
  localComments,
  onCheckIn,
  onToggleWishlist,
  onComment,
  headingRef,
}: {
  restaurant: FoodleRestaurant;
  status: RestaurantOpeningStatus;
  totalCheckins: number;
  personalVisits: number;
  visitDates: readonly string[];
  checkedToday: boolean;
  checkinsReady: boolean;
  wanted: boolean;
  personalStateError: string | null;
  localComments: readonly { id: string; body: string; createdAt: string }[];
  onCheckIn: () => void;
  onToggleWishlist: () => void;
  onComment: () => void;
  headingRef?: RefObject<HTMLHeadingElement | null>;
}) {
  const firstPeriod = restaurant.sourceFacts.openingPeriods?.[0];
  const directions = `https://www.google.com/maps/dir/?api=1&destination=${restaurant.location.latitude},${restaurant.location.longitude}`;
  const comments = [
    ...localComments.map((comment) => ({
      id: comment.id,
      body: comment.body,
      date: formatHktDate(comment.createdAt),
      mine: true,
    })),
    ...restaurant.foodle.comments.map((comment) => ({
      id: comment.id,
      body: comment.body,
      date: formatHktDate(comment.visitedOn),
      mine: false,
    })),
  ];

  return (
    <div className="space-y-5">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <OpeningBadge status={status} />
          <span className="text-xs text-muted-foreground">
            累计 {totalCheckins} 次打卡
          </span>
        </div>
        <h2
          ref={headingRef}
          tabIndex={-1}
          className="mt-3 text-pretty text-xl font-semibold tracking-tight outline-none"
        >
          {restaurant.sourceFacts.name}
        </h2>
        <p className="mt-1.5 break-words text-sm leading-6 text-muted-foreground">
          {restaurant.foodle.summary}
        </p>
      </div>

      <div className="grid gap-3 border-y py-4">
        <Fact icon={<MapPinIcon className="size-4" aria-hidden="true" />}>
          {restaurant.location.address}，{restaurant.location.nearestExit}，
          {restaurant.location.distanceMeters} 米
        </Fact>
        <Fact icon={<FootprintsIcon className="size-4" aria-hidden="true" />}>
          {restaurant.foodle.walkMinutes
            ? `由地铁站步行约 ${restaurant.foodle.walkMinutes} 分钟`
            : "步行时间待补"}
        </Fact>
        <Fact icon={<StarIcon className="size-4" aria-hidden="true" />}>
          {restaurant.foodle.averageScore
            ? `${restaurant.foodle.averageScore.toFixed(1)} 分 · ${restaurant.sourceFacts.cuisines?.join("、") ?? "菜系待补"}`
            : (restaurant.sourceFacts.cuisines?.join("、") ?? "评分和菜系待补")}
        </Fact>
        <Fact icon={<BanknoteIcon className="size-4" aria-hidden="true" />}>
          {restaurant.sourceFacts.averagePriceHkd
            ? `人均约 ${formatHkd(restaurant.sourceFacts.averagePriceHkd)} · ${restaurant.sourceFacts.priceRange}`
            : "价格待补"}
        </Fact>
        <Fact icon={<Clock3Icon className="size-4" aria-hidden="true" />}>
          {firstPeriod
            ? `营业时间 ${firstPeriod.opens} 至 ${firstPeriod.closes}`
            : "营业时间待补全"}
        </Fact>
      </div>

      <div
        className={`grid gap-2 ${personalVisits > 0 ? "grid-cols-[2.75rem_minmax(0,1fr)]" : "grid-cols-[2.75rem_minmax(0,1fr)_minmax(0,1fr)]"}`}
      >
        <a
          href={directions}
          target="_blank"
          rel="noreferrer"
          aria-label={`在 Google Maps 打开${restaurant.sourceFacts.name}`}
          title="在 Google Maps 打开"
          className="grid min-h-11 touch-manipulation place-items-center rounded-lg border bg-background text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <NavigationIcon className="size-4" aria-hidden="true" />
        </a>
        <button
          type="button"
          disabled={!checkinsReady || checkedToday}
          onClick={onCheckIn}
          className="min-h-11 touch-manipulation rounded-lg bg-[#672d7e] px-3 text-sm font-medium text-white outline-none transition-colors hover:bg-[#542267] focus-visible:ring-3 focus-visible:ring-[#672d7e]/40 disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground dark:bg-[#c48fda] dark:text-[#211225] dark:hover:bg-[#d4a8e4]"
        >
          {checkedToday ? (
            <span className="inline-flex items-center gap-1.5">
              <CheckIcon className="size-4" aria-hidden="true" />
              今天已记录
            </span>
          ) : checkinsReady ? (
            personalVisits > 0 ? (
              "再次到访"
            ) : (
              "记录到访"
            )
          ) : (
            "载入中…"
          )}
        </button>
        {personalVisits === 0 ? (
          <button
            type="button"
            aria-pressed={wanted}
            disabled={!checkinsReady}
            onClick={onToggleWishlist}
            className={`min-h-11 touch-manipulation rounded-lg border px-3 text-sm font-medium outline-none transition-colors focus-visible:ring-3 focus-visible:ring-[#672d7e]/35 disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground ${wanted ? "border-[#672d7e] bg-[#672d7e]/8 text-[#672d7e] hover:bg-[#672d7e]/12 dark:border-[#c48fda] dark:text-[#d9afe8]" : "bg-background hover:bg-muted"}`}
          >
            <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
              <HeartIcon
                className={`size-4 ${wanted ? "fill-current" : ""}`}
                aria-hidden="true"
              />
              {wanted ? "已想吃" : "想吃"}
            </span>
          </button>
        ) : null}
      </div>
      {personalStateError ? (
        <p
          className="rounded-lg bg-destructive/10 px-3 py-2 text-xs leading-5 text-destructive"
          role="alert"
        >
          {personalStateError}
        </p>
      ) : null}

      <div className="rounded-xl border bg-muted/25 px-3 py-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs text-muted-foreground">我的到访</p>
            <p className="mt-0.5 font-semibold tabular-nums">
              {personalVisits} 次
            </p>
          </div>
          <p className="max-w-44 text-right text-xs leading-5 text-muted-foreground">
            按日累计，不可撤销或删除
          </p>
        </div>
        {visitDates.length > 0 ? (
          <details className="mt-3 border-t pt-1">
            <summary className="flex min-h-11 cursor-pointer items-center text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring/50">
              查看到访日期
            </summary>
            <ul className="space-y-1 pb-2 text-sm text-muted-foreground">
              {visitDates.map((date) => (
                <li key={date}>{formatHktDate(date)}</li>
              ))}
            </ul>
          </details>
        ) : null}
      </div>

      <button
        type="button"
        onClick={onComment}
        className="flex min-h-11 w-full touch-manipulation items-center justify-center gap-2 rounded-lg border bg-background px-3 text-sm font-medium outline-none transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <MessageCircleIcon className="size-4" aria-hidden="true" />
        写评论
      </button>

      <section aria-labelledby={`comments-${restaurant.id}`}>
        <div className="flex items-center justify-between gap-3">
          <h3 id={`comments-${restaurant.id}`} className="font-semibold">
            最近评论
          </h3>
          <span className="text-xs text-muted-foreground">
            不展示打卡者名单
          </span>
        </div>
        {comments.length > 0 ? (
          <ul className="mt-3 divide-y rounded-lg border">
            {comments.slice(0, 4).map((comment) => (
              <li key={comment.id} className="px-3 py-3 text-sm leading-5">
                <p className="break-words">{comment.body}</p>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {comment.mine ? "我的评论 · " : ""}
                  {comment.date}
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 rounded-lg border border-dashed px-3 py-4 text-sm text-muted-foreground">
            还没有评论。
          </p>
        )}
      </section>
    </div>
  );
}

function MobileRestaurantDrawer({
  restaurant,
  children,
  onClose,
}: {
  restaurant: FoodleRestaurant;
  children: ReactNode;
  onClose: () => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);

  return (
    <Drawer.Root
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      swipeDirection="down"
    >
      <Drawer.Portal>
        <Drawer.Backdrop className="fixed inset-0 z-40 bg-black/15 transition-opacity duration-200 data-ending-style:opacity-0 data-starting-style:opacity-0 motion-reduce:transition-none" />
        <Drawer.Viewport className="pointer-events-none fixed inset-0 z-50 flex items-end overflow-hidden">
          <Drawer.Popup
            initialFocus={() => closeRef.current}
            className="pointer-events-auto max-h-[70dvh] w-full touch-manipulation overflow-y-auto overscroll-contain rounded-t-[1.25rem] border-t bg-background shadow-xl outline-none transition-transform duration-200 [transform:translateY(var(--drawer-swipe-movement-y))] data-ending-style:[transform:translateY(100%)] data-starting-style:[transform:translateY(100%)] data-swiping:transition-none motion-reduce:transition-none"
          >
            <div className="sticky top-0 z-10 flex min-h-12 items-center justify-center border-b bg-background/95 backdrop-blur">
              <span
                className="h-1 w-10 rounded-full bg-muted-foreground/30"
                aria-hidden="true"
              />
              <Drawer.Title render={<span />} className="sr-only">
                {restaurant.sourceFacts.name}
              </Drawer.Title>
              <Drawer.Close
                ref={closeRef}
                aria-label="关闭餐厅详情"
                className="absolute right-2 grid size-11 touch-manipulation place-items-center rounded-lg text-muted-foreground outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <XIcon className="size-4" aria-hidden="true" />
              </Drawer.Close>
            </div>
            <Drawer.Content className="px-5 pt-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))]">
              {children}
            </Drawer.Content>
          </Drawer.Popup>
        </Drawer.Viewport>
      </Drawer.Portal>
    </Drawer.Root>
  );
}

function MobileFilterDrawer({
  open,
  resultCount,
  personalFilter,
  savedCount,
  visitedCount,
  personalStateReady,
  cuisines,
  cuisine,
  price,
  onlyOpen,
  onCuisineChange,
  onPersonalFilterChange,
  onPriceChange,
  onOnlyOpenChange,
  onClear,
  onClose,
}: {
  open: boolean;
  resultCount: number;
  personalFilter: PersonalFilter;
  savedCount: number;
  visitedCount: number;
  personalStateReady: boolean;
  cuisines: readonly string[];
  cuisine: string;
  price: PriceFilter;
  onlyOpen: boolean;
  onPersonalFilterChange: (value: PersonalFilter) => void;
  onCuisineChange: (value: string) => void;
  onPriceChange: (value: PriceFilter) => void;
  onOnlyOpenChange: (value: boolean) => void;
  onClear: () => void;
  onClose: () => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);

  return (
    <Drawer.Root
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) onClose();
      }}
      swipeDirection="down"
    >
      <Drawer.Portal>
        <Drawer.Backdrop className="fixed inset-0 z-40 bg-black/15 transition-opacity duration-200 data-ending-style:opacity-0 data-starting-style:opacity-0 motion-reduce:transition-none" />
        <Drawer.Viewport className="pointer-events-none fixed inset-0 z-50 flex items-end overflow-hidden">
          <Drawer.Popup
            initialFocus={() => closeRef.current}
            className="pointer-events-auto max-h-[78dvh] w-full touch-manipulation overflow-y-auto overscroll-contain rounded-t-[1.25rem] border-t bg-background shadow-xl outline-none transition-transform duration-200 [transform:translateY(var(--drawer-swipe-movement-y))] data-ending-style:[transform:translateY(100%)] data-starting-style:[transform:translateY(100%)] data-swiping:transition-none motion-reduce:transition-none"
          >
            <div className="sticky top-0 z-10 flex min-h-16 items-center justify-between border-b bg-background/95 px-5 backdrop-blur">
              <div>
                <Drawer.Title className="font-semibold">筛选餐厅</Drawer.Title>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  当前有 {resultCount} 家符合条件
                </p>
              </div>
              <Drawer.Close
                ref={closeRef}
                aria-label="关闭筛选"
                className="grid size-11 touch-manipulation place-items-center rounded-lg text-muted-foreground outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <XIcon className="size-4" aria-hidden="true" />
              </Drawer.Close>
            </div>

            <Drawer.Content className="space-y-6 px-5 py-5">
              <fieldset>
                <legend className="text-sm font-semibold">我的状态</legend>
                <div className="mt-3 grid grid-cols-3 gap-2">
                  {PERSONAL_FILTERS.map(({ value, label }) => (
                    <button
                      key={value}
                      type="button"
                      disabled={!personalStateReady && value !== "all"}
                      aria-label={
                        value === "all"
                          ? "全部餐厅"
                          : `${label}，${value === "saved" ? savedCount : visitedCount} 家`
                      }
                      aria-pressed={personalFilter === value}
                      onClick={() => onPersonalFilterChange(value)}
                      className={`min-h-11 rounded-lg border px-3 text-sm font-medium outline-none focus-visible:ring-3 focus-visible:ring-[#672d7e]/35 disabled:cursor-not-allowed disabled:text-muted-foreground ${personalFilter === value ? "border-[#672d7e] bg-[#672d7e] text-white dark:border-[#c48fda] dark:bg-[#c48fda] dark:text-[#211225]" : "bg-background hover:bg-muted"}`}
                    >
                      {label}
                      {value === "all" ? null : (
                        <span className="ml-1 tabular-nums">
                          {value === "saved" ? savedCount : visitedCount}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              </fieldset>

              <fieldset>
                <legend className="text-sm font-semibold">菜系</legend>
                <div className="mt-3 flex flex-wrap gap-2">
                  {["all", ...cuisines].map((item) => (
                    <button
                      key={item}
                      type="button"
                      aria-pressed={cuisine === item}
                      onClick={() => onCuisineChange(item)}
                      className={`min-h-11 rounded-full border px-4 text-sm font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring/50 ${cuisine === item ? "border-foreground bg-foreground text-background" : "bg-background hover:bg-muted"}`}
                    >
                      {item === "all" ? "全部" : item}
                    </button>
                  ))}
                </div>
              </fieldset>

              <fieldset>
                <legend className="text-sm font-semibold">人均价格</legend>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  {(Object.keys(PRICE_LABELS) as PriceFilter[]).map((item) => (
                    <button
                      key={item}
                      type="button"
                      aria-pressed={price === item}
                      onClick={() => onPriceChange(item)}
                      className={`min-h-11 rounded-lg border px-3 text-sm font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring/50 ${price === item ? "border-foreground bg-foreground text-background" : "bg-background hover:bg-muted"}`}
                    >
                      {PRICE_LABELS[item]}
                    </button>
                  ))}
                </div>
              </fieldset>

              <div>
                <h3 className="text-sm font-semibold">营业状态</h3>
                <label className="mt-3 flex min-h-11 items-center justify-between rounded-lg border px-3 text-sm font-medium">
                  只看营业中的餐厅
                  <Switch
                    checked={onlyOpen}
                    onCheckedChange={onOnlyOpenChange}
                    size="sm"
                  />
                </label>
              </div>
            </Drawer.Content>

            <div className="sticky bottom-0 grid grid-cols-[1fr_2fr] gap-2 border-t bg-background/95 px-5 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] backdrop-blur">
              <button
                type="button"
                onClick={onClear}
                className="min-h-11 rounded-lg border px-4 text-sm font-medium outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                重置
              </button>
              <button
                type="button"
                onClick={onClose}
                className="min-h-11 rounded-lg bg-[#672d7e] px-4 text-sm font-medium text-white outline-none hover:bg-[#542267] focus-visible:ring-3 focus-visible:ring-[#672d7e]/40 dark:bg-[#c48fda] dark:text-[#211225]"
              >
                查看 {resultCount} 家餐厅
              </button>
            </div>
          </Drawer.Popup>
        </Drawer.Viewport>
      </Drawer.Portal>
    </Drawer.Root>
  );
}

export function StationFoodMap({ stationId }: { stationId: FoodleStationId }) {
  const station = FOODLE_STATION_MAPS[stationId];
  const restaurants = useMemo(
    () => getFoodleRestaurantsForStation(stationId),
    [stationId],
  );
  const [query, setQuery] = useState("");
  const [cuisine, setCuisine] = useState("all");
  const [price, setPrice] = useState<PriceFilter>("all");
  const [personalFilter, setPersonalFilter] = useState<PersonalFilter>("all");
  const [onlyOpen, setOnlyOpen] = useState(false);
  const [mobileView, setMobileView] = useState<MobileView>("map");
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [selectedRestaurantId, setSelectedRestaurantId] = useState<
    string | null
  >(null);
  const [highlightedRestaurantId, setHighlightedRestaurantId] = useState<
    string | null
  >(null);
  const [now, setNow] = useState<Date | null>(null);
  const [checkins, setCheckins] = useState(emptyFoodMapCheckinStore);
  const [comments, setComments] = useState(emptyFoodMapCommentStore);
  const [candidateDecisions, setCandidateDecisions] = useState(
    emptyCandidateDecisionStore,
  );
  const [storageReady, setStorageReady] = useState(false);
  const [composer, setComposer] = useState<{
    restaurantId: string;
    mode: ComposerMode;
  } | null>(null);
  const [commentBody, setCommentBody] = useState("");
  const [storageError, setStorageError] = useState<string | null>(null);
  const [personalStateMessage, setPersonalStateMessage] = useState("");
  const detailHeadingRef = useRef<HTMLHeadingElement>(null);
  const desktopAsideRef = useRef<HTMLElement>(null);
  const activePersonalFilterButtonRef = useRef<HTMLButtonElement>(null);
  const mobileFilterTriggerRef = useRef<HTMLButtonElement>(null);
  const pendingPersonalFilterFocusRef = useRef(false);
  const selectionOriginRef = useRef<{
    restaurantId: string;
    origin: SelectionOrigin;
  } | null>(null);
  const mobile = useMediaQuery("(max-width: 767px)");

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setNow(new Date());
      try {
        setCheckins(
          parseFoodMapCheckinStore(
            window.localStorage.getItem(FOOD_MAP_CHECKINS_STORAGE_KEY),
          ),
        );
        setComments(
          parseFoodMapCommentStore(
            window.localStorage.getItem(FOOD_MAP_COMMENTS_STORAGE_KEY),
          ),
        );
        setCandidateDecisions(
          parseCandidateDecisionStore(
            window.localStorage.getItem(FOODLE_CANDIDATE_DECISIONS_STORAGE_KEY),
          ),
        );
      } catch {
        setStorageError("浏览器未能读取个人记录，请检查隐私或储存设置。");
      } finally {
        setStorageReady(true);
      }
    }, 0);
    const interval = window.setInterval(() => setNow(new Date()), 60_000);

    return () => {
      window.clearTimeout(timeout);
      window.clearInterval(interval);
    };
  }, []);

  const statuses = useMemo(
    () =>
      new Map(
        restaurants.map((restaurant) => [
          restaurant.id,
          now
            ? getRestaurantOpeningStatus(restaurant, now)
            : {
                state: "unknown" as const,
                label: "正在计算营业状态…",
              },
        ]),
      ),
    [now, restaurants],
  );
  const cuisines = useMemo(
    () => [
      ...new Set(
        restaurants.flatMap(
          (restaurant) => restaurant.sourceFacts.cuisines ?? [],
        ),
      ),
    ],
    [restaurants],
  );
  const cuisineItems = useMemo(
    () =>
      Object.fromEntries([
        ["all", "全部菜系"],
        ...cuisines.map((item) => [item, item]),
      ]),
    [cuisines],
  );
  const personalVisitCounts = useMemo(
    () =>
      Object.fromEntries(
        restaurants.map((restaurant) => [
          restaurant.id,
          countFoodMapVisits(checkins, restaurant.id),
        ]),
      ),
    [checkins, restaurants],
  );
  const wishlistRestaurantIds = useMemo(
    () =>
      new Set(
        restaurants
          .filter(
            (restaurant) =>
              personalVisitCounts[restaurant.id] === 0 &&
              getCandidateDecision(candidateDecisions, restaurant.id) ===
                "saved",
          )
          .map((restaurant) => restaurant.id),
      ),
    [candidateDecisions, personalVisitCounts, restaurants],
  );
  const savedCount = wishlistRestaurantIds.size;
  const visitedCount = restaurants.filter(
    (restaurant) => personalVisitCounts[restaurant.id] > 0,
  ).length;
  const filteredRestaurants = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return restaurants.filter((restaurant) => {
      const haystack = [
        restaurant.sourceFacts.name,
        ...(restaurant.sourceFacts.cuisines ?? []),
      ]
        .join(" ")
        .toLocaleLowerCase();
      return (
        (!needle || haystack.includes(needle)) &&
        (cuisine === "all" ||
          restaurant.sourceFacts.cuisines?.includes(cuisine)) &&
        priceMatches(restaurant, price) &&
        (personalFilter === "all" ||
          (personalFilter === "saved" &&
            wishlistRestaurantIds.has(restaurant.id)) ||
          (personalFilter === "visited" &&
            personalVisitCounts[restaurant.id] > 0)) &&
        (!onlyOpen || statuses.get(restaurant.id)?.state === "open")
      );
    });
  }, [
    cuisine,
    onlyOpen,
    personalFilter,
    personalVisitCounts,
    price,
    query,
    restaurants,
    statuses,
    wishlistRestaurantIds,
  ]);
  const checkinCounts = useMemo(
    () =>
      Object.fromEntries(
        restaurants.map((restaurant) => [
          restaurant.id,
          restaurant.foodle.totalCheckins + personalVisitCounts[restaurant.id],
        ]),
      ),
    [personalVisitCounts, restaurants],
  );
  const selectedRestaurant =
    filteredRestaurants.find(
      (restaurant) => restaurant.id === selectedRestaurantId,
    ) ?? null;
  const today = now ? hktDateKey(now) : "";
  const checkedToday = new Set(checkins.byDate[today] ?? []);
  const activeFilterCount =
    Number(personalFilter !== "all") +
    Number(cuisine !== "all") +
    Number(price !== "all") +
    Number(onlyOpen);
  const personalEmptyState =
    personalFilter === "saved" && savedCount === 0
      ? {
          title: "还没有想吃的餐厅",
          actionLabel: "浏览全部餐厅",
        }
      : personalFilter === "visited" && visitedCount === 0
        ? {
            title: "还没有到访记录",
            actionLabel: "浏览全部餐厅",
          }
        : null;

  useEffect(() => {
    if (!selectedRestaurantId || mobile) return;
    const frame = window.requestAnimationFrame(() => {
      if (desktopAsideRef.current) desktopAsideRef.current.scrollTop = 0;
      detailHeadingRef.current?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [mobile, selectedRestaurantId]);

  useEffect(() => {
    if (selectedRestaurantId) return;
    if (pendingPersonalFilterFocusRef.current) {
      const frame = window.requestAnimationFrame(() => {
        const target = mobile
          ? mobileFilterTriggerRef.current
          : activePersonalFilterButtonRef.current;
        target?.focus();
        pendingPersonalFilterFocusRef.current = false;
        selectionOriginRef.current = null;
      });
      return () => window.cancelAnimationFrame(frame);
    }
    if (!selectionOriginRef.current) return;
    const { restaurantId, origin } = selectionOriginRef.current;
    const frame = window.requestAnimationFrame(() => {
      document
        .querySelector<HTMLElement>(`[data-foodle-${origin}="${restaurantId}"]`)
        ?.focus();
      selectionOriginRef.current = null;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [mobile, personalFilter, selectedRestaurantId]);

  function clearSelection() {
    setSelectedRestaurantId(null);
    setHighlightedRestaurantId(null);
  }

  function selectRestaurant(restaurantId: string, origin: SelectionOrigin) {
    selectionOriginRef.current = { restaurantId, origin };
    setSelectedRestaurantId(restaurantId);
    setHighlightedRestaurantId(null);
  }

  function clearFilters() {
    setQuery("");
    setCuisine("all");
    setPrice("all");
    setPersonalFilter("all");
    setOnlyOpen(false);
    clearSelection();
  }

  function clearEmptyResults() {
    if (personalFilter !== "all") {
      pendingPersonalFilterFocusRef.current = true;
    }
    setPersonalStateMessage("正在显示全部餐厅。");
    clearFilters();
  }

  function openComposer(restaurantId: string, mode: ComposerMode) {
    setStorageError(null);
    setCommentBody("");
    setComposer({ restaurantId, mode });
  }

  function toggleWishlist(restaurantId: string) {
    setStorageError(null);
    const removing =
      getCandidateDecision(candidateDecisions, restaurantId) === "saved";
    const nextDecisions = removing
      ? clearCandidateDecision(candidateDecisions, restaurantId)
      : decideCandidate(candidateDecisions, restaurantId, "saved");

    try {
      window.localStorage.setItem(
        FOODLE_CANDIDATE_DECISIONS_STORAGE_KEY,
        serializeCandidateDecisionStore(nextDecisions),
      );
      setCandidateDecisions(nextDecisions);
      setPersonalStateMessage(removing ? "已从想吃移除。" : "已加入想吃。");
      if (removing && personalFilter === "saved") {
        pendingPersonalFilterFocusRef.current = true;
        clearSelection();
      }
    } catch {
      setStorageError("浏览器未能保存想吃状态，请检查隐私或储存设置。");
    }
  }

  function submitComposer() {
    if (!composer) return;
    const timestamp = new Date();

    try {
      if (composer.mode === "checkin") {
        const wasWanted =
          getCandidateDecision(candidateDecisions, composer.restaurantId) ===
          "saved";
        const nextCheckins = recordFoodMapCheckin(
          checkins,
          hktDateKey(timestamp),
          composer.restaurantId,
        );
        window.localStorage.setItem(
          FOOD_MAP_CHECKINS_STORAGE_KEY,
          serializeFoodMapCheckinStore(nextCheckins),
        );
        setCheckins(nextCheckins);

        if (wasWanted) {
          const nextDecisions = clearCandidateDecision(
            candidateDecisions,
            composer.restaurantId,
          );
          try {
            window.localStorage.setItem(
              FOODLE_CANDIDATE_DECISIONS_STORAGE_KEY,
              serializeCandidateDecisionStore(nextDecisions),
            );
            setCandidateDecisions(nextDecisions);
          } catch {
            setStorageError("到访已记录，但未能从想吃移除，请稍后重试。");
          }
        }

        setPersonalStateMessage(
          wasWanted ? "已记录今天到访，并从想吃移除。" : "已记录今天到访。",
        );
        if (personalFilter === "saved") {
          pendingPersonalFilterFocusRef.current = true;
          clearSelection();
        }
      }

      if (commentBody.trim()) {
        const nextComments = addFoodMapComment(
          comments,
          composer.restaurantId,
          commentBody,
          timestamp.toISOString(),
        );
        window.localStorage.setItem(
          FOOD_MAP_COMMENTS_STORAGE_KEY,
          serializeFoodMapCommentStore(nextComments),
        );
        setComments(nextComments);
      }

      setNow(timestamp);
      setComposer(null);
      setCommentBody("");
    } catch {
      setStorageError("浏览器未能保存这条记录，请检查隐私或储存设置后重试。");
    }
  }

  function detailFor(
    restaurant: FoodleRestaurant,
    headingRef?: RefObject<HTMLHeadingElement | null>,
  ) {
    const visitDates = getFoodMapVisitDates(checkins, restaurant.id);

    return (
      <RestaurantDetails
        restaurant={restaurant}
        status={
          statuses.get(restaurant.id) ?? {
            state: "unknown",
            label: "营业时间待补全",
          }
        }
        totalCheckins={checkinCounts[restaurant.id]}
        personalVisits={visitDates.length}
        visitDates={visitDates}
        checkedToday={checkedToday.has(restaurant.id)}
        checkinsReady={storageReady}
        wanted={wishlistRestaurantIds.has(restaurant.id)}
        personalStateError={storageError}
        localComments={comments.comments.filter(
          (comment) => comment.restaurantId === restaurant.id,
        )}
        onCheckIn={() => openComposer(restaurant.id, "checkin")}
        onToggleWishlist={() => toggleWishlist(restaurant.id)}
        onComment={() => openComposer(restaurant.id, "comment")}
        headingRef={headingRef}
      />
    );
  }

  return (
    <section
      className="flex h-[calc(100dvh-var(--navbar-height))] min-h-0 w-full min-w-0 flex-col overflow-hidden bg-background md:min-h-[38rem]"
      aria-label={`${station.nameZh}站附近餐厅地图`}
    >
      <p className="sr-only" role="status" aria-live="polite" aria-atomic>
        {personalStateMessage}
      </p>
      <header className="z-20 shrink-0 border-b bg-background px-4 py-3 md:px-6 md:py-4">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <Link
              href="/food-map"
              className="inline-flex min-h-8 items-center gap-1 text-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
            >
              <ArrowLeftIcon className="size-4" aria-hidden="true" />
              返回通勤食图
            </Link>
            <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <h1 className="text-pretty text-xl font-semibold tracking-tight md:text-2xl">
                {station.nameZh}站附近
              </h1>
              <p className="text-sm text-muted-foreground">
                500 米 · {restaurants.length} 家餐厅
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 pt-2">
            <div className="flex items-center gap-2 md:hidden">
              <div
                className="flex h-11 shrink-0 touch-manipulation rounded-lg border p-1"
                role="group"
                aria-label="展示方式"
              >
                <button
                  type="button"
                  aria-pressed={mobileView === "map"}
                  onClick={() => setMobileView("map")}
                  className={`grid w-10 place-items-center rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring/50 ${mobileView === "map" ? "bg-[#672d7e] text-white dark:bg-[#c48fda] dark:text-[#211225]" : "text-muted-foreground"}`}
                  aria-label="地图"
                >
                  <MapIcon className="size-4" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  aria-pressed={mobileView === "list"}
                  onClick={() => setMobileView("list")}
                  className={`grid w-10 place-items-center rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring/50 ${mobileView === "list" ? "bg-[#672d7e] text-white dark:bg-[#c48fda] dark:text-[#211225]" : "text-muted-foreground"}`}
                  aria-label="列表"
                >
                  <ListIcon className="size-4" aria-hidden="true" />
                </button>
              </div>
              <button
                ref={mobileFilterTriggerRef}
                type="button"
                aria-label={
                  activeFilterCount > 0
                    ? `筛选餐厅，已应用 ${activeFilterCount} 项`
                    : "筛选餐厅"
                }
                aria-expanded={mobileFiltersOpen}
                onClick={() => setMobileFiltersOpen(true)}
                className="relative grid size-11 shrink-0 place-items-center rounded-lg border text-muted-foreground outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <SlidersHorizontalIcon className="size-4" aria-hidden="true" />
                {activeFilterCount > 0 ? (
                  <span className="absolute -top-1 -right-1 grid size-5 place-items-center rounded-full bg-[#672d7e] text-[10px] font-semibold text-white dark:bg-[#c48fda] dark:text-[#211225]">
                    {activeFilterCount}
                  </span>
                ) : null}
              </button>
            </div>
            <div className="hidden md:block">
              <HeatLegend />
            </div>
          </div>
        </div>

        <div className="mt-3 flex flex-col gap-2 md:flex-row md:items-center">
          <label className="relative block min-w-0 flex-1 md:max-w-sm">
            <span className="sr-only">搜索餐厅或菜系</span>
            <SearchIcon
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              name="restaurant-search"
              autoComplete="off"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                clearSelection();
              }}
              placeholder="搜索餐厅或菜系…"
              className="h-10 pl-9"
            />
          </label>
          <div className="scrollbar-hide hidden min-w-0 items-center gap-2 overflow-x-auto pb-0.5 md:flex">
            <div
              className="flex h-10 shrink-0 items-center rounded-lg border p-1"
              role="group"
              aria-label="我的状态"
            >
              {PERSONAL_FILTERS.map(({ value, label }) => (
                <button
                  key={value}
                  ref={
                    personalFilter === value
                      ? activePersonalFilterButtonRef
                      : undefined
                  }
                  type="button"
                  disabled={!storageReady && value !== "all"}
                  aria-label={
                    value === "all"
                      ? "全部餐厅"
                      : `${label}，${value === "saved" ? savedCount : visitedCount} 家`
                  }
                  aria-pressed={personalFilter === value}
                  onClick={() => {
                    setPersonalFilter(value);
                    clearSelection();
                  }}
                  className={`min-h-8 rounded-md px-2.5 text-xs font-medium whitespace-nowrap outline-none focus-visible:ring-2 focus-visible:ring-[#672d7e]/35 disabled:cursor-not-allowed disabled:text-muted-foreground ${personalFilter === value ? "bg-[#672d7e] text-white dark:bg-[#c48fda] dark:text-[#211225]" : "hover:bg-muted"}`}
                >
                  {label}
                  {value === "all" ? null : (
                    <span className="ml-1 tabular-nums">
                      {value === "saved" ? savedCount : visitedCount}
                    </span>
                  )}
                </button>
              ))}
            </div>
            <Select
              items={cuisineItems}
              value={cuisine}
              onValueChange={(value) => {
                setCuisine(value ?? "all");
                clearSelection();
              }}
            >
              <SelectTrigger
                aria-label="菜系筛选"
                className="h-10 w-28 shrink-0"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部菜系</SelectItem>
                {cuisines.map((item) => (
                  <SelectItem key={item} value={item}>
                    {item}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              items={PRICE_LABELS}
              value={price}
              onValueChange={(value) => {
                setPrice((value ?? "all") as PriceFilter);
                clearSelection();
              }}
            >
              <SelectTrigger
                aria-label="价格筛选"
                className="h-10 w-32 shrink-0"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(PRICE_LABELS) as PriceFilter[]).map((value) => (
                  <SelectItem key={value} value={value}>
                    {PRICE_LABELS[value]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <label className="flex h-10 shrink-0 items-center gap-2 rounded-lg border px-3 text-sm">
              <Switch
                checked={onlyOpen}
                onCheckedChange={(checked) => {
                  setOnlyOpen(checked);
                  clearSelection();
                }}
                size="sm"
              />
              营业中
            </label>
          </div>
        </div>
      </header>

      <div className="min-h-0 flex-1">
        {mobile && mobileView === "list" ? (
          <div className="h-full overflow-y-auto px-4 py-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="text-sm font-semibold">
                餐厅
                <span
                  className="ml-2 font-normal text-muted-foreground"
                  role="status"
                  aria-live="polite"
                >
                  {filteredRestaurants.length} 个结果
                </span>
              </h2>
              <HeatLegend />
            </div>
            {filteredRestaurants.length > 0 ? (
              <div className="space-y-2">
                {filteredRestaurants.map((restaurant) => (
                  <RestaurantListItem
                    key={restaurant.id}
                    restaurant={restaurant}
                    status={statuses.get(restaurant.id)!}
                    checkinCount={checkinCounts[restaurant.id]}
                    personalVisits={personalVisitCounts[restaurant.id]}
                    wanted={wishlistRestaurantIds.has(restaurant.id)}
                    selected={selectedRestaurantId === restaurant.id}
                    highlighted={highlightedRestaurantId === restaurant.id}
                    onSelect={() => selectRestaurant(restaurant.id, "list")}
                    onHighlight={(highlighted) =>
                      setHighlightedRestaurantId(
                        highlighted ? restaurant.id : null,
                      )
                    }
                  />
                ))}
              </div>
            ) : (
              <EmptyResults
                title={personalEmptyState?.title}
                actionLabel={personalEmptyState?.actionLabel}
                onClear={clearEmptyResults}
              />
            )}
          </div>
        ) : (
          <div className="grid h-full min-h-0 md:grid-cols-[22rem_minmax(0,1fr)]">
            <aside
              ref={desktopAsideRef}
              className="hidden min-h-0 overflow-y-auto border-r bg-background md:block"
              aria-label={
                selectedRestaurant
                  ? `${selectedRestaurant.sourceFacts.name}详情`
                  : "餐厅列表"
              }
            >
              {selectedRestaurant ? (
                <div>
                  <div className="sticky top-0 z-10 border-b bg-background/95 px-3 py-2 backdrop-blur">
                    <button
                      type="button"
                      onClick={clearSelection}
                      className="inline-flex min-h-11 items-center gap-2 rounded-lg px-2 text-sm font-medium text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
                    >
                      <ArrowLeftIcon className="size-4" aria-hidden="true" />
                      返回餐厅列表
                    </button>
                  </div>
                  <div className="p-5">
                    {detailFor(selectedRestaurant, detailHeadingRef)}
                  </div>
                </div>
              ) : (
                <div className="p-3">
                  <div className="mb-3 flex items-center justify-between gap-2 px-1">
                    <h2 className="text-sm font-semibold">
                      餐厅
                      <span
                        className="ml-2 font-normal text-muted-foreground"
                        role="status"
                        aria-live="polite"
                      >
                        {filteredRestaurants.length} 个结果
                      </span>
                    </h2>
                    <span className="text-xs text-muted-foreground">
                      点击定位
                    </span>
                  </div>
                  {filteredRestaurants.length > 0 ? (
                    <div className="space-y-2">
                      {filteredRestaurants.map((restaurant) => (
                        <RestaurantListItem
                          key={restaurant.id}
                          restaurant={restaurant}
                          status={statuses.get(restaurant.id)!}
                          checkinCount={checkinCounts[restaurant.id]}
                          personalVisits={personalVisitCounts[restaurant.id]}
                          wanted={wishlistRestaurantIds.has(restaurant.id)}
                          selected={selectedRestaurantId === restaurant.id}
                          highlighted={
                            highlightedRestaurantId === restaurant.id
                          }
                          onSelect={() =>
                            selectRestaurant(restaurant.id, "list")
                          }
                          onHighlight={(highlighted) =>
                            setHighlightedRestaurantId(
                              highlighted ? restaurant.id : null,
                            )
                          }
                        />
                      ))}
                    </div>
                  ) : (
                    <EmptyResults
                      title={personalEmptyState?.title}
                      actionLabel={personalEmptyState?.actionLabel}
                      onClear={clearEmptyResults}
                    />
                  )}
                </div>
              )}
            </aside>
            <div className="relative min-h-0 overflow-hidden bg-[#eef1eb] dark:bg-[#1d211e]">
              <StationMapCanvas
                station={station}
                restaurants={filteredRestaurants}
                checkinCounts={checkinCounts}
                selectedRestaurantId={selectedRestaurant?.id ?? null}
                highlightedRestaurantId={highlightedRestaurantId}
                onSelectRestaurant={(restaurantId) =>
                  selectRestaurant(restaurantId, "map")
                }
                onHighlightRestaurant={setHighlightedRestaurantId}
              />
              <div className="pointer-events-none absolute top-3 left-3 rounded-lg border bg-background/95 px-3 py-2 shadow-sm backdrop-blur md:hidden">
                <HeatLegend />
              </div>
              {!selectedRestaurant && filteredRestaurants.length > 0 ? (
                <p className="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full border bg-background/95 px-3 py-2 text-xs text-muted-foreground shadow-sm backdrop-blur">
                  点击地图上的点查看餐厅
                </p>
              ) : null}
              {mobile && filteredRestaurants.length === 0 ? (
                <div className="absolute inset-x-4 top-1/2 z-10 -translate-y-1/2 rounded-xl bg-background/95 shadow-lg backdrop-blur md:hidden">
                  <EmptyResults
                    title={personalEmptyState?.title}
                    actionLabel={personalEmptyState?.actionLabel}
                    onClear={clearEmptyResults}
                  />
                </div>
              ) : null}
            </div>
          </div>
        )}
      </div>

      {mobile ? (
        <MobileFilterDrawer
          open={mobileFiltersOpen}
          resultCount={filteredRestaurants.length}
          personalFilter={personalFilter}
          savedCount={savedCount}
          visitedCount={visitedCount}
          personalStateReady={storageReady}
          cuisines={cuisines}
          cuisine={cuisine}
          price={price}
          onlyOpen={onlyOpen}
          onPersonalFilterChange={(value) => {
            setPersonalFilter(value);
            clearSelection();
          }}
          onCuisineChange={(value) => {
            setCuisine(value);
            clearSelection();
          }}
          onPriceChange={(value) => {
            setPrice(value);
            clearSelection();
          }}
          onOnlyOpenChange={(value) => {
            setOnlyOpen(value);
            clearSelection();
          }}
          onClear={() => {
            setPersonalFilter("all");
            setCuisine("all");
            setPrice("all");
            setOnlyOpen(false);
            clearSelection();
          }}
          onClose={() => setMobileFiltersOpen(false)}
        />
      ) : null}

      {mobile && selectedRestaurant ? (
        <MobileRestaurantDrawer
          restaurant={selectedRestaurant}
          onClose={clearSelection}
        >
          {detailFor(selectedRestaurant)}
        </MobileRestaurantDrawer>
      ) : null}

      <Dialog
        open={composer !== null}
        onOpenChange={(open) => {
          if (!open) {
            setComposer(null);
            setStorageError(null);
          }
        }}
      >
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>
              {composer?.mode === "checkin" ? "记录今天到访" : "写评论"}
            </DialogTitle>
            <DialogDescription>
              {composer?.mode === "checkin"
                ? "同一家餐厅每天最多记录一次；确认后不可撤销或删除。评论可选。"
                : "评论会保存到当前浏览器的 mock 数据中。"}
            </DialogDescription>
          </DialogHeader>
          <label className="grid gap-2 text-sm font-medium">
            {composer?.mode === "checkin" ? "顺便说两句（可选）" : "评论内容"}
            <Textarea
              name="restaurant-comment"
              autoComplete="off"
              value={commentBody}
              onChange={(event) => setCommentBody(event.target.value)}
              maxLength={280}
              rows={4}
              placeholder="例如：从哪个出口走最快、适合点什么…"
            />
          </label>
          <div className="flex justify-between text-xs text-muted-foreground">
            <span aria-live="polite">{storageError}</span>
            <span>{commentBody.length}/280</span>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setComposer(null)}>
              取消
            </Button>
            <Button
              disabled={composer?.mode === "comment" && !commentBody.trim()}
              onClick={submitComposer}
            >
              {composer?.mode === "checkin" ? "记录到访" : "发布评论"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
