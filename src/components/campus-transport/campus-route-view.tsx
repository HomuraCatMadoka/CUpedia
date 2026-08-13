"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeftIcon,
  LoaderCircleIcon,
  MinusIcon,
  PlusIcon,
  RouteIcon,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
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
  computeBusPositions,
  type BusPosition,
} from "@/lib/campus-transport/bus-positions";
import { BUS_DWELL_MILLISECONDS } from "@/lib/campus-transport/bus-kinematics";
import {
  type CampusBusPassengerRoute,
  type CampusBusStop,
  type CampusBusStopBoard,
  formatHongKongTime,
  getCampusBusServiceHoursLabel,
  getCampusBusStopBoard,
  type LngLat,
} from "@/lib/campus-transport/campus-bus";
import { cn } from "@/lib/utils";

const CampusRouteMap = dynamic(
  () => import("./campus-route-map").then((module) => module.CampusRouteMap),
  {
    ssr: false,
    loading: () => (
      <div
        className="h-[14.5rem] animate-pulse bg-muted motion-reduce:animate-none md:h-[23rem]"
        role="status"
        aria-label="正在載入地圖"
      />
    ),
  },
);

const NEARBY_THRESHOLD_METERS = 220;
const NEARBY_PAIR_TOLERANCE_METERS = 100;

function getStatusText(
  board: CampusBusStopBoard,
  route: CampusBusPassengerRoute,
) {
  switch (board.serviceStatus) {
    case "not_service_day":
      return `今日不提供 ${route.code} 線服務`;
    case "before_service":
      return board.firstArrivalTime
        ? `今日 ${board.firstArrivalTime} 開始`
        : "今日預計時間暫缺";
    case "after_service":
      return "今日服務已結束";
    default:
      return "暫無預計班次";
  }
}

function distanceInMeters(from: LngLat, to: LngLat) {
  const earthRadiusMeters = 6_371_000;
  const latitude1 = (from[1] * Math.PI) / 180;
  const latitude2 = (to[1] * Math.PI) / 180;
  const deltaLatitude = ((to[1] - from[1]) * Math.PI) / 180;
  const deltaLongitude = ((to[0] - from[0]) * Math.PI) / 180;
  const haversine =
    Math.sin(deltaLatitude / 2) ** 2 +
    Math.cos(latitude1) *
      Math.cos(latitude2) *
      Math.sin(deltaLongitude / 2) ** 2;
  return 2 * earthRadiusMeters * Math.asin(Math.sqrt(haversine));
}

function stopsNearestTo(coordinates: LngLat, route: CampusBusPassengerRoute) {
  return route.stops
    .reduce<Array<{ distance: number; stop: CampusBusStop }>>(
      (nearby, stop) => {
        const stopCoordinates = route.map.stopCoordinates[stop.id];
        if (!stopCoordinates) return nearby;
        const distance = distanceInMeters(coordinates, stopCoordinates);
        nearby.push({ distance, stop });
        return nearby;
      },
      [],
    )
    .sort((left, right) => left.distance - right.distance);
}

