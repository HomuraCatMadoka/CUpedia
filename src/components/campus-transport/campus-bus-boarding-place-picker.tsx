"use client";

import Link from "next/link";
import {
  BusFrontIcon,
  ChevronRightIcon,
  MapPinIcon,
  SearchIcon,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { CampusBusPassengerRoute } from "@/lib/campus-transport/campus-bus";
import {
  buildCampusBusBoardingPlaces,
  filterCampusBusBoardingPlaces,
  getCampusBusBoardingPlaceRouteBoards,
  type BoardingPlaceRouteBoard,
  type CampusBusBoardingPlace,
} from "@/lib/campus-transport/boarding-places";

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

export function CampusBusBoardingPlacePicker({
  initialNow,
  routes,
}: CampusBusBoardingPlacePickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedPlaceId, setSelectedPlaceId] = useState<string | null>(null);
  const [now, setNow] = useState(initialNow);
  const places = useMemo(() => buildCampusBusBoardingPlaces(routes), [routes]);
  const results = useMemo(
    () => filterCampusBusBoardingPlaces(places, query),
    [places, query],
  );
  const selectedPlace =
    places.find((place) => place.id === selectedPlaceId) ?? null;
  const routeBoards = selectedPlace
    ? getCampusBusBoardingPlaceRouteBoards(selectedPlace, routes, now)
    : [];

  useEffect(() => {
    const syncTimer = window.setTimeout(() => setNow(Date.now()), 0);
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => {
      window.clearTimeout(syncTimer);
      window.clearInterval(timer);
    };
  }, []);

  function selectPlace(place: CampusBusBoardingPlace) {
    setSelectedPlaceId(place.id);
    setOpen(false);
  }

  return (
    <section className="border-b bg-background px-5 py-5 sm:px-7">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-bold">手動選擇乘車地點</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            不使用定位，也可以查看指定地點的下一班。
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="min-h-11 shrink-0 touch-manipulation rounded-xl border border-[#5b2a73] px-5 text-sm font-semibold text-[#5b2a73] transition-colors hover:bg-[#f3edf6] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5b2a73]/40 dark:border-[#d8b9e4] dark:text-[#e7c9f1] dark:hover:bg-[#2b2030]"
        >
          {selectedPlace ? "更改乘車地點" : "選擇乘車地點"}
        </button>
      </div>

      {selectedPlace ? (
        <div className="mt-5 overflow-hidden rounded-2xl border bg-[#faf8fb] px-4 dark:bg-muted/25">
          <div className="flex items-start justify-between gap-3 py-4">
            <div>
              <h3 className="flex items-center gap-2 font-bold">
                <MapPinIcon
                  className="size-4 text-[#5b2a73] dark:text-[#e7c9f1]"
                  aria-hidden="true"
                />
                {selectedPlace.nameZhHant}
              </h3>
              <p className="mt-1 text-xs text-muted-foreground">
                {selectedPlace.coordinates
                  ? `${new Set(routeBoards.map((board) => board.routeId)).size} 條路線 · ${routeBoards.length} 個方向或停靠次序`
                  : "站點位置資料待核對；班次仍可查看"}
              </p>
            </div>
          </div>
          {routeBoards.length > 0 ? (
            <div>
              {routeBoards.map((routeBoard) => (
                <RouteBoard
                  key={`${routeBoard.routeId}:${routeBoard.stopOccurrenceId}`}
                  routeBoard={routeBoard}
                />
              ))}
            </div>
          ) : (
            <div className="border-t py-8 text-center text-sm text-muted-foreground">
              暫時找不到經過此地點的路線。
            </div>
          )}
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
