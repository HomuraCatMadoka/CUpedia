"use client";

import Link from "next/link";
import { ChevronRightIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import type { CampusBusPassengerRoute } from "@/lib/campus-transport/campus-bus";
import {
  getCampusBusRouteCatalog,
  getCampusBusRouteDisplayName,
  type CampusBusCatalogItem,
} from "@/lib/campus-transport/campus-bus-catalog";

type CampusBusRouteListProps = {
  initialNow: number;
  routes: CampusBusPassengerRoute[];
};

function RouteRow({
  active,
  item,
}: {
  active: boolean;
  item: CampusBusCatalogItem;
}) {
  const { route } = item;

  return (
    <li>
      <Link
        href={`/campus-bus/${route.slug}`}
        prefetch={false}
        className="group grid min-h-20 touch-manipulation grid-cols-[2.75rem_minmax(0,1fr)_auto] items-center gap-3 px-5 py-3.5 transition-colors hover:bg-muted/45 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-inset focus-visible:ring-[#6f3b86]/30 sm:px-7"
        aria-label={`${route.code} ${getCampusBusRouteDisplayName(route)}`}
      >
        <span
          className={
            active
              ? "grid size-11 place-items-center rounded-xl bg-[#f1e8f5] font-bold text-[#5b2a73] dark:bg-[#2b2030] dark:text-[#e7c9f1]"
              : "grid size-11 place-items-center rounded-xl bg-muted font-bold text-muted-foreground"
          }
          aria-hidden="true"
        >
          {route.code}
        </span>

        <span className="min-w-0">
          <strong className="block truncate text-sm">
            {getCampusBusRouteDisplayName(route)}
          </strong>
          <span className="mt-1 block truncate text-xs text-muted-foreground">
            {route.riderEligibility === "staff-only"
              ? `職員專用 · ${route.subtitle}`
              : active || !item.departureTime
                ? route.subtitle
                : `${item.statusLabel} · ${route.subtitle}`}
          </span>
        </span>

        <span className="flex shrink-0 items-center gap-2 text-right text-muted-foreground">
          {item.departureTime ? (
            <span>
              <span className="block text-[0.6875rem] font-medium">
                {item.departureLabel}
              </span>
              <strong className="block text-xs font-semibold tabular-nums">
                {item.departureTime}
              </strong>
            </span>
          ) : (
            <span className="max-w-20 text-xs leading-4">
              {item.statusLabel}
            </span>
          )}
          <ChevronRightIcon
            className="size-4 transition-transform group-hover:translate-x-0.5"
            aria-hidden="true"
          />
        </span>
      </Link>
    </li>
  );
}

function RouteSection({
  active,
  items,
  title,
}: {
  active: boolean;
  items: CampusBusCatalogItem[];
  title: string;
}) {
  return (
    <section
      className="pt-5"
      aria-labelledby={`campus-bus-${active ? "available" : "other"}-heading`}
    >
      <div className="mb-2 flex items-center justify-between px-5 sm:px-7">
        <h2
          id={`campus-bus-${active ? "available" : "other"}-heading`}
          className={
            active
              ? "text-sm font-bold text-[#5b2a73] dark:text-[#e7c9f1]"
              : "text-sm font-bold text-muted-foreground"
          }
        >
          {title}
        </h2>
        <span className="text-xs text-muted-foreground">{items.length} 條</span>
      </div>
      <ul className="divide-y border-y bg-background">
        {items.length > 0 ? (
          items.map((item) => (
            <RouteRow key={item.route.routeId} active={active} item={item} />
          ))
        ) : (
          <li className="px-5 py-5 text-sm text-muted-foreground sm:px-7">
            目前沒有行駛中的校巴，其他今日路線仍可在下方查看。
          </li>
        )}
      </ul>
    </section>
  );
}

export function CampusBusRouteList({
  initialNow,
  routes,
}: CampusBusRouteListProps) {
  const [now, setNow] = useState(initialNow);

  useEffect(() => {
    const syncTimer = window.setTimeout(() => setNow(Date.now()), 0);
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => {
      window.clearTimeout(syncTimer);
      window.clearInterval(timer);
    };
  }, []);

  const catalog = useMemo(
    () => getCampusBusRouteCatalog(routes, now),
    [now, routes],
  );

  return (
    <div className="pb-5" aria-label="全部校巴路線">
      <RouteSection active items={catalog.available} title="現在可乘" />
      <RouteSection active={false} items={catalog.other} title="其他路線" />
    </div>
  );
}