function ArrivalBoard({
  board,
  route,
}: {
  board: CampusBusStopBoard;
  route: CampusBusPassengerRoute;
}) {
  if (!board.upcomingArrivals.length && !board.dockingArrival) {
    return (
      <p className="px-4 py-5 text-sm text-muted-foreground sm:px-6">
        {getStatusText(board, route)}
      </p>
    );
  }

  const rows = board.dockingArrival
    ? [board.dockingArrival, ...board.upcomingArrivals]
    : board.upcomingArrivals;
  const firstArrival = rows[0]!;
  const liveText = board.dockingArrival
    ? "下一班現正停靠本站"
    : firstArrival.waitMinutes <= 1
      ? "下一班即將到達"
      : `下一班預計 ${firstArrival.waitMinutes} 分鐘後到站`;

  return (
    <>
      <p className="sr-only" aria-live="polite">
        {liveText}
      </p>
      <div className="divide-y divide-border/80">
        {rows.map((arrival, index) => {
          const docking = index === 0 && board.dockingArrival !== null;
          const arrivingSoon = !docking && arrival.waitMinutes <= 1;
          return (
            <div
              key={`${arrival.departureAt}-${arrival.patternId}`}
              className={cn(
                "grid grid-cols-[4.75rem_1fr_auto] items-baseline gap-2 px-4 sm:grid-cols-[6rem_1fr_auto] sm:px-6",
                index === 0 ? "bg-muted/25 py-3" : "py-2.5",
              )}
            >
              <span className="text-sm font-semibold text-muted-foreground">
                {index === 0 ? "下一班" : `第 ${index + 1} 班`}
              </span>
              {docking || arrivingSoon ? (
                <strong
                  className={cn(
                    "tracking-tight text-[#4b1f60] dark:text-[#e7c9f1]",
                    index === 0 ? "text-2xl sm:text-[1.7rem]" : "text-xl",
                  )}
                >
                  {docking ? "停靠" : "即將到達"}
                </strong>
              ) : (
                <strong
                  className={cn(
                    "tracking-tight text-[#4b1f60] tabular-nums dark:text-[#e7c9f1]",
                    index === 0 ? "text-2xl sm:text-[1.7rem]" : "text-xl",
                  )}
                >
                  {arrival.waitMinutes}
                  <small className="ml-1 text-sm font-semibold">分鐘</small>
                </strong>
              )}
              <time
                dateTime={new Date(arrival.arrivalAt).toISOString()}
                className="text-sm text-muted-foreground tabular-nums"
              >
                {docking
                  ? `開出 ${formatHongKongTime(
                      arrival.arrivalAt + BUS_DWELL_MILLISECONDS,
                    )}`
                  : `預計 ${arrival.arrivalTime}`}
              </time>
            </div>
          );
        })}
      </div>
      {board.skippedDepartureTimes.length > 0 && (
        <p className="border-t border-border/80 px-4 py-3 text-sm text-muted-foreground sm:px-6">
          另有 {board.skippedDepartureTimes.join("、")} 起點班次不停靠本站
        </p>
      )}
    </>
  );
}

