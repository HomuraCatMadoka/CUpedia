"use client";

import {
  Check,
  ChevronRight,
  ExternalLink,
  Sparkles,
  Star,
  Utensils,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { RestaurantArtwork } from "@/components/food-map/restaurant-artwork";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { MTR_STATIONS } from "@/lib/food-map/data";
import {
  buildMatchComparison,
  chooseFoodleMatch,
  emptyFoodleMatchStore,
  FOODLE_MATCH_STORAGE_KEY,
  getFoodleMatchPair,
  googleMapsUrlFor,
  openRiceUrlFor,
  parseFoodleMatchStore,
  saveFoodleMatchResult,
  serializeFoodleMatchStore,
  startFoodleMatch,
  type FoodleMatchResult,
  type FoodleMatchSession,
  type MatchComparisonValue,
  type MatchSide,
} from "@/lib/food-map/match";
import {
  FOODLE_RESTAURANTS,
  type FoodleRestaurant,
} from "@/lib/food-map/restaurant-catalog";

const stationById = new Map(
  MTR_STATIONS.map((station) => [station.id, station]),
);
const bundledRestaurantById = new Map(
  FOODLE_RESTAURANTS.map((restaurant) => [restaurant.id, restaurant]),
);
const countFormatter = new Intl.NumberFormat("zh-HK");

type MatchView =
  | { kind: "comparison"; session: FoodleMatchSession }
  | { kind: "result"; result: FoodleMatchResult; reopened: boolean };

function count(value: number | null) {
  return value === null ? "暂缺" : countFormatter.format(value);
}

function totalCommute(restaurant: FoodleRestaurant) {
  const station = stationById.get(restaurant.foodle.stationId);
  const walk = restaurant.foodle.walkMinutes;
  if (!station || walk === null) return null;
  return station.minutes + walk;
}

function scoreLabel(restaurant: FoodleRestaurant) {
  return restaurant.foodle.averageScore === null
    ? "暂缺"
    : restaurant.foodle.averageScore.toFixed(1);
}

function heatLabel(restaurant: FoodleRestaurant) {
  const checkins = restaurant.foodle.totalCheckins;
  return checkins === null ? "Foodle 打卡暂缺" : `Foodle ${checkins} 次`;
}

function heatClass(checkins: number | null) {
  if (checkins === null) {
    return "border-border bg-background/90 text-muted-foreground";
  }
  if (checkins >= 50) {
    return "border-[#672d7e] bg-[#672d7e] text-white dark:border-[#c48fda] dark:bg-[#c48fda] dark:text-[#211225]";
  }
  if (checkins >= 25) {
    return "border-[#b990c8] bg-[#eee2f2] text-[#5a276d] dark:border-[#805390] dark:bg-[#35253b] dark:text-[#d8b4e5]";
  }
  return "border-[#d7c8a7] bg-[#f4efe4] text-[#695936] dark:border-[#665b43] dark:bg-[#302c22] dark:text-[#ddcda8]";
}

function MatchArtwork({
  restaurant,
  activeImageIndex = 0,
  onActiveImageChange,
}: {
  restaurant: FoodleRestaurant;
  activeImageIndex?: number;
  onActiveImageChange?: (index: number) => void;
}) {
  return (
    <RestaurantArtwork
      restaurant={restaurant}
      aspectClassName="aspect-[4/5]"
      activeImageIndex={activeImageIndex}
      onActiveImageChange={onActiveImageChange}
      controlsLabel={`${restaurant.sourceFacts.name}餐厅插画`}
      fallbackTestId="match-artwork-fallback"
    />
  );
}

function ReadOnlyDetails({
  restaurant,
  open,
  onOpenChange,
  activeImageIndex,
  onActiveImageChange,
}: {
  restaurant: FoodleRestaurant | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  activeImageIndex: number;
  onActiveImageChange: (index: number) => void;
}) {
  if (!restaurant) return null;
  const station = stationById.get(restaurant.foodle.stationId);
  const commute = totalCommute(restaurant);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="max-h-[calc(100dvh-1rem)] overflow-y-auto overscroll-contain pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))] motion-reduce:duration-0 sm:max-w-lg"
      >
        <DialogHeader className="pr-12">
          <DialogTitle className="break-words text-xl leading-tight">
            {restaurant.sourceFacts.name}
          </DialogTitle>
          <DialogDescription>只读详情</DialogDescription>
        </DialogHeader>
        <MatchArtwork
          key={restaurant.id}
          restaurant={restaurant}
          activeImageIndex={activeImageIndex}
          onActiveImageChange={onActiveImageChange}
        />
        <dl className="divide-y rounded-xl border text-sm">
          <DetailRow label="车站" value={station?.nameZh ?? "暂缺"} />
          <DetailRow
            label="通勤"
            value={
              commute === null
                ? "暂缺"
                : `${commute} 分钟 · 港铁 ${station?.minutes} · 步行 ${restaurant.foodle.walkMinutes}`
            }
          />
          <DetailRow
            label="菜系"
            value={restaurant.sourceFacts.cuisines?.join("、") ?? "暂缺"}
          />
          <DetailRow
            label="价格"
            value={restaurant.sourceFacts.priceRange ?? "暂缺"}
          />
          <DetailRow
            label="营业"
            value={restaurant.sourceFacts.openingLabel ?? "资料暂缺"}
          />
          <DetailRow label="Foodle 分" value={scoreLabel(restaurant)} />
          <DetailRow
            label="到访 / 打卡"
            value={`${count(restaurant.foodle.uniqueVisitors)} 人 / ${count(
              restaurant.foodle.totalCheckins,
            )} 次`}
          />
        </dl>
        <DialogClose
          render={
            <button
              type="button"
              className="min-h-11 rounded-lg border px-4 text-sm font-medium hover:bg-muted focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            />
          }
        >
          返回 Match
        </DialogClose>
      </DialogContent>
    </Dialog>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[5rem_minmax(0,1fr)] gap-3 px-3 py-2.5">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words">{value}</dd>
    </div>
  );
}

