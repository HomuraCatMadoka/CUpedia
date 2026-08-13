"use client";

import Link from "next/link";
import {
  BusFrontIcon,
  ChevronRightIcon,
  LocateFixedIcon,
  MapPinIcon,
  NavigationIcon,
  RefreshCwIcon,
  SearchIcon,
} from "lucide-react";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useCampusBusNearbyLocation } from "@/hooks/use-campus-bus-nearby-location";
import type { CampusBusPassengerRoute } from "@/lib/campus-transport/campus-bus";
import {
  buildCampusBusBoardingPlaces,
  findNearbyCampusBusBoardingPlaces,
  filterCampusBusBoardingPlaces,
  formatApproximateCampusBusDistance,
  getCampusBusBoardingPlaceRouteBoards,
  type BoardingPlaceRouteBoard,
  type CampusBusBoardingPlace,
} from "@/lib/campus-transport/boarding-places";

const NEARBY_BOARDING_PLACE_LIMIT = 3;
const NEARBY_RADIUS_METERS = 800;
const subscribeToLocationSupport = () => () => {};
const getServerLocationSupport = () => true;
const getBrowserLocationSupport = () => "geolocation" in navigator;

type CampusBusBoardingPlacePickerProps = {
  initialNow: number;
  routes: CampusBusPassengerRoute[];
};

function fallbackLabel(board: BoardingPlaceRouteBoard) {
  switch (board.board.serviceStatus) {
    case "before_service":
      return board.board.firstArrivalTime
        ? `首班預計 ${board.board.firstArrivalTime}`
        : "稍後開始服務";
    case "after_service":
      return "今日服務已結束";
    case "not_service_day":
      return "今日不服務";
    case "in_service":
      return board.board.skippedDepartureTimes.length > 0
        ? "部分班次不停此站"
        : "暫無下一班資料";
  }
}

function RouteBoard({ routeBoard }: { routeBoard: BoardingPlaceRouteBoard }) {
  const stopVisitLabel = routeBoard.repeatedStopIndex
    ? ` · 本線第 ${routeBoard.repeatedStopIndex}/${routeBoard.repeatedStopTotal} 次經過`
    : "";

  return (
    <Link
      href={`/campus-bus/${routeBoard.routeSlug}?stop=${encodeURIComponent(routeBoard.stopOccurrenceId)}`}
      className="group grid min-h-20 grid-cols-[3rem_1fr_auto] items-center gap-3 border-t py-3 text-left transition-colors hover:text-[#5b2a73] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#5b2a73]"
    >
      <span className="grid size-11 place-items-center rounded-xl bg-[#f1e8f5] font-bold text-[#5b2a73] dark:bg-[#2b2030] dark:text-[#e7c9f1]">
        {routeBoard.routeCode}
      </span>
      <span className="min-w-0">
        <strong className="block truncate text-sm text-foreground">
          {routeBoard.routeNameZhHant}
        </strong>
        <span className="mt-1 block text-xs text-muted-foreground">
          {routeBoard.routeSubtitle}
          {stopVisitLabel}
        </span>
        {routeBoard.patternIds.length === 0 ? (
          <span className="mt-1 block text-xs text-amber-700 dark:text-amber-300">
            此站的行車模式資料待核對
          </span>
        ) : null}
      </span>
      <span className="flex items-center gap-1 text-right">
        <span>
          {routeBoard.nextArrival ? (
            <>
              <strong className="block text-sm tabular-nums text-foreground">
                {routeBoard.nextArrival.waitMinutes === 0
                  ? "即將到站"
                  : `${routeBoard.nextArrival.waitMinutes} 分鐘`}
              </strong>
              <span className="block text-xs text-muted-foreground">
                {routeBoard.nextTimeKind === "origin_departure"
                  ? `${routeBoard.nextArrival.departureTime} 起點開出`
                  : `預計 ${routeBoard.nextArrival.arrivalTime}`}
              </span>
            </>
          ) : (
            <span className="block max-w-24 text-xs text-muted-foreground">
              {fallbackLabel(routeBoard)}
            </span>
          )}
        </span>
        <ChevronRightIcon
          className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
          aria-hidden="true"
        />
      </span>
    </Link>
  );
}

