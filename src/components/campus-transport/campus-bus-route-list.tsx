"use client";

import Link from "next/link";
import { BusFrontIcon, ChevronRightIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import {
  getCampusBusServiceHoursLabel,
  getCampusBusStopBoard,
  type CampusBusPassengerRoute,
} from "@/lib/campus-transport/campus-bus";

type RouteListMode = "available" | "all";

type CampusBusRouteListProps = {
  initialNow: number;
  routes: CampusBusPassengerRoute[];
};

function routeStatus(route: CampusBusPassengerRoute, now: number) {
  const statuses = route.stops.map(
    (stop) => getCampusBusStopBoard(route, stop.id, now).serviceStatus,
  );
  if (statuses.some((status) => status === "in_service")) return "in_service";
  if (statuses.some((status) => status === "before_service")) {
    return "before_service";
  }
  if (statuses.some((status) => status === "after_service")) {
    return "after_service";
  }
  return "not_service_day";
}

function statusLabel(route: CampusBusPassengerRoute, now: number) {
  const status = routeStatus(route, now);
  switch (status) {
    case "in_service":
      return "服務中";
    case "before_service":
      return getCampusBusServiceHoursLabel(route, now)
        ? `今日 ${getCampusBusServiceHoursLabel(route, now)!.split("-")[0]} 開始`
        : "稍後開始";
    case "after_service":
      return "今日服務已結束";
    case "not_service_day":
      return "今日不服務";
  }
}

export function CampusBusRouteList({
  initialNow,
  routes,
}: CampusBusRouteListProps) {
  const [mode, setMode] = useState<RouteListMode>("available");
  const [now, setNow] = useState(initialNow);

  useEffect(() => {
    const syncTimer = window.setTimeout(() => setNow(Date.now()), 0);
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => {
      window.clearTimeout(syncTimer);
      window.clearInterval(timer);
    };
  }, []);

  const availableRoutes = useMemo(
    () => routes.filter((route) => routeStatus(route, now) === "in_service"),
    [now, routes],
  );
  const visibleRoutes = mode === "available" ? availableRoutes : routes;

  return (
    <>
      <div
        className="grid grid-cols-2 border-b bg-background"
        role="tablist"
        aria-label="校巴路線範圍"
      >
        <button
          type="button"
          role="tab"
          aria-selected={mode === "available"}
          onClick={() => setMode("available")}
          className="relative min-h-13 touch-manipulation px-4 py-3 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground aria-selected:text-[#5b2a73] aria-selected:after:absolute aria-selected:after:inset-x-5 aria-selected:after:bottom-0 aria-selected:after:h-0.5 aria-selected:after:bg-[#5b2a73] dark:aria-selected:text-[#e7c9f1] dark:aria-selected:after:bg-[#d8b9e4]"
        >
          <span>現在可乘</span>
          <span
            className="ml-1.5 tabular-nums text-xs font-medium"
            aria-hidden="true"
          >
            {availableRoutes.length}
          </span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === "all"}
          onClick={() => setMode("all")}
          className="relative min-h-13 touch-manipulation px-4 py-3 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground aria-selected:text-[#5b2a73] aria-selected:after:absolute aria-selected:after:inset-x-5 aria-selected:after:bottom-0 aria-selected:after:h-0.5 aria-selected:after:bg-[#5b2a73] dark:aria-selected:text-[#e7c9f1] dark:aria-selected:after:bg-[#d8b9e4]"
        >
          <span>全部路線</span>
          <span
            className="ml-1.5 tabular-nums text-xs font-medium"
            aria-hidden="true"
          >
            {routes.length}
          </span>
        </button>
      </div>

      <div role="tabpanel">
        {visibleRoutes.length > 0 ? (
          <ul className="divide-y">
            {visibleRoutes.map((route) => {
              const status = statusLabel(route, now);
              const isRunning = status === "服務中";
              return (
                <li key={route.routeId}>
                  <Link
                    href={`/campus-bus/${route.slug}`}
                    className="group flex min-h-24 touch-manipulation items-center gap-4 px-5 py-4 transition-colors hover:bg-muted/45 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-inset focus-visible:ring-[#6f3b86]/30 sm:px-7"
                  >
                    <span className="grid size-14 shrink-0 place-items-center rounded-xl border-2 border-[#5b2a73] text-xl font-bold text-[#5b2a73] dark:border-[#d8b9e4] dark:text-[#e7c9f1]">
                      {route.code}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex min-w-0 items-center justify-between gap-3">
                        <strong className="truncate text-lg font-bold">
                          {route.routeNameZhHant}
                        </strong>
                        <span
                          className={
                            isRunning
                              ? "shrink-0 text-xs font-semibold text-[#5b2a73] dark:text-[#e7c9f1]"
                              : "shrink-0 text-xs text-muted-foreground"
                          }
                        >
                          {status}
                        </span>
                      </span>
                      <span className="mt-0.5 block truncate text-sm text-muted-foreground">
                        {route.subtitle}
                      </span>
                      <span className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        <span>{route.serviceHoursLabel}</span>
                        <span>{route.frequencyLabel}</span>
                      </span>
                    </span>
                    <ChevronRightIcon
                      className="size-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
                      aria-hidden="true"
                    />
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="flex min-h-64 flex-col items-center justify-center px-6 py-12 text-center">
            <span className="grid size-12 place-items-center rounded-full bg-[#f3edf6] text-[#5b2a73] dark:bg-[#2b2030] dark:text-[#e7c9f1]">
              <BusFrontIcon className="size-6" aria-hidden="true" />
            </span>
            <h2 className="mt-4 text-lg font-bold">目前沒有行駛中的校巴</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              可查看今日班次與其他路線。
            </p>
            <button
              type="button"
              onClick={() => setMode("all")}
              className="mt-5 min-h-11 touch-manipulation rounded-lg border border-[#5b2a73] px-5 text-sm font-semibold text-[#5b2a73] transition-colors hover:bg-[#f3edf6] active:scale-[0.98] dark:border-[#d8b9e4] dark:text-[#e7c9f1] dark:hover:bg-[#2b2030]"
            >
              查看全部路線
            </button>
          </div>
        )}
      </div>
    </>
  );
}
