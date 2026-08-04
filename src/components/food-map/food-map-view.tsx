"use client";

import { Drawer } from "@base-ui/react/drawer";
import { ArrowRightIcon, MapPinIcon, XIcon } from "lucide-react";
import Link from "next/link";
import { useMemo, useRef, useState } from "react";

import { useMediaQuery } from "@/hooks/use-media-query";
import {
  FOOD_MAP_BUDGETS,
  FOOD_MAP_ORIGIN_STATION_ID,
  MTR_LINES,
  MTR_SEGMENTS,
  MTR_STATIONS,
  getReachableStations,
  type FoodMapBudget,
  type MtrLineId,
  type MtrStation,
  type MtrStationId,
} from "@/lib/food-map/data";
import { getUniversityRoute } from "@/lib/food-map/university-journey-times";
import {
  getFoodleRestaurantsForStation,
  getRestaurantOpeningStatus,
  hasFoodleRestaurants,
} from "@/lib/food-map/restaurant-catalog";

const MOBILE_PREVIEW_MAX_VIEWPORT_RATIO = 0.72;

const DEFAULT_BUDGET: FoodMapBudget = 30;
const ORIGIN_ID = FOOD_MAP_ORIGIN_STATION_ID;

const stationById = new Map(
  MTR_STATIONS.map((station) => [station.id, station]),
);
const lineById = new Map(MTR_LINES.map((line) => [line.id, line]));
const segmentKey = (from: MtrStationId, to: MtrStationId, lineId: MtrLineId) =>
  `${[from, to].sort().join("|")}|${lineId}`;
const segmentByKey = new Map(
  MTR_SEGMENTS.map((segment) => [
    segmentKey(segment.from, segment.to, segment.lineId),
    segment,
  ]),
);

function routeSummary(stationId: MtrStationId) {
  const route = getUniversityRoute(stationId);
  if (route.segments.length === 0) return "校内起点";
  if (stationId === "RAC") return "东铁线，赛马日特别班次";

  const parts = [
    `${lineById.get(route.segments[0].lineId)?.nameZh ?? ""}${
      new Set(route.segments.map((segment) => segment.lineId)).size === 1
        ? "直达"
        : ""
    }`,
  ];

  for (let index = 1; index < route.segments.length; index += 1) {
    const previous = route.segments[index - 1];
    const current = route.segments[index];
    if (previous.lineId === current.lineId) continue;
    parts.push(
      `在${stationById.get(current.from)?.nameZh ?? ""}换乘${
        lineById.get(current.lineId)?.nameZh ?? ""
      }`,
    );
  }

  return parts.join("，");
}

const MAP_VIEWS: Record<
  FoodMapBudget,
  {
    viewBox: string;
    x: number;
    y: number;
    width: number;
    height: number;
    labelSize: number;
  }
> = {
  10: {
    viewBox: "100 125 320 330",
    x: 100,
    y: 125,
    width: 320,
    height: 330,
    labelSize: 14,
  },
  20: {
    viewBox: "20 40 400 700",
    x: 20,
    y: 40,
    width: 400,
    height: 700,
    labelSize: 17,
  },
  30: {
    viewBox: "-20 -20 500 885",
    x: -20,
    y: -20,
    width: 500,
    height: 885,
    labelSize: 20,
  },
};

const SCOPE_COUNTS: Record<FoodMapBudget, string> = {
  10: "5 个日常目的地 + 马场特别班次",
  20: "15 个日常目的地 + 马场特别班次",
  30: "41 个日常目的地 + 马场特别班次",
};

const TRANSFER_STUBS: readonly {
  budget: FoodMapBudget;
  lineId: MtrLineId;
  path: string;
}[] = [
  { budget: 10, lineId: "TML", path: "M205 415 H255" },
  { budget: 20, lineId: "KTL", path: "M230 485 H258" },
  { budget: 20, lineId: "KTL", path: "M332 485 H368" },
];