function BoardingPlaceCard({
  distanceLabel,
  now,
  place,
  routeLimit,
  routes,
}: {
  distanceLabel?: string;
  now: number;
  place: CampusBusBoardingPlace;
  routeLimit?: number;
  routes: CampusBusPassengerRoute[];
}) {
  const routeBoards = getCampusBusBoardingPlaceRouteBoards(place, routes, now);
  const visibleRouteBoards = routeLimit
    ? routeBoards.slice(0, routeLimit)
    : routeBoards;
  return (
    <article className="overflow-hidden rounded-xl bg-[#faf8fb] px-3 dark:bg-muted/25">
      <div className="flex items-start justify-between gap-3 py-4">
        <div>
          <h3 className="flex items-center gap-2 font-bold">
            <MapPinIcon
              className="size-4 text-[#5b2a73] dark:text-[#e7c9f1]"
              aria-hidden="true"
            />
            {place.nameZhHant}
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {place.coordinates
              ? `${new Set(routeBoards.map((board) => board.routeId)).size} 條路線 · ${routeBoards.length} 個方向或停靠次序`
              : "站點位置資料待核對；班次仍可查看"}
          </p>
        </div>
        {distanceLabel ? (
          <span className="shrink-0 text-xs font-semibold text-[#5b2a73] dark:text-[#e7c9f1]">
            {distanceLabel}
          </span>
        ) : null}
      </div>
      {routeBoards.length > 0 ? (
        <div>
          {visibleRouteBoards.map((routeBoard) => (
            <RouteBoard
              key={`${routeBoard.routeId}:${routeBoard.stopOccurrenceId}`}
              routeBoard={routeBoard}
            />
          ))}
          {visibleRouteBoards.length < routeBoards.length ? (
            <p className="border-t py-3 text-center text-xs text-muted-foreground">
              另有 {routeBoards.length - visibleRouteBoards.length}{" "}
              個方向或停靠次序；手動選擇可查看全部
            </p>
          ) : null}
        </div>
      ) : (
        <div className="border-t py-8 text-center text-sm text-muted-foreground">
          暫時找不到經過此地點的路線。
        </div>
      )}
    </article>
  );
}