function MatchCloseButton() {
  return (
    <DialogClose
      render={
        <button
          type="button"
          aria-label="关闭 Match"
          className="grid size-11 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        />
      }
    >
      <X className="size-4" aria-hidden="true" />
    </DialogClose>
  );
}

function CandidateCard({
  restaurant,
  incumbent,
  side,
  matchState,
  onDetails,
  activeImageIndex,
  onActiveImageChange,
}: {
  restaurant: FoodleRestaurant;
  incumbent: boolean;
  side: MatchSide;
  matchState: "selected" | "exiting" | null;
  onDetails: (restaurant: FoodleRestaurant, trigger: HTMLButtonElement) => void;
  activeImageIndex: number;
  onActiveImageChange: (index: number) => void;
}) {
  const station = stationById.get(restaurant.foodle.stationId);
  const commute = totalCommute(restaurant);

  return (
    <article
      data-testid={`match-${side}-candidate`}
      data-restaurant-id={restaurant.id}
      data-match-state={matchState ?? undefined}
      className={[
        "min-w-0 overflow-hidden rounded-xl border bg-background transition-[opacity,transform,border-color] duration-200 motion-reduce:duration-0",
        matchState === "selected"
          ? "-translate-y-0.5 scale-[1.015] border-[#672d7e]"
          : matchState === "exiting"
            ? "scale-[0.96] opacity-35"
            : "",
      ].join(" ")}
    >
      <div
        className="relative overflow-hidden"
        data-testid={`match-${side}-artwork`}
      >
        <MatchArtwork
          key={restaurant.id}
          restaurant={restaurant}
          activeImageIndex={activeImageIndex}
          onActiveImageChange={onActiveImageChange}
        />
        <span
          data-testid={`match-${side}-heat`}
          className={`absolute top-2 left-2 max-w-[calc(100%-1rem)] truncate rounded-full border px-2 py-1 text-[10px] font-semibold tabular-nums ${heatClass(
            restaurant.foodle.totalCheckins,
          )}`}
        >
          {heatLabel(restaurant)}
        </span>
        {incumbent ? (
          <span className="absolute top-10 left-2 rounded-lg border border-white/60 bg-[#672d7e] px-2 py-1 text-[10px] font-semibold text-white dark:bg-[#c48fda] dark:text-[#211225]">
            上轮胜出
          </span>
        ) : null}
        <button
          type="button"
          aria-label={`查看 ${restaurant.sourceFacts.name} 详情`}
          onClick={(event) => onDetails(restaurant, event.currentTarget)}
          className="absolute right-2 bottom-2 inline-flex min-h-11 touch-manipulation items-center gap-0.5 rounded-lg border bg-background/92 px-2 text-[10px] font-semibold text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-inset focus-visible:ring-[#672d7e]/45"
        >
          详情
          <ChevronRight className="size-3" aria-hidden="true" />
        </button>
      </div>

      <div className="p-2.5 sm:p-3">
        <h3
          data-testid={`match-${side}-name`}
          className="line-clamp-2 min-h-10 break-words text-sm leading-5 font-semibold sm:text-base"
        >
          {restaurant.sourceFacts.name}
        </h3>
        <p className="mt-1 flex min-h-5 items-center gap-1 text-[11px] font-semibold tabular-nums text-muted-foreground sm:text-xs">
          <Star
            className="size-3.5 fill-[#672d7e] text-[#672d7e] dark:fill-[#c48fda] dark:text-[#c48fda]"
            aria-hidden="true"
          />
          Foodle {scoreLabel(restaurant)}
          <span aria-hidden="true">·</span>
          通勤 {commute === null ? "暂缺" : `${commute} 分`}
        </p>
        <p className="mt-1 line-clamp-2 min-h-8 text-[11px] leading-4 text-muted-foreground">
          {station?.nameZh ?? "站点暂缺"} /{" "}
          {restaurant.sourceFacts.cuisines?.[0] ?? "菜系暂缺"}
          <br />
          {restaurant.sourceFacts.priceRange ?? "价格暂缺"}
        </p>
      </div>
    </article>
  );
}