function CommuteFilter({
  budget,
  onChange,
}: {
  budget: FoodMapBudget;
  onChange: (budget: FoodMapBudget) => void;
}) {
  return (
    <div
      className="grid w-full grid-cols-3 gap-2"
      role="group"
      aria-label="通勤时间"
    >
      {FOOD_MAP_BUDGETS.map((minutes) => (
        <button
          key={minutes}
          type="button"
          aria-pressed={budget === minutes}
          onClick={() => onChange(minutes)}
          className={[
            "min-h-11 touch-manipulation rounded-lg border px-3 text-sm font-medium",
            "transition-[background-color,color,border-color,transform] motion-reduce:transition-none",
            "active:scale-[0.98] focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
            budget === minutes
              ? "border-[#672d7e] bg-[#672d7e] text-white dark:border-[#c48fda] dark:bg-[#c48fda] dark:text-[#211225]"
              : "border-border bg-background text-foreground hover:bg-muted",
          ].join(" ")}
        >
          {minutes} 分钟
        </button>
      ))}
    </div>
  );
}

function MapLegend() {
  return (
    <div
      className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground"
      aria-label="线路图例"
    >
      {MTR_LINES.map((line) => (
        <span key={line.id} className="inline-flex items-center gap-1.5">
          <span
            className="h-1 w-4 rounded-full"
            style={{ backgroundColor: line.color }}
            aria-hidden="true"
          />
          {line.nameZh}
        </span>
      ))}
      <span className="inline-flex items-center gap-1.5">
        <span
          className="h-2 w-2 rotate-45 border-2 border-[#5eb6e4]"
          aria-hidden="true"
        />
        马场特别班次
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span
          className="h-2.5 w-2.5 rounded-full border-2 border-[#672d7e] dark:border-[#c48fda]"
          aria-hidden="true"
        />
        已有餐厅候选
      </span>
    </div>
  );
}

function StationNode({
  station,
  selected,
  restaurantMapAvailable,
}: {
  station: MtrStation;
  selected: boolean;
  restaurantMapAvailable: boolean;
}) {
  const line = lineById.get(station.lineIds[0] ?? "EAL");
  const interchange = station.lineIds.length > 1;

  return (
    <g aria-hidden="true">
      {restaurantMapAvailable ? (
        <circle
          cx={station.position.x}
          cy={station.position.y}
          r={interchange ? 14 : 11}
          fill="var(--background)"
          stroke="var(--food-map-cu)"
          strokeWidth="2.4"
          vectorEffect="non-scaling-stroke"
        />
      ) : null}
      {selected ? (
        <circle
          cx={station.position.x}
          cy={station.position.y}
          r={interchange ? 13 : 11}
          fill="none"
          stroke="var(--food-map-cu)"
          strokeWidth="2.2"
          vectorEffect="non-scaling-stroke"
        />
      ) : null}
      {station.id === ORIGIN_ID ? (
        <>
          <rect
            x={station.position.x - 10}
            y={station.position.y - 10}
            width="20"
            height="20"
            rx="5"
            fill="var(--food-map-cu)"
            stroke="var(--background)"
            strokeWidth="2.5"
            vectorEffect="non-scaling-stroke"
          />
          <circle
            cx={station.position.x}
            cy={station.position.y}
            r="3"
            fill="var(--food-map-cu-foreground)"
          />
        </>
      ) : station.service === "special-event" ? (
        <rect
          x={station.position.x - 6}
          y={station.position.y - 6}
          width="12"
          height="12"
          transform={`rotate(45 ${station.position.x} ${station.position.y})`}
          fill="var(--background)"
          stroke={line?.color}
          strokeWidth="2.2"
          vectorEffect="non-scaling-stroke"
        />
      ) : (
        <circle
          cx={station.position.x}
          cy={station.position.y}
          r={interchange ? 8 : 5.5}
          fill="var(--background)"
          stroke={interchange ? "var(--foreground)" : line?.color}
          strokeWidth={interchange ? 2.2 : 2}
          vectorEffect="non-scaling-stroke"
        />
      )}
    </g>
  );
}