function FeedbackDialog({
  now,
  onOpenChange,
  open,
  route,
  stop,
}: {
  now: number;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  route: CampusBusPassengerRoute;
  stop: CampusBusStop;
}) {
  const [minuteOffset, setMinuteOffset] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  const selectedTime = now + minuteOffset * 60_000;

  async function submitFeedback(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    try {
      const response = await fetch("/api/campus-bus/arrival-observations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          observedArrivalAt: new Date(selectedTime).toISOString(),
          routeId: route.routeId,
          stopOccurrenceId: stop.id,
        }),
      });
      if (!response.ok) {
        const error = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        if (response.status === 429 || error?.error === "RATE_LIMIT_EXCEEDED") {
          throw new Error("RATE_LIMIT_EXCEEDED");
        }
        throw new Error("arrival observation rejected");
      }

      onOpenChange(false);
      toast.success("謝謝，你的到站時間已提交。");
    } catch (error) {
      toast.error(
        error instanceof Error && error.message === "RATE_LIMIT_EXCEEDED"
          ? "提交太頻密，請稍後再試。"
          : "提交失敗，請稍後再試。",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-5 p-5 sm:max-w-md sm:p-6">
        <DialogHeader className="pr-8">
          <DialogTitle className="text-xl font-bold">提交到站時間</DialogTitle>
          <DialogDescription>
            匿名提交，只用於改善預計到站時間。
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submitFeedback} className="space-y-5">
          <dl className="grid grid-cols-[5rem_1fr] gap-x-4 gap-y-3 text-base">
            <dt className="text-muted-foreground">路線</dt>
            <dd className="font-semibold">{route.routeNameZhHant}</dd>
            <dt className="text-muted-foreground">站點</dt>
            <dd className="font-semibold">{stop.nameZhHant}</dd>
          </dl>

          <div className="rounded-xl border bg-muted/25 p-4">
            <span className="text-sm font-medium text-muted-foreground">
              到站時間
            </span>
            <div className="mt-2 flex items-center justify-between gap-4">
              <time
                dateTime={new Date(selectedTime).toISOString()}
                className="text-4xl font-bold tracking-tight text-[#4b1f60] tabular-nums dark:text-[#e7c9f1]"
              >
                {formatHongKongTime(selectedTime)}
              </time>
              <div className="flex overflow-hidden rounded-lg border bg-background">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-lg"
                  className="size-11 rounded-none border-r"
                  onClick={() => setMinuteOffset((offset) => offset - 1)}
                  disabled={minuteOffset <= -10}
                  aria-label="到站時間減一分鐘"
                >
                  <MinusIcon />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-lg"
                  className="size-11 rounded-none"
                  onClick={() => setMinuteOffset((offset) => offset + 1)}
                  disabled={minuteOffset >= 2}
                  aria-label="到站時間加一分鐘"
                >
                  <PlusIcon />
                </Button>
              </div>
            </div>
            <span className="mt-1 block text-sm text-muted-foreground">
              {minuteOffset === 0
                ? "現在"
                : minuteOffset < 0
                  ? `${Math.abs(minuteOffset)} 分鐘前`
                  : `${minuteOffset} 分鐘後`}
            </span>
          </div>

          <DialogFooter className="-mx-5 -mb-5 px-5 sm:-mx-6 sm:-mb-6 sm:px-6">
            <DialogClose render={<Button type="button" variant="outline" />}>
              取消
            </DialogClose>
            <Button
              type="submit"
              disabled={submitting}
              className="h-10 bg-[#5b2a73] px-6 text-white hover:bg-[#4b1f60]"
            >
              {submitting && (
                <LoaderCircleIcon
                  className="animate-spin motion-reduce:animate-none"
                  aria-hidden="true"
                />
              )}
              {submitting ? "提交中…" : "提交"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function CampusRouteView({
  initialNow,
  route,
}: {
  initialNow: number;
  route: CampusBusPassengerRoute;
}) {
  const initialStopId = route.stops.some(
    (stop) => stop.id === route.defaultStopId,
  )
    ? route.defaultStopId
    : route.stops[0]?.id;
  const [selectedStopId, setSelectedStopId] = useState(initialStopId);
  const [nearbyStopId, setNearbyStopId] = useState<string | null>(null);
  const [nearbyCandidateIds, setNearbyCandidateIds] = useState<string[]>([]);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [now, setNow] = useState(initialNow);
  const journeyScrollRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const prefersReducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const interval = window.setInterval(
      () => setNow(Date.now()),
      prefersReducedMotion ? 30_000 : 1_000,
    );
    return () => window.clearInterval(interval);
  }, []);

  const busPositions: BusPosition[] = useMemo(
    () => computeBusPositions(route, now),
    [now, route],
  );

  const boards = useMemo(
    () =>
      new Map(
        route.stops.map((stop) => [
          stop.id,
          getCampusBusStopBoard(route, stop.id, now),
        ]),
      ),
    [now, route],
  );
  const serviceHoursLabel = getCampusBusServiceHoursLabel(route, now);

  const selectedStop =
    route.stops.find((stop) => stop.id === selectedStopId) ?? route.stops[0];
  const selectedIndex = route.stops.findIndex(
    (stop) => stop.id === selectedStop?.id,
  );
  const nextStop = route.stops[(selectedIndex + 1) % route.stops.length];

  const revealStopInJourney = useCallback(
    (stopId: string, behavior: ScrollBehavior = "smooth") => {
      window.requestAnimationFrame(() => {
        const scroller = journeyScrollRef.current;
        const row = document.getElementById(`campus-route-stop-${stopId}`);
        if (!scroller || !row) return;

        if (scroller.scrollHeight <= scroller.clientHeight) {
          row.scrollIntoView({ behavior, block: "center" });
          return;
        }

        const heading = document.getElementById("campus-route-stops-heading");
        const rowTop =
          row.getBoundingClientRect().top -
          scroller.getBoundingClientRect().top +
          scroller.scrollTop;
        scroller.scrollTo({
          behavior,
          top: Math.max(0, rowTop - (heading?.offsetHeight ?? 0)),
        });
      });
    },
    [],
  );

  const selectStop = useCallback(
    (stopId: string, behavior?: ScrollBehavior) => {
      setSelectedStopId(stopId);
      revealStopInJourney(
        stopId,
        window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "auto"
          : behavior,
      );
    },
    [revealStopInJourney],
  );

  useEffect(() => {
    if (!initialStopId) return;
    revealStopInJourney(initialStopId, "auto");
  }, [initialStopId, revealStopInJourney]);

  const selectStopFromMap = useCallback(
    (stopId: string) => selectStop(stopId),
    [selectStop],
  );

  const confirmNearbyStop = useCallback(
    (stopId: string) => {
      setNearbyStopId(stopId);
      setNearbyCandidateIds([]);
      selectStop(stopId);
    },
    [selectStop],
  );

  const handleUserLocated = useCallback(
    (coordinates: LngLat) => {
      const nearby = stopsNearestTo(coordinates, route);
      const nearest = nearby[0];
      if (!nearest || nearest.distance > NEARBY_THRESHOLD_METERS) {
        setNearbyStopId(null);
        setNearbyCandidateIds([]);
        toast.info(`你目前不在 ${route.code} 線站點附近`);
        return;
      }

      const candidates = nearby
        .filter(
          ({ distance }) =>
            distance <=
            Math.min(
              NEARBY_THRESHOLD_METERS,
              nearest.distance + NEARBY_PAIR_TOLERANCE_METERS,
            ),
        )
        .slice(0, 2);

      if (candidates.length > 1) {
        setNearbyStopId(null);
        setNearbyCandidateIds(candidates.map(({ stop }) => stop.id));
        return;
      }

      confirmNearbyStop(nearest.stop.id);
    },
    [confirmNearbyStop, route],
  );

  if (!selectedStop || !nextStop) return null;

  return (
    <div className="min-h-full w-full bg-[#f5f3f7] px-0 py-0 sm:px-4 sm:py-6 dark:bg-background">
      <article className="mx-auto min-h-full max-w-4xl overflow-hidden bg-background shadow-sm ring-1 ring-black/5 sm:min-h-0 sm:rounded-2xl">
        <header className="relative flex min-h-24 items-center justify-center bg-[#5b2a73] px-16 py-4 text-center text-white">
          <Link
            href="/campus-bus"
            className="absolute left-4 grid size-11 touch-manipulation place-items-center rounded-lg transition-colors hover:bg-white/12 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-white/45"
            aria-label="返回校巴首頁"
          >
            <ArrowLeftIcon className="size-6" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              {route.routeNameZhHant}
            </h1>
            <p className="mt-0.5 text-sm text-white/80">
              {route.subtitle} ·{" "}
              {nextStop.partialService
                ? `部分班次經${nextStop.nameZhHant}`
                : `下一站 ${nextStop.nameZhHant}`}
            </p>
          </div>
        </header>

        <div className="flex items-center justify-between gap-3 border-b px-4 py-3 text-sm sm:px-6">
          <strong>
            {serviceHoursLabel ? `今日 ${serviceHoursLabel}` : "今日不服務"}
          </strong>
          <span className="text-muted-foreground">{route.frequencyLabel}</span>
        </div>
        <div className="flex items-center gap-2 border-b bg-[#fbf9fc] px-4 py-2 text-xs text-muted-foreground sm:px-6">
          <RouteIcon className="size-4 text-[#6f3b86]" aria-hidden="true" />
          <span>測試預計 · 非實時車輛位置（地圖車輛為推算）</span>
        </div>

        <CampusRouteMap
          busPositions={busPositions}
          route={route}
          stops={route.stops}
          selectedStopId={selectedStop.id}
          onSelectStop={selectStopFromMap}
          onUserLocated={handleUserLocated}
        />

        {nearbyCandidateIds.length > 1 && (
          <aside
            className="border-b bg-[#fbf9fc] px-4 py-3 dark:bg-[#241b28] sm:px-6"
            aria-labelledby="nearby-stop-choice-heading"
          >
            <p
              id="nearby-stop-choice-heading"
              className="text-sm font-semibold"
            >
              附近有兩個候車站，請選擇所在一側
            </p>
            <div className="mt-2 flex gap-2" role="group">
              {nearbyCandidateIds.map((stopId) => {
                const candidate = route.stops.find(
                  (stop) => stop.id === stopId,
                );
                if (!candidate) return null;
                return (
                  <Button
                    key={candidate.id}
                    type="button"
                    variant="outline"
                    className="min-h-11 flex-1 touch-manipulation border-[#b58ac6] bg-background px-3 text-[#4b1f60] hover:bg-[#f2eaf5] dark:text-[#e7c9f1]"
                    onClick={() => confirmNearbyStop(candidate.id)}
                  >
                    {candidate.nameZhHant}
                  </Button>
                );
              })}
            </div>
          </aside>
        )}

        <section
          ref={journeyScrollRef}
          className="relative h-[clamp(16rem,calc(100dvh-32rem),35rem)] overflow-y-auto overscroll-contain [scrollbar-gutter:stable] sm:h-auto sm:overflow-visible"
          aria-labelledby="campus-route-stops-heading"
        >
          <h2
            id="campus-route-stops-heading"
            className="sticky top-0 z-20 border-b bg-background px-4 py-3 text-base font-bold sm:static sm:px-6 sm:py-4 sm:text-lg"
          >
            沿途站點
          </h2>
          <ol>
            {route.stops.map((stop, index) => {
              const selected = stop.id === selectedStop.id;
              const board = boards.get(stop.id);
              return (
                <li
                  key={stop.id}
                  id={`campus-route-stop-${stop.id}`}
                  className={cn(
                    "relative pl-8 sm:pl-11",
                    selected && "bg-[#fbf9fc] dark:bg-[#241b28]",
                  )}
                >
                  <span
                    aria-hidden="true"
                    className={cn(
                      "absolute top-0 bottom-0 left-[1.2rem] w-0.5 bg-[#b58ac6] sm:left-[1.7rem]",
                      index === 0 && "top-8",
                      index === route.stops.length - 1 && "bottom-auto h-8",
                    )}
                  />
                  <span
                    aria-hidden="true"
                    className={cn(
                      "absolute top-[1.65rem] left-[0.8rem] z-10 size-3.5 rounded-full border-2 border-[#a879ba] bg-background sm:left-[1.3rem]",
                      selected &&
                        "top-[1.45rem] left-[0.55rem] size-6 border-[5px] border-[#5b2a73] bg-white shadow-[0_0_0_4px_rgba(111,59,134,0.12)] sm:left-[1.05rem]",
                    )}
                  />
                  <div className="border-b">
                    <button
                      type="button"
                      onClick={() => selectStop(stop.id)}
                      className="flex min-h-16 w-full touch-manipulation items-center justify-between gap-3 px-3 py-2.5 text-left focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-inset focus-visible:ring-[#6f3b86]/30 sm:px-5"
                      aria-expanded={selected}
                      aria-controls={
                        selected ? `campus-route-board-${stop.id}` : undefined
                      }
                    >
                      <span className="min-w-0">
                        <strong className="block text-lg font-bold">
                          {stop.sequence}. {stop.nameZhHant}
                        </strong>
                        <span className="mt-0.5 block truncate text-sm text-muted-foreground">
                          {stop.nameEn}
                        </span>
                      </span>
                      <span className="flex shrink-0 items-center gap-2">
                        {stop.partialService && (
                          <span className="text-xs font-medium text-muted-foreground">
                            部分班次
                          </span>
                        )}
                        {stop.id === nearbyStopId && (
                          <span className="rounded-full bg-[#f2eaf5] px-2.5 py-1 text-xs font-semibold text-[#5b2a73] dark:bg-[#382541] dark:text-[#d8b9e4]">
                            你在附近
                          </span>
                        )}
                      </span>
                    </button>

                    {selected && board && (
                      <div id={`campus-route-board-${stop.id}`}>
                        <ArrivalBoard board={board} route={route} />
                        <div className="flex justify-end border-t px-4 py-4 sm:px-6">
                          <button
                            type="button"
                            onClick={() => setFeedbackOpen(true)}
                            className="min-h-11 touch-manipulation px-1 text-sm font-semibold text-[#5b2a73] underline-offset-4 hover:underline focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-[#6f3b86]/30 dark:text-[#d8b9e4]"
                          >
                            預測不準？提交實時到站時間改進預測
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        </section>
      </article>

      {feedbackOpen && (
        <FeedbackDialog
          now={now}
          route={route}
          stop={selectedStop}
          open={feedbackOpen}
          onOpenChange={setFeedbackOpen}
        />
      )}
    </div>
  );
}