function ComparisonCell({
  value,
  restaurantName,
  label,
}: {
  value: MatchComparisonValue;
  restaurantName: string;
  label: string;
}) {
  return (
    <span
      role="cell"
      aria-label={`${restaurantName}，${label}，${value.primary}${
        value.secondary ? `，${value.secondary}` : ""
      }`}
      className="min-w-0 px-1.5 py-2 text-center sm:px-2.5"
    >
      <span className="block break-words text-xs font-semibold tabular-nums sm:text-sm">
        {value.primary}
      </span>
      {value.secondary ? (
        <small className="mt-0.5 block break-words text-[10px] leading-4 text-muted-foreground sm:text-[11px]">
          {value.secondary}
        </small>
      ) : null}
    </span>
  );
}

function MatchComparisonView({
  session,
  restaurantsById,
  transitioningId,
  focusChoiceId,
  onChoose,
  onDetails,
  onChoiceFocused,
  photoIndexes,
  onPhotoChange,
}: {
  session: FoodleMatchSession;
  restaurantsById: ReadonlyMap<string, FoodleRestaurant>;
  transitioningId: string | null;
  focusChoiceId: string | null;
  onChoose: (restaurantId: string, keyboardActivation: boolean) => void;
  onDetails: (restaurant: FoodleRestaurant, trigger: HTMLButtonElement) => void;
  onChoiceFocused: () => void;
  photoIndexes: Readonly<Record<string, number>>;
  onPhotoChange: (restaurantId: string, index: number) => void;
}) {
  const choiceButtonRefs = useRef(new Map<string, HTMLButtonElement>());
  const pairIds = getFoodleMatchPair(session);
  const left = pairIds ? restaurantsById.get(pairIds[0]) : null;
  const right = pairIds ? restaurantsById.get(pairIds[1]) : null;

  useEffect(() => {
    if (!focusChoiceId) return;
    choiceButtonRefs.current.get(focusChoiceId)?.focus({ preventScroll: true });
    onChoiceFocused();
  }, [focusChoiceId, onChoiceFocused, session]);

  if (!left || !right) return null;
  const leftStation = stationById.get(left.foodle.stationId);
  const rightStation = stationById.get(right.foodle.stationId);
  const comparison = buildMatchComparison(
    left,
    right,
    leftStation?.minutes ?? Number.NaN,
    rightStation?.minutes ?? Number.NaN,
  );
  const totalRounds = session.candidateIds.length - 1;
  const currentRound = session.challengerIndex;
  const showProgress = totalRounds > 1;

  return (
    <div
      className="min-h-0 overflow-y-auto overscroll-contain px-4 pt-0 pb-4 sm:px-5"
      data-testid="match-comparison"
    >
      <h2 className="mt-1 mb-4 text-center text-[1.75rem] leading-tight font-bold tracking-[-0.04em] text-balance">
        最后留下哪家？
      </h2>

      <div className="grid grid-cols-2 gap-3">
        <CandidateCard
          restaurant={left}
          incumbent={
            session.challengerIndex > 1 && left.id === session.championId
          }
          side="left"
          matchState={
            transitioningId === null
              ? null
              : transitioningId === left.id
                ? "selected"
                : "exiting"
          }
          onDetails={onDetails}
          activeImageIndex={photoIndexes[left.id] ?? 0}
          onActiveImageChange={(index) => onPhotoChange(left.id, index)}
        />
        <CandidateCard
          restaurant={right}
          incumbent={
            session.challengerIndex > 1 && right.id === session.championId
          }
          side="right"
          matchState={
            transitioningId === null
              ? null
              : transitioningId === right.id
                ? "selected"
                : "exiting"
          }
          onDetails={onDetails}
          activeImageIndex={photoIndexes[right.id] ?? 0}
          onActiveImageChange={(index) => onPhotoChange(right.id, index)}
        />
      </div>

      {comparison.differences.length > 0 ? (
        <div
          className="mt-3 flex flex-wrap justify-center gap-1.5"
          aria-label="主要差异"
        >
          {comparison.differences.map((difference) => (
            <span
              key={difference.key}
              aria-label={difference.accessibleText}
              className="rounded-full bg-[#eee2f2] px-2.5 py-1 text-[11px] font-semibold text-[#5a276d] dark:bg-[#35253b] dark:text-[#d8b4e5]"
            >
              {difference.text}
            </span>
          ))}
        </div>
      ) : null}

      <div
        className="sticky bottom-0 z-10 -mx-4 mt-3 grid grid-cols-2 gap-3 border-t bg-background/95 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-sm sm:-mx-5 sm:px-5 sm:pb-3"
        role="group"
        aria-label="选择餐厅"
        aria-busy={transitioningId === null ? undefined : "true"}
        data-testid="match-choice-actions"
      >
        {(
          [
            { restaurant: left, side: "left" },
            { restaurant: right, side: "right" },
          ] as const
        ).map(({ restaurant, side }) => (
          <button
            key={restaurant.id}
            data-testid={`match-${side}-choice`}
            ref={(button) => {
              if (button) choiceButtonRefs.current.set(restaurant.id, button);
              else choiceButtonRefs.current.delete(restaurant.id);
            }}
            type="button"
            aria-label={`选择 ${restaurant.sourceFacts.name}`}
            disabled={transitioningId !== null}
            onClick={(event) => onChoose(restaurant.id, event.detail === 0)}
            className={[
              "inline-flex min-h-12 touch-manipulation items-center justify-center rounded-xl border px-2 text-sm font-semibold focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-[#672d7e]/45 disabled:cursor-default",
              transitioningId === restaurant.id
                ? "border-[#672d7e] bg-[#672d7e] text-white dark:border-[#c48fda] dark:bg-[#c48fda] dark:text-[#211225]"
                : "border-[#672d7e]/40 bg-background text-[#672d7e] hover:border-[#672d7e] hover:bg-[#f7f0f9] dark:border-[#c48fda]/45 dark:text-[#c48fda] dark:hover:bg-[#34253a]",
            ].join(" ")}
          >
            <Utensils className="mr-1.5 size-4" aria-hidden="true" />
            选这家
          </button>
        ))}
      </div>

      <details className="mt-1 overflow-hidden rounded-xl border bg-background open:mb-20">
        <summary className="min-h-11 cursor-pointer px-3 py-3 text-center text-sm font-semibold marker:text-muted-foreground">
          详细比较
        </summary>
        <div className="border-t" role="table" aria-label="餐厅资料比较">
          <div className="sr-only" role="row">
            <span role="columnheader">{left.sourceFacts.name}</span>
            <span role="columnheader">比较项目</span>
            <span role="columnheader">{right.sourceFacts.name}</span>
          </div>
          {comparison.rows.map((row) => (
            <div
              key={row.key}
              role="row"
              className="grid grid-cols-[minmax(0,1fr)_4.25rem_minmax(0,1fr)] items-stretch border-b last:border-b-0"
            >
              <ComparisonCell
                value={row.left}
                restaurantName={left.sourceFacts.name}
                label={row.label}
              />
              <span
                role="rowheader"
                className="grid place-content-center border-x bg-muted/35 px-1 py-2 text-center text-[10px] font-semibold text-muted-foreground sm:text-[11px]"
              >
                {row.label}
                {row.labelSub ? (
                  <small className="mt-0.5 block text-[9px] font-normal">
                    {row.labelSub}
                  </small>
                ) : null}
              </span>
              <ComparisonCell
                value={row.right}
                restaurantName={right.sourceFacts.name}
                label={row.label}
              />
            </div>
          ))}
        </div>
      </details>

      <p className="sr-only" aria-live="polite" aria-atomic="true">
        {showProgress
          ? `第 ${currentRound} / ${totalRounds} 轮：${left.sourceFacts.name}和${right.sourceFacts.name}`
          : `${left.sourceFacts.name}和${right.sourceFacts.name}`}
      </p>
    </div>
  );
}