function MtrSchematic({
  budget,
  selectedStationId,
  onSelectStation,
  onClearSelection,
}: {
  budget: FoodMapBudget;
  selectedStationId: MtrStationId | null;
  onSelectStation: (stationId: MtrStationId) => void;
  onClearSelection: () => void;
}) {
  const view = MAP_VIEWS[budget];
  const reachableStations = useMemo(
    () => getReachableStations(budget),
    [budget],
  );
  const reachableIds = useMemo(
    () => new Set(reachableStations.map((station) => station.id)),
    [reachableStations],
  );
  const visibleSegments = MTR_SEGMENTS.filter(
    (segment) => reachableIds.has(segment.from) && reachableIds.has(segment.to),
  );
  const selectedRoute = selectedStationId
    ? getUniversityRoute(selectedStationId)
    : null;
  const selectedEdgeKeys = new Set(
    selectedRoute?.segments.map((segment) =>
      segmentKey(segment.from, segment.to, segment.lineId),
    ) ?? [],
  );

  return (
    <div
      className="relative mx-auto w-full max-w-[31.5rem]"
      onDoubleClick={(event) => {
        if ((event.target as Element).closest("[data-station-id]")) return;
        onClearSelection();
      }}
    >
      <svg
        className="pointer-events-none block h-auto w-full overflow-visible text-foreground"
        viewBox={view.viewBox}
        role="img"
        aria-label={`以大学站为中心的港铁通勤图。大学站${budget}分钟内可达的${reachableStations.length}个车站。`}
      >
        <rect
          x={view.x}
          y={view.y}
          width={view.width}
          height={view.height}
          fill="transparent"
        />

        {visibleSegments.map((segment) => {
          const line = lineById.get(segment.lineId);
          return (
            <path
              key={`${segment.from}|${segment.to}|${segment.lineId}`}
              d={segment.path}
              fill="none"
              stroke={line?.color}
              strokeWidth="7"
              strokeLinecap={segment.special ? "butt" : "round"}
              strokeLinejoin="round"
              strokeDasharray={segment.special ? "5 5" : undefined}
              opacity={
                selectedRoute
                  ? selectedEdgeKeys.has(
                      segmentKey(segment.from, segment.to, segment.lineId),
                    )
                    ? 0.22
                    : 0.12
                  : 1
              }
              vectorEffect="non-scaling-stroke"
            />
          );
        })}

        {TRANSFER_STUBS.filter((stub) => stub.budget === budget).map((stub) => (
          <path
            key={`${stub.budget}-${stub.path}`}
            d={stub.path}
            fill="none"
            stroke={lineById.get(stub.lineId)?.color}
            strokeWidth="7"
            strokeLinecap="round"
            opacity={selectedRoute ? 0.24 : 0.82}
            vectorEffect="non-scaling-stroke"
          />
        ))}

        {selectedRoute?.segments.map((routeSegment) => {
          const key = segmentKey(
            routeSegment.from,
            routeSegment.to,
            routeSegment.lineId,
          );
          const segment = segmentByKey.get(key);
          const line = lineById.get(routeSegment.lineId);
          if (!segment || !line) return null;

          return (
            <g key={`route-${key}`} aria-hidden="true">
              <path
                d={segment.path}
                fill="none"
                stroke="var(--background)"
                strokeWidth="13"
                strokeLinecap={segment.special ? "butt" : "round"}
                strokeLinejoin="round"
                strokeDasharray={segment.special ? "5 5" : undefined}
                vectorEffect="non-scaling-stroke"
              />
              <path
                d={segment.path}
                fill="none"
                stroke={line.color}
                strokeWidth="8"
                strokeLinecap={segment.special ? "butt" : "round"}
                strokeLinejoin="round"
                strokeDasharray={segment.special ? "5 5" : undefined}
                vectorEffect="non-scaling-stroke"
              />
            </g>
          );
        })}

        {reachableStations.map((station) => (
          <StationNode
            key={station.id}
            station={station}
            selected={selectedStationId === station.id}
            restaurantMapAvailable={hasFoodleRestaurants(station.id)}
          />
        ))}

        {reachableStations.map((station) => (
          <text
            key={`label-${station.id}`}
            x={station.label.x}
            y={station.label.y}
            textAnchor={station.label.anchor}
            dominantBaseline="middle"
            fill="var(--foreground)"
            stroke="var(--background)"
            strokeWidth="4"
            strokeLinejoin="round"
            paintOrder="stroke fill"
            fontSize={view.labelSize}
            fontWeight={selectedStationId === station.id ? 500 : 400}
          >
            {station.nameZh}
          </text>
        ))}

        <text
          x="252"
          y="239"
          textAnchor="start"
          dominantBaseline="middle"
          fill="var(--food-map-cu)"
          stroke="var(--background)"
          strokeWidth="4"
          strokeLinejoin="round"
          paintOrder="stroke fill"
          fontSize={view.labelSize * 0.78}
          fontWeight="500"
        >
          中大起点
        </text>
      </svg>

      <div
        className="pointer-events-none absolute inset-0"
        role="group"
        aria-label="选择目的地"
      >
        {reachableStations.map((station) => {
          const label = `${station.nameZh}，${
            station.minutes === 0 ? "0" : station.minutes
          } 分钟${station.service === "special-event" ? "，特别班次" : ""}${
            hasFoodleRestaurants(station.id) ? "，已有餐厅候选" : ""
          }`;
          const className = [
            "pointer-events-auto absolute h-11 w-11 -translate-x-1/2 -translate-y-1/2 touch-manipulation rounded-full",
            "focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-[#672d7e]/45",
          ].join(" ");
          const style = {
            left: `${((station.position.x - view.x) / view.width) * 100}%`,
            top: `${((station.position.y - view.y) / view.height) * 100}%`,
          };

          return (
            <button
              key={station.id}
              type="button"
              data-station-id={station.id}
              aria-current={
                selectedStationId === station.id ? "true" : undefined
              }
              aria-label={label}
              onClick={() => onSelectStation(station.id)}
              className={className}
              style={style}
            />
          );
        })}
      </div>
    </div>
  );
}

