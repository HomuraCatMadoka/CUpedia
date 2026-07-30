"use client";

import { useEffect, useMemo, useState } from "react";

import {
  FOOD_MAP_BUDGETS,
  FOOD_MAP_ORIGIN_STATION_ID,
  MTR_LINES,
  MTR_SEGMENTS,
  MTR_STATIONS,
  getReachableStations,
  getRestaurantsForStation,
  type FoodMapBudget,
  type MtrLineId,
  type MtrStation,
  type MtrStationId,
} from "@/lib/food-map/data";
import {
  FOOD_MAP_CHECKINS_STORAGE_KEY,
  emptyFoodMapCheckinStore,
  hktDateKey,
  parseFoodMapCheckinStore,
  serializeFoodMapCheckinStore,
  toggleFoodMapCheckin,
} from "@/lib/food-map/checkins";
import { getUniversityRoute } from "@/lib/food-map/university-journey-times";

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
    </div>
  );
}

function StationNode({
  station,
  selected,
}: {
  station: MtrStation;
  selected: boolean;
}) {
  const line = lineById.get(station.lineIds[0] ?? "EAL");
  const interchange = station.lineIds.length > 1;

  return (
    <g aria-hidden="true">
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
      className="relative mx-auto w-full max-w-[29rem]"
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
        {reachableStations.map((station) => (
          <button
            key={station.id}
            type="button"
            data-station-id={station.id}
            aria-current={selectedStationId === station.id ? "true" : undefined}
            aria-label={`${station.nameZh}，${
              station.minutes === 0 ? "0" : station.minutes
            } 分钟${station.service === "special-event" ? "，特别班次" : ""}`}
            onClick={() => onSelectStation(station.id)}
            className={[
              "pointer-events-auto absolute h-11 w-11 -translate-x-1/2 -translate-y-1/2 touch-manipulation rounded-full",
              "focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-[#672d7e]/45",
            ].join(" ")}
            style={{
              left: `${((station.position.x - view.x) / view.width) * 100}%`,
              top: `${((station.position.y - view.y) / view.height) * 100}%`,
            }}
          />
        ))}
      </div>
    </div>
  );
}

function DetailPanel({
  stationId,
  notice,
  checkedIds,
  ready,
  onToggleCheckIn,
}: {
  stationId: MtrStationId | null;
  notice: string | null;
  checkedIds: ReadonlySet<string>;
  ready: boolean;
  onToggleCheckIn: (restaurantId: string) => void;
}) {
  const station = stationById.get(stationId ?? ORIGIN_ID) ?? MTR_STATIONS[0];
  const restaurant = getRestaurantsForStation(station.id)[0];
  const checked = checkedIds.has(restaurant.id);
  const route = stationId ? getUniversityRoute(stationId) : null;

  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-xl bg-muted/55 px-3 py-3 max-[420px]:grid-cols-1">
      <div className="min-w-0" aria-live="polite">
        <p className="font-medium">
          {stationId
            ? `大学 → ${station.nameZh} · ${station.minutes} 分钟`
            : "大学 · 0 分钟"}
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {stationId ? routeSummary(stationId) : notice || "校内起点"}
        </p>
        <p className="mt-1 truncate text-sm">
          {restaurant.name}，{restaurant.cuisine}
        </p>
        {route ? (
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
      </div>
      <button
        type="button"
        disabled={!ready}
        aria-pressed={checked}
        onClick={() => onToggleCheckIn(restaurant.id)}
        className={[
          "min-h-11 touch-manipulation rounded-lg px-4 text-sm font-medium max-[420px]:w-full",
          "transition-[background-color,color,transform] motion-reduce:transition-none active:scale-[0.98]",
          "focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-wait disabled:opacity-60",
          checked
            ? "bg-[#e4efe5] text-[#315b36] dark:bg-[#203427] dark:text-[#b7d3be]"
            : "bg-foreground text-background hover:bg-foreground/85",
        ].join(" ")}
      >
        {ready ? (checked ? "今天已打卡" : "今天吃过") : "读取打卡记录"}
      </button>
    </div>
  );
}

export function FoodMapView() {
  const [budget, setBudget] = useState<FoodMapBudget>(DEFAULT_BUDGET);
  const [selectedStationId, setSelectedStationId] =
    useState<MtrStationId | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [today, setToday] = useState(hktDateKey);
  const [checkins, setCheckins] = useState(emptyFoodMapCheckinStore);
  const [checkinsReady, setCheckinsReady] = useState(false);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setCheckins(
        parseFoodMapCheckinStore(
          window.localStorage.getItem(FOOD_MAP_CHECKINS_STORAGE_KEY),
        ),
      );
      setCheckinsReady(true);
    }, 0);

    return () => window.clearTimeout(timeout);
  }, []);

  useEffect(() => {
    const refreshToday = () => {
      if (document.visibilityState === "visible") setToday(hktDateKey());
    };

    window.addEventListener("focus", refreshToday);
    document.addEventListener("visibilitychange", refreshToday);

    return () => {
      window.removeEventListener("focus", refreshToday);
      document.removeEventListener("visibilitychange", refreshToday);
    };
  }, []);

  const checkedIds = useMemo(
    () => new Set(checkins.byDate[today] ?? []),
    [checkins, today],
  );

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

  function toggleCheckIn(restaurantId: string) {
    const activeToday = hktDateKey();
    const next = toggleFoodMapCheckin(checkins, activeToday, restaurantId);

    try {
      window.localStorage.setItem(
        FOOD_MAP_CHECKINS_STORAGE_KEY,
        serializeFoodMapCheckinStore(next),
      );
      setToday(activeToday);
      setCheckins(next);
    } catch {
      return;
    }
  }

  return (
    <section
      className="mx-auto mt-6 w-full max-w-[32rem] min-w-0 [--food-map-cu-foreground:#ffffff] [--food-map-cu:#672d7e] dark:[--food-map-cu-foreground:#211225] dark:[--food-map-cu:#c48fda]"
      aria-label="通勤食图"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[#672d7e] text-sm font-medium text-white dark:bg-[#c48fda] dark:text-[#211225]">
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

      <div className="mt-3">
        <CommuteFilter budget={budget} onChange={changeBudget} />
      </div>
      <div className="mt-2">
        <MapLegend />
      </div>

      <div className="mt-2">
        <MtrSchematic
          budget={budget}
          selectedStationId={selectedStationId}
          onSelectStation={selectStation}
          onClearSelection={clearSelection}
        />
      </div>

      <DetailPanel
        stationId={selectedStationId}
        notice={notice}
        checkedIds={checkedIds}
        ready={checkinsReady}
        onToggleCheckIn={toggleCheckIn}
      />

      <p className="sr-only" aria-live="polite">
        今天已打卡 {checkedIds.size} 家餐厅
      </p>
    </section>
  );
}