function resultFact(
  result: FoodleMatchResult,
  selected: FoodleRestaurant,
  restaurantsById: ReadonlyMap<string, FoodleRestaurant>,
) {
  if (!result.finalOpponentId) return "";
  const opponent = restaurantsById.get(result.finalOpponentId);
  if (!opponent) return "";
  const selectedStation = stationById.get(selected.foodle.stationId);
  const opponentStation = stationById.get(opponent.foodle.stationId);
  const comparison = buildMatchComparison(
    selected,
    opponent,
    selectedStation?.minutes ?? Number.NaN,
    opponentStation?.minutes ?? Number.NaN,
  );
  const owned = comparison.differences.find((difference) =>
    difference.text.startsWith(selected.sourceFacts.name),
  );
  return owned ? owned.text.slice(selected.sourceFacts.name.length) : "";
}

function MatchResultView({
  result,
  restaurantsById,
  reopened,
  onReselect,
  googleMapsRef,
  activeImageIndex,
  onActiveImageChange,
}: {
  result: FoodleMatchResult;
  restaurantsById: ReadonlyMap<string, FoodleRestaurant>;
  reopened: boolean;
  onReselect: () => void;
  googleMapsRef: React.RefObject<HTMLAnchorElement | null>;
  activeImageIndex: number;
  onActiveImageChange: (index: number) => void;
}) {
  const restaurant = restaurantsById.get(result.restaurantId);
  if (!restaurant) return null;
  const station = stationById.get(restaurant.foodle.stationId);
  const commute = totalCommute(restaurant);
  const ownedFact = resultFact(result, restaurant, restaurantsById);

  return (
    <div
      className="grid min-h-0 overflow-y-auto overscroll-contain px-5 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))] text-center [@media(max-height:720px)]:pt-1 sm:px-6 sm:pb-4"
      data-testid="match-result"
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      <div className="m-auto grid w-full max-w-sm justify-items-center">
        <div className="relative mb-5 w-[min(66vw,14.5rem)] rotate-[-1.5deg] overflow-visible rounded-xl border bg-muted [@media(max-height:720px)]:mb-2 [@media(max-height:720px)]:w-[min(40vw,10.125rem)]">
          <div className="overflow-hidden rounded-xl">
            <MatchArtwork
              key={restaurant.id}
              restaurant={restaurant}
              activeImageIndex={activeImageIndex}
              onActiveImageChange={onActiveImageChange}
            />
          </div>
          <span className="absolute -right-3 -bottom-3 grid size-12 place-items-center rounded-full border-4 border-background bg-[#672d7e] text-white dark:bg-[#c48fda] dark:text-[#211225]">
            <Check className="size-5" strokeWidth={3} aria-hidden="true" />
          </span>
        </div>
        <p className="text-[11px] font-bold tracking-[0.16em] text-[#672d7e] uppercase dark:text-[#c48fda]">
          {reopened
            ? "上次 Match"
            : result.mode === "single"
              ? "只有这家候选"
              : "Match"}
        </p>
        <h2 className="mt-1 line-clamp-2 break-words text-[2rem] leading-tight font-bold tracking-[-0.045em] text-balance">
          {restaurant.sourceFacts.name}
        </h2>
        <p className="mt-1 text-sm font-medium text-muted-foreground">
          {station?.nameZh ?? "站点暂缺"} ·{" "}
          {restaurant.sourceFacts.cuisines?.[0] ?? "菜系暂缺"} ·{" "}
          {restaurant.sourceFacts.priceRange ?? "价格暂缺"}
        </p>
        <p className="mt-1 text-xs font-semibold text-[#672d7e] dark:text-[#c48fda]">
          {result.sourceLabel} · {result.candidateIds.length} 家候选
        </p>

        <dl className="mt-3 grid w-full grid-cols-3 divide-x">
          <ResultStat label="Foodle 平均分" value={scoreLabel(restaurant)} />
          <ResultStat
            label="港铁 + 步行"
            value={commute === null ? "暂缺" : `${commute} 分钟`}
          />
          <ResultStat
            label={
              restaurant.foodle.uniqueVisitors === null
                ? "Foodle 打卡"
                : `${restaurant.foodle.uniqueVisitors} 人到访`
            }
            value={
              restaurant.foodle.totalCheckins === null
                ? "暂缺"
                : `${restaurant.foodle.totalCheckins} 次`
            }
          />
        </dl>

        {result.mode === "single" ? (
          <p className="mt-3 text-sm text-muted-foreground">
            这一轮只有这家候选，无需比较。
          </p>
        ) : ownedFact ? (
          <p className="mt-3 text-sm text-muted-foreground">
            相比最后一家：{ownedFact}
          </p>
        ) : null}

        <div className="mt-4 grid w-full grid-cols-2 gap-2">
          <a
            ref={googleMapsRef}
            href={googleMapsUrlFor(restaurant, station?.nameZh ?? "香港")}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-12 items-center justify-center gap-1.5 rounded-xl bg-[#672d7e] px-3 text-sm font-semibold text-white hover:bg-[#552268] focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-[#672d7e]/45 dark:bg-[#c48fda] dark:text-[#211225] dark:hover:bg-[#d3a8e5]"
          >
            Google Maps
            <ExternalLink className="size-3.5" aria-hidden="true" />
          </a>
          <a
            href={openRiceUrlFor(restaurant)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-12 items-center justify-center gap-1.5 rounded-xl border bg-background px-3 text-sm font-semibold hover:bg-muted focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            OpenRice
            <ExternalLink className="size-3.5" aria-hidden="true" />
          </a>
        </div>
        {!reopened && result.mode === "multi" ? (
          <button
            type="button"
            onClick={onReselect}
            className="mt-2 min-h-11 w-full rounded-lg px-3 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            再选一次
          </button>
        ) : null}
      </div>
    </div>
  );
}

function ResultStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid min-w-0 px-2 py-1.5">
      <dt className="row-start-2 break-words text-[10px] leading-4 text-muted-foreground sm:text-[11px]">
        {label}
      </dt>
      <dd className="row-start-1 mb-1 break-words text-base font-bold tabular-nums sm:text-lg">
        {value}
      </dd>
    </div>
  );
}