export function CampusBusBoardingPlacePicker({
  initialNow,
  routes,
}: CampusBusBoardingPlacePickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedPlaceId, setSelectedPlaceId] = useState<string | null>(null);
  const [now, setNow] = useState(initialNow);
  const {
    cancelRequest,
    permissionHint,
    requestLocation,
    state: locationState,
  } = useCampusBusNearbyLocation();
  const places = useMemo(() => buildCampusBusBoardingPlaces(routes), [routes]);
  const results = useMemo(
    () => filterCampusBusBoardingPlaces(places, query),
    [places, query],
  );
  const selectedPlace =
    places.find((place) => place.id === selectedPlaceId) ?? null;
  const nearbyPlaces = useMemo(
    () =>
      locationState.status === "ready"
        ? findNearbyCampusBusBoardingPlaces(
            places,
            locationState.location,
            NEARBY_RADIUS_METERS,
          ).slice(0, NEARBY_BOARDING_PLACE_LIMIT)
        : [],
    [locationState, places],
  );

  useEffect(() => {
    const syncTimer = window.setTimeout(() => setNow(Date.now()), 0);
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => {
      window.clearTimeout(syncTimer);
      window.clearInterval(timer);
    };
  }, []);

  const locationSupported = useSyncExternalStore(
    subscribeToLocationSupport,
    getBrowserLocationSupport,
    getServerLocationSupport,
  );
  const visibleLocationStatus = locationSupported
    ? locationState.status
    : "unsupported";
  const locationHeading =
    visibleLocationStatus === "denied"
      ? "未允許使用位置"
      : visibleLocationStatus === "timeout" ||
          visibleLocationStatus === "unavailable"
        ? "暫時無法取得位置"
        : visibleLocationStatus === "requesting"
          ? "正在取得你的位置"
          : visibleLocationStatus === "unsupported"
            ? "此瀏覽器不支持定位"
            : "查看附近校巴站";

  function selectPlace(place: CampusBusBoardingPlace) {
    cancelRequest();
    setSelectedPlaceId(place.id);
    setOpen(false);
  }

  return (
    <section className="bg-background">
      {visibleLocationStatus === "ready" ? (
        <div className="flex items-center justify-between border-b px-5 py-3 text-xs text-muted-foreground sm:px-7">
          <span>按直線距離排序</span>
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="min-h-10 touch-manipulation font-semibold text-[#5b2a73] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5b2a73]/40 dark:text-[#e7c9f1]"
            >
              手動選站
            </button>
            <button
              type="button"
              onClick={requestLocation}
              className="flex min-h-10 touch-manipulation items-center gap-1.5 font-semibold text-[#5b2a73] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5b2a73]/40 dark:text-[#e7c9f1]"
            >
              <RefreshCwIcon className="size-3.5" aria-hidden="true" />
              重新定位
            </button>
          </div>
        </div>
      ) : visibleLocationStatus === "requesting" ? (
        <div
          className="px-5 py-8 sm:px-7"
          role="status"
          aria-live="polite"
          aria-atomic="true"
        >
          <div className="flex items-center gap-3">
            <span className="grid size-11 place-items-center rounded-xl bg-[#f1e8f5] text-[#5b2a73] dark:bg-[#2b2030] dark:text-[#e7c9f1]">
              <LocateFixedIcon
                className="size-5 animate-pulse motion-reduce:animate-none"
                aria-hidden="true"
              />
            </span>
            <div>
              <h2 className="font-bold">正在取得你的位置</h2>
              <p className="mt-0.5 text-sm text-muted-foreground">
                只用於這次附近車站查詢
              </p>
            </div>
          </div>
          <div className="mt-6 space-y-3" aria-hidden="true">
            <div className="h-20 animate-pulse rounded-xl bg-muted motion-reduce:animate-none" />
            <div className="h-20 animate-pulse rounded-xl bg-muted motion-reduce:animate-none" />
          </div>
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="mt-5 min-h-11 touch-manipulation text-sm font-semibold text-[#5b2a73] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5b2a73]/40 dark:text-[#e7c9f1]"
          >
            改為手動選站
          </button>
        </div>
      ) : visibleLocationStatus !== "idle" ? (
        <div
          className="px-5 py-8 sm:px-7"
          role="status"
          aria-live="polite"
          aria-atomic="true"
        >
          <div className="flex items-start gap-3">
            <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-[#f1e8f5] text-[#5b2a73] dark:bg-[#2b2030] dark:text-[#e7c9f1]">
              <MapPinIcon className="size-5" aria-hidden="true" />
            </span>
            <div>
              <h2 className="font-bold">{locationHeading}</h2>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                {visibleLocationStatus === "denied"
                  ? "你可以手動選站；如要查看附近車站，可在瀏覽器設定中重新允許定位。"
                  : visibleLocationStatus === "timeout"
                    ? "取得位置逾時。你可以再試一次，或直接手動選站。"
                    : visibleLocationStatus === "unavailable"
                      ? "你可以再試一次，或直接手動選站。"
                      : "請手動選擇乘車地點。"}
              </p>
            </div>
          </div>
          <div className="mt-5 flex flex-col gap-2 sm:flex-row">
            {visibleLocationStatus === "timeout" ||
            visibleLocationStatus === "unavailable" ? (
              <button
                type="button"
                onClick={requestLocation}
                className="min-h-11 rounded-xl bg-[#5b2a73] px-5 text-sm font-semibold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5b2a73]/40"
              >
                重試定位
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="min-h-11 rounded-xl border border-[#5b2a73] px-5 text-sm font-semibold text-[#5b2a73] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5b2a73]/40 dark:border-[#d8b9e4] dark:text-[#e7c9f1]"
            >
              手動選擇
            </button>
          </div>
        </div>
      ) : (
        <div className="px-5 py-10 text-center sm:px-7">
          <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-[#f1e8f5] text-[#5b2a73] dark:bg-[#2b2030] dark:text-[#e7c9f1]">
            <NavigationIcon className="size-6" aria-hidden="true" />
          </span>
          <h2 className="mt-4 text-lg font-bold">{locationHeading}</h2>
          <div
            className="mx-auto mt-2 max-w-sm text-sm leading-6 text-muted-foreground"
            aria-live="polite"
          >
            <p>
              {permissionHint === "denied"
                ? "瀏覽器目前不允許使用位置；你仍可手動選擇乘車地點。"
                : "定位只用於這次查找附近車站，不會持續追蹤或保存你的位置。"}
            </p>
          </div>
          <div className="mt-5 flex flex-col justify-center gap-2 sm:flex-row">
            <button
              type="button"
              onClick={requestLocation}
              className="inline-flex min-h-11 shrink-0 touch-manipulation items-center justify-center gap-2 rounded-xl bg-[#5b2a73] px-5 text-sm font-semibold text-white transition-colors hover:bg-[#4b1f60] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5b2a73]/40"
            >
              <NavigationIcon className="size-4" aria-hidden="true" />
              使用我的位置
            </button>
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="min-h-11 shrink-0 touch-manipulation rounded-xl border border-[#5b2a73] px-5 text-sm font-semibold text-[#5b2a73] transition-colors hover:bg-[#f3edf6] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5b2a73]/40 dark:border-[#d8b9e4] dark:text-[#e7c9f1] dark:hover:bg-[#2b2030]"
            >
              {selectedPlace ? "更改乘車地點" : "手動選擇"}
            </button>
          </div>
        </div>
      )}

      {visibleLocationStatus === "ready" && nearbyPlaces.length === 0 ? (
        <div
          className="px-5 py-10 text-center text-sm text-muted-foreground sm:px-7"
          aria-live="polite"
        >
          <p>附近 800 米內找不到乘車地點，請手動選擇。</p>
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="mt-5 min-h-11 rounded-xl border border-[#5b2a73] px-5 font-semibold text-[#5b2a73] dark:border-[#d8b9e4] dark:text-[#e7c9f1]"
          >
            手動選擇
          </button>
        </div>
      ) : null}

      {visibleLocationStatus === "ready" && nearbyPlaces.length > 0 ? (
        <div className="divide-y">
          {nearbyPlaces.map(({ distanceMeters, place }) => (
            <div key={place.id} className="px-5 py-5 sm:px-7">
              <BoardingPlaceCard
                distanceLabel={formatApproximateCampusBusDistance(
                  distanceMeters,
                )}
                now={now}
                place={place}
                routeLimit={3}
                routes={routes}
              />
            </div>
          ))}
        </div>
      ) : null}

      {selectedPlace ? (
        <div className="px-5 pb-5 sm:px-7">
          <p className="mb-2 text-sm font-semibold text-[#5b2a73] dark:text-[#e7c9f1]">
            手動選擇
          </p>
          <BoardingPlaceCard now={now} place={selectedPlace} routes={routes} />
        </div>
      ) : null}

      <Dialog
        open={open}
        onOpenChange={(nextOpen) => {
          setOpen(nextOpen);
          if (!nextOpen) setQuery("");
        }}
      >
        <DialogContent className="max-h-[min(38rem,calc(100dvh-2rem))] overflow-hidden p-0 sm:max-w-md">
          <DialogHeader className="px-5 pt-5">
            <DialogTitle>選擇乘車地點</DialogTitle>
            <DialogDescription>
              按車站名稱搜尋，整個過程不會要求使用位置。
            </DialogDescription>
          </DialogHeader>
          <div className="px-5">
            <label htmlFor="boarding-place-search" className="sr-only">
              搜尋乘車地點
            </label>
            <div className="flex items-center gap-2 rounded-xl border px-3 focus-within:ring-2 focus-within:ring-[#5b2a73]">
              <SearchIcon
                className="size-4 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                id="boarding-place-search"
                autoComplete="off"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="例如大學站、University Station…"
                className="border-0 px-0 shadow-none focus-visible:ring-0"
              />
            </div>
          </div>
          <div className="max-h-80 overflow-y-auto overscroll-contain border-t">
            {results.length > 0 ? (
              results.map((place) => (
                <button
                  key={place.id}
                  type="button"
                  onClick={() => selectPlace(place)}
                  className="flex min-h-16 w-full items-center justify-between gap-4 border-b px-5 text-left transition-colors hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#5b2a73]"
                >
                  <span className="min-w-0">
                    <strong className="block text-sm">
                      {place.nameZhHant}
                    </strong>
                    <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                      {place.nameEn}
                    </span>
                  </span>
                  <span className="shrink-0 text-xs font-semibold text-[#5b2a73] dark:text-[#e7c9f1]">
                    {
                      new Set(
                        place.stopOccurrences.map(
                          (occurrence) => occurrence.routeId,
                        ),
                      ).size
                    }{" "}
                    條路線
                  </span>
                </button>
              ))
            ) : (
              <div className="px-5 py-8 text-center">
                <BusFrontIcon
                  className="mx-auto size-6 text-muted-foreground"
                  aria-hidden="true"
                />
                <p className="mt-3 text-sm text-muted-foreground">
                  找不到相符乘車地點，請嘗試其他名稱。
                </p>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}