function StationSummary({
  station,
  notice,
  mobile = false,
}: {
  station: MtrStation | null;
  notice: string | null;
  mobile?: boolean;
}) {
  if (!station) {
    return (
      <section
        className="rounded-xl border bg-background p-5"
        aria-live="polite"
      >
        <div className="grid size-10 place-items-center rounded-lg bg-[#672d7e]/10 text-[#672d7e] dark:bg-[#c48fda]/15 dark:text-[#c48fda]">
          <MapPinIcon className="size-5" aria-hidden="true" />
        </div>
        <h2 className="mt-4 text-lg font-semibold">从地铁图选择一站</h2>
        <p className="mt-1.5 text-sm leading-6 text-muted-foreground">
          先看从大学站出发的车程，再进入站点附近 500 米的餐厅地图。
        </p>
        {notice ? (
          <p className="mt-3 rounded-lg bg-muted px-3 py-2 text-sm">{notice}</p>
        ) : null}
        <p className="mt-4 border-t pt-4 text-xs text-muted-foreground">
          首个版本收录沙田和大埔墟，校内餐厅继续留在山城食记。
        </p>
      </section>
    );
  }

  const restaurants = getFoodleRestaurantsForStation(station.id);
  const available = restaurants.length > 0;
  const openCount = restaurants.filter(
    (restaurant) => getRestaurantOpeningStatus(restaurant).state === "open",
  ).length;
  const route = getUniversityRoute(station.id);

  return (
    <section
      className={
        mobile
          ? "bg-background px-5 pt-1 pb-5"
          : "rounded-xl border bg-background p-5"
      }
      aria-live="polite"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-medium text-[#672d7e] dark:text-[#c48fda]">
            大学 → {station.nameZh} · {station.minutes} 分钟
          </p>
          <h2 className="mt-1 text-xl font-semibold tracking-tight">
            {station.nameZh}站附近餐厅
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {routeSummary(station.id)}
          </p>
        </div>
        {available ? (
          <span className="shrink-0 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
            {openCount} 家营业中
          </span>
        ) : null}
      </div>

      {route.segments.length > 0 ? (
        <ol className="sr-only" aria-label="当前最短路线">
          {route.segments.map((segment) => (
            <li key={segmentKey(segment.from, segment.to, segment.lineId)}>
              {stationById.get(segment.from)?.nameZh}到
              {stationById.get(segment.to)?.nameZh}，
              {lineById.get(segment.lineId)?.nameZh}
            </li>
          ))}
        </ol>
      ) : null}

      {available ? (
        <>
          <div className="mt-4 grid grid-cols-3 divide-x rounded-lg border bg-muted/20 py-3 text-center">
            <div>
              <p className="text-base font-semibold tabular-nums">
                {restaurants.length}
              </p>
              <p className="text-[11px] text-muted-foreground">家餐厅</p>
            </div>
            <div>
              <p className="text-base font-semibold tabular-nums">500m</p>
              <p className="text-[11px] text-muted-foreground">收录范围</p>
            </div>
            <div>
              <p className="text-base font-semibold tabular-nums">
                {openCount}
              </p>
              <p className="text-[11px] text-muted-foreground">营业中</p>
            </div>
          </div>
          <ul className="mt-4 space-y-2 text-sm">
            {restaurants.slice(0, 3).map((restaurant) => (
              <li
                key={restaurant.id}
                className="flex items-center justify-between gap-3"
              >
                <span className="min-w-0 truncate font-medium">
                  {restaurant.sourceFacts.name}
                </span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {restaurant.foodle.walkMinutes
                    ? `步行 ${restaurant.foodle.walkMinutes} 分钟`
                    : "步行时间待补"}
                </span>
              </li>
            ))}
          </ul>
          <Link
            href={`/food-map/stations/${station.id.toLowerCase()}`}
            className="mt-5 flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-[#672d7e] px-4 text-sm font-medium text-white transition-colors hover:bg-[#542267] focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-[#672d7e]/40 dark:bg-[#c48fda] dark:text-[#211225] dark:hover:bg-[#d4a8e4]"
          >
            打开 {station.nameZh}餐厅地图
            <ArrowRightIcon className="size-4" aria-hidden="true" />
          </Link>
        </>
      ) : (
        <div className="mt-5 rounded-lg border border-dashed bg-muted/20 px-4 py-5 text-sm leading-6 text-muted-foreground">
          这一站暂未收录。当前只制作沙田和大埔墟，不会把校内餐厅重复放进来。
        </div>
      )}
    </section>
  );
}

function MobileStationPreview({
  station,
  notice,
  onClose,
}: {
  station: MtrStation;
  notice: string | null;
  onClose: () => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);

  return (
    <Drawer.Root
      defaultOpen
      onOpenChangeComplete={(open) => {
        if (!open) onClose();
      }}
      swipeDirection="down"
    >
      <Drawer.Portal>
        <Drawer.Backdrop className="fixed inset-0 z-40 bg-black/10 opacity-100 transition-opacity duration-200 data-ending-style:opacity-0 data-starting-style:opacity-0 motion-reduce:transition-none" />
        <Drawer.Viewport className="pointer-events-none fixed inset-0 z-50 flex items-end overflow-hidden">
          <Drawer.Popup
            data-testid="food-map-mobile-station-preview"
            initialFocus={() => closeRef.current}
            finalFocus={false}
            className="pointer-events-auto max-h-[72dvh] w-full touch-manipulation overflow-y-auto overscroll-contain rounded-t-[1.25rem] border-t bg-background shadow-xl outline-none transition-transform duration-200 ease-out [transform:translateY(var(--drawer-swipe-movement-y))] data-ending-style:[transform:translateY(100%)] data-starting-style:[transform:translateY(100%)] data-swiping:transition-none motion-reduce:transition-none"
            style={{
              maxHeight: `${MOBILE_PREVIEW_MAX_VIEWPORT_RATIO * 100}dvh`,
            }}
          >
            <div className="relative flex min-h-12 shrink-0 items-center justify-center border-b">
              <div
                data-testid="food-map-mobile-preview-handle"
                className="h-1 w-10 rounded-full bg-muted-foreground/30"
                aria-hidden="true"
              />
              <Drawer.Title render={<span />} className="sr-only">
                {station.nameZh}站附近餐厅
              </Drawer.Title>
              <Drawer.Close
                ref={closeRef}
                aria-label="关闭站点摘要"
                className="absolute right-2 grid size-11 touch-manipulation place-items-center rounded-xl text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <XIcon className="size-4" aria-hidden="true" />
              </Drawer.Close>
            </div>
            <Drawer.Content>
              <StationSummary station={station} notice={notice} mobile />
            </Drawer.Content>
          </Drawer.Popup>
        </Drawer.Viewport>
      </Drawer.Portal>
    </Drawer.Root>
  );
}

export function FoodMapView() {
  const [budget, setBudget] = useState<FoodMapBudget>(DEFAULT_BUDGET);
  const [selectedStationId, setSelectedStationId] =
    useState<MtrStationId | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const mobile = useMediaQuery("(max-width: 767px)");
  const selectedStation = selectedStationId
    ? (stationById.get(selectedStationId) ?? null)
    : null;

  function changeBudget(nextBudget: FoodMapBudget) {
    setBudget(nextBudget);
    const selected = selectedStationId
      ? stationById.get(selectedStationId)
      : null;
    if (selected && selected.minutes > nextBudget) {
      setNotice(`${selected.nameZh}不在${nextBudget}分钟范围内`);
      setSelectedStationId(null);
    } else {
      setNotice(null);
    }
  }

  function selectStation(nextStationId: MtrStationId) {
    setNotice(null);
    setSelectedStationId((current) =>
      nextStationId === ORIGIN_ID || current === nextStationId
        ? null
        : nextStationId,
    );
  }

  function clearSelection() {
    setSelectedStationId(null);
    setNotice(null);
  }

  function closeMobilePreview() {
    const stationId = selectedStationId;
    clearSelection();
    requestAnimationFrame(() => {
      if (!stationId) return;
      document
        .querySelector<HTMLButtonElement>(`[data-station-id="${stationId}"]`)
        ?.focus();
    });
  }

  return (
    <section
      className="mx-auto mt-6 w-full max-w-[64rem] min-w-0 [--food-map-cu-foreground:#ffffff] [--food-map-cu:#672d7e] dark:[--food-map-cu-foreground:#211225] dark:[--food-map-cu:#c48fda]"
      aria-label="通勤食图"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[#672d7e] text-xs font-semibold text-white dark:bg-[#c48fda] dark:text-[#211225]">
            CU
          </span>
          <div className="min-w-0">
            <p className="font-medium">大学站出发 · {budget} 分钟</p>
            <p className="text-xs text-muted-foreground">
              {SCOPE_COUNTS[budget]}
            </p>
          </div>
        </div>
      </div>

      <div className="mt-3 max-w-[32rem]">
        <CommuteFilter budget={budget} onChange={changeBudget} />
      </div>
      <div className="mt-2 max-w-[32rem]">
        <MapLegend />
      </div>

      <div className="mt-4 grid min-w-0 gap-x-6 gap-y-4 md:grid-cols-[minmax(0,33rem)_minmax(22rem,1fr)] md:items-start lg:gap-x-8">
        <div className="min-w-0">
          <MtrSchematic
            budget={budget}
            selectedStationId={selectedStationId}
            onSelectStation={selectStation}
            onClearSelection={clearSelection}
          />
        </div>

        <div className="hidden min-w-0 md:sticky md:top-[calc(var(--navbar-height)+1.5rem)] md:block">
          <StationSummary station={selectedStation} notice={notice} />
        </div>
      </div>

      {mobile && selectedStation ? (
        <MobileStationPreview
          key={selectedStation.id}
          station={selectedStation}
          notice={notice}
          onClose={closeMobilePreview}
        />
      ) : null}

      <p className="sr-only" aria-live="polite">
        {selectedStation
          ? `已选择${selectedStation.nameZh}站`
          : notice || "尚未选择目的地"}
      </p>
    </section>
  );
}