export function FoodleMatch({
  candidates,
  sourceLabel,
  ready,
  random,
  initialSide,
  initialResult,
  onResult,
}: {
  candidates: readonly FoodleRestaurant[];
  sourceLabel: string;
  ready: boolean;
  random?: () => number;
  initialSide?: MatchSide;
  initialResult?: FoodleMatchResult | null;
  onResult?: (result: FoodleMatchResult) => void | Promise<void>;
}) {
  const usesExternalResult = initialResult !== undefined;
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<MatchView | null>(null);
  const [storedResult, setStoredResult] = useState<FoodleMatchResult | null>(
    initialResult ?? null,
  );
  const [storageReady, setStorageReady] = useState(usesExternalResult);
  const [detailRestaurant, setDetailRestaurant] =
    useState<FoodleRestaurant | null>(null);
  const [transitioningId, setTransitioningId] = useState<string | null>(null);
  const [focusChoiceId, setFocusChoiceId] = useState<string | null>(null);
  const [photoIndexes, setPhotoIndexes] = useState<
    Readonly<Record<string, number>>
  >({});
  const googleMapsRef = useRef<HTMLAnchorElement>(null);
  const startButtonRef = useRef<HTMLButtonElement>(null);
  const lastResultButtonRef = useRef<HTMLButtonElement>(null);
  const matchReturnFocusRef = useRef<HTMLElement | null>(null);
  const detailReturnFocusRef = useRef<HTMLButtonElement | null>(null);
  const transitionTimerRef = useRef<number | null>(null);

  const candidateIds = useMemo(
    () => candidates.map((candidate) => candidate.id),
    [candidates],
  );
  const restaurantsById = useMemo(
    () =>
      new Map([
        ...bundledRestaurantById,
        ...candidates.map((candidate) => [candidate.id, candidate] as const),
      ]),
    [candidates],
  );
  const effectiveStoredResult = usesExternalResult
    ? (initialResult ?? null)
    : storedResult;
  const storedRestaurant = effectiveStoredResult
    ? restaurantsById.get(effectiveStoredResult.restaurantId)
    : null;

  useEffect(() => {
    if (usesExternalResult) return;
    const timeout = window.setTimeout(() => {
      try {
        setStoredResult(
          parseFoodleMatchStore(
            window.localStorage.getItem(FOODLE_MATCH_STORAGE_KEY),
          ).result,
        );
      } catch {
        setStoredResult(null);
      } finally {
        setStorageReady(true);
      }
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [usesExternalResult]);

  useEffect(() => {
    if (!open || view?.kind !== "result") return;
    const timeout = window.setTimeout(
      () => googleMapsRef.current?.focus({ preventScroll: true }),
      0,
    );
    return () => window.clearTimeout(timeout);
  }, [open, view]);

  useEffect(
    () => () => {
      if (transitionTimerRef.current !== null) {
        window.clearTimeout(transitionTimerRef.current);
      }
    },
    [],
  );

  const clearChoiceFocus = useCallback(() => setFocusChoiceId(null), []);
  const changePhoto = useCallback((restaurantId: string, index: number) => {
    setPhotoIndexes((current) => ({ ...current, [restaurantId]: index }));
  }, []);
  const openDetails = useCallback(
    (restaurant: FoodleRestaurant, trigger: HTMLButtonElement) => {
      detailReturnFocusRef.current = trigger;
      setDetailRestaurant(restaurant);
    },
    [],
  );

  function persistResult(result: FoodleMatchResult) {
    if (usesExternalResult) {
      if (onResult) void onResult(result);
      return;
    }
    setStoredResult(result);
    try {
      window.localStorage.setItem(
        FOODLE_MATCH_STORAGE_KEY,
        serializeFoodleMatchStore(
          saveFoodleMatchResult(emptyFoodleMatchStore(), result),
        ),
      );
    } catch {
      // Keep the completed result available for this tab.
    }
  }

  function begin(
    ids: readonly string[],
    label: string,
    returnFocus: HTMLElement | null = null,
  ) {
    if (transitionTimerRef.current !== null) {
      window.clearTimeout(transitionTimerRef.current);
      transitionTimerRef.current = null;
    }
    setTransitioningId(null);
    setFocusChoiceId(null);
    if (!open) matchReturnFocusRef.current = returnFocus;
    const next = startFoodleMatch(ids, label, undefined, {
      random,
      championSide: initialSide,
    });
    if (next.kind === "empty") return;
    if (next.kind === "result") persistResult(next.result);
    setView(
      next.kind === "result"
        ? { kind: "result", result: next.result, reopened: false }
        : next,
    );
    setOpen(true);
  }

  function choose(restaurantId: string, keyboardActivation: boolean) {
    if (view?.kind !== "comparison" || transitioningId !== null) return;
    const next = chooseFoodleMatch(view.session, restaurantId);
    if (next.kind === "comparison" && next.session === view.session) return;

    setTransitioningId(restaurantId);
    setFocusChoiceId(null);
    const reducedMotion =
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    transitionTimerRef.current = window.setTimeout(
      () => {
        transitionTimerRef.current = null;
        setTransitioningId(null);
        if (next.kind === "result") {
          persistResult(next.result);
          setView({ kind: "result", result: next.result, reopened: false });
          return;
        }
        setView(next);
        if (keyboardActivation) setFocusChoiceId(next.session.championId);
      },
      reducedMotion ? 10 : 190,
    );
  }

  function reopenResult() {
    if (!effectiveStoredResult) return;
    matchReturnFocusRef.current = lastResultButtonRef.current;
    setView({ kind: "result", result: effectiveStoredResult, reopened: true });
    setOpen(true);
  }

  function changeOpen(nextOpen: boolean) {
    setOpen(nextOpen);
    if (!nextOpen) {
      if (transitionTimerRef.current !== null) {
        window.clearTimeout(transitionTimerRef.current);
        transitionTimerRef.current = null;
      }
      setTransitioningId(null);
      setFocusChoiceId(null);
      setDetailRestaurant(null);
      const returnFocus = matchReturnFocusRef.current;
      matchReturnFocusRef.current = null;
      window.setTimeout(() => returnFocus?.focus({ preventScroll: true }), 0);
    }
  }

  if (!ready && !storageReady) return null;
  if (candidates.length === 0 && !storedRestaurant) return null;

  return (
    <>
      <div className="mb-3 space-y-2" aria-label="Foodle Match 选择">
        {candidates.length > 0 ? (
          <button
            ref={startButtonRef}
            type="button"
            disabled={!ready}
            aria-label={
              candidates.length === 1
                ? `选择这家：${candidates[0].sourceFacts.name}`
                : `从 ${candidates.length} 家想吃候选开始 Match`
            }
            onClick={() =>
              begin(candidateIds, sourceLabel, startButtonRef.current)
            }
            className="flex min-h-14 w-full items-center justify-between gap-3 rounded-xl bg-[#672d7e] px-4 py-3 text-left text-white hover:bg-[#552268] focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-[#672d7e]/45 disabled:cursor-wait disabled:opacity-60 dark:bg-[#c48fda] dark:text-[#211225] dark:hover:bg-[#d3a8e5]"
          >
            <span className="flex min-w-0 items-center gap-3">
              <Sparkles className="size-5 shrink-0" aria-hidden="true" />
              <span className="min-w-0">
                <span className="block text-sm font-semibold">
                  {candidates.length === 1
                    ? "选择这家"
                    : `从 ${candidates.length} 家选一家`}
                </span>
                <span className="mt-0.5 block truncate text-xs opacity-80">
                  {sourceLabel}
                </span>
              </span>
            </span>
            <span aria-hidden="true">→</span>
          </button>
        ) : null}

        {storageReady && storedRestaurant ? (
          <button
            ref={lastResultButtonRef}
            type="button"
            aria-label={`查看上次 Match：${storedRestaurant.sourceFacts.name}`}
            onClick={reopenResult}
            className="flex min-h-11 w-full items-center justify-between gap-3 rounded-lg border bg-background px-3 py-2 text-left hover:bg-muted focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <span className="min-w-0 truncate text-sm">
              <span className="font-medium">上次 Match</span>
              <span className="text-muted-foreground">
                {" "}
                · {storedRestaurant.sourceFacts.name}
              </span>
            </span>
            <span className="shrink-0 text-xs text-muted-foreground">查看</span>
          </button>
        ) : null}
      </div>

      <Dialog open={open} onOpenChange={changeOpen}>
        <DialogContent
          showCloseButton={false}
          overlayClassName="bg-black/20"
          className={[
            "max-w-full gap-0 overflow-hidden rounded-none p-0 motion-reduce:duration-0",
            "h-dvh max-h-dvh grid-rows-[auto_minmax(0,1fr)] sm:h-[min(50rem,calc(100dvh-2rem))] sm:max-w-[32rem] sm:rounded-xl",
          ].join(" ")}
        >
          <DialogTitle className="sr-only">Foodle Match</DialogTitle>
          <DialogDescription className="sr-only">
            从想吃候选中选择一家餐厅。
          </DialogDescription>
          <header
            data-testid="match-header"
            className="grid min-h-14 grid-cols-[2.75rem_minmax(0,1fr)_2.75rem] items-center bg-background px-3 pt-[max(0.25rem,env(safe-area-inset-top))] pb-1 sm:px-4 sm:pt-1"
          >
            <MatchCloseButton />
            {view?.kind === "comparison" &&
            view.session.candidateIds.length > 2 ? (
              <span className="text-center text-xs font-semibold tabular-nums text-muted-foreground">
                第 {view.session.challengerIndex} /{" "}
                {view.session.candidateIds.length - 1} 轮
              </span>
            ) : (
              <span aria-hidden="true" />
            )}
            <span aria-hidden="true" />
          </header>

          {view?.kind === "comparison" ? (
            <MatchComparisonView
              session={view.session}
              restaurantsById={restaurantsById}
              transitioningId={transitioningId}
              focusChoiceId={focusChoiceId}
              onChoose={choose}
              onDetails={openDetails}
              onChoiceFocused={clearChoiceFocus}
              photoIndexes={photoIndexes}
              onPhotoChange={changePhoto}
            />
          ) : view?.kind === "result" ? (
            <MatchResultView
              result={view.result}
              restaurantsById={restaurantsById}
              reopened={view.reopened}
              googleMapsRef={googleMapsRef}
              activeImageIndex={photoIndexes[view.result.restaurantId] ?? 0}
              onActiveImageChange={(index) =>
                changePhoto(view.result.restaurantId, index)
              }
              onReselect={() =>
                begin(view.result.candidateIds, view.result.sourceLabel)
              }
            />
          ) : null}

          <ReadOnlyDetails
            restaurant={detailRestaurant}
            open={detailRestaurant !== null}
            activeImageIndex={
              detailRestaurant ? (photoIndexes[detailRestaurant.id] ?? 0) : 0
            }
            onActiveImageChange={(index) => {
              if (detailRestaurant) changePhoto(detailRestaurant.id, index);
            }}
            onOpenChange={(nextOpen) => {
              if (!nextOpen) {
                setDetailRestaurant(null);
                const returnFocus = detailReturnFocusRef.current;
                detailReturnFocusRef.current = null;
                window.setTimeout(
                  () => returnFocus?.focus({ preventScroll: true }),
                  0,
                );
              }
            }}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
