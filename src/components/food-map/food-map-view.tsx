"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";

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
  type MtrSegment,
  type MtrStation,
  type MtrStationId,
} from "@/lib/food-map/data";
import {
  getHkDistrict,
  HK_DISTRICTS,
  type HkDistrictId,
} from "@/lib/food-map/districts";
import { projectLngLat } from "@/lib/food-map/geo-projection";
import {
  HK_CANVAS,
  HK_DISTRICT_GEOMETRY,
} from "@/lib/food-map/hk-geometry";
import {
  HK_CONTINENT_LAND_PATH,
  HK_ISLAND_LAND_PATH,
  HK_LAND_PATHS,
  HK_MAINLAND_LAND_PATHS,
} from "@/lib/food-map/hk-land";
import {
  HK_SHAMCHUN_COVER_PATHS,
  HK_SHENZHEN_BORDER_PATHS,
  HK_SHENZHEN_LAND_PATHS,
} from "@/lib/food-map/hk-border";
import { HK_RIVER_LINE_PATHS } from "@/lib/food-map/hk-rivers";
import { AREA_ANCHORS, DISTRICT_LABEL_ANCHORS } from "@/lib/food-map/station-geo";
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

const SCOPE_COUNTS: Record<FoodMapBudget, string> = {
  10: "5 个日常目的地 + 马场特别班次",
  20: "15 个日常目的地 + 马场特别班次",
  30: "41 个日常目的地 + 马场特别班次",
};

const SEA_COLOR = "#cfe5f0";
const LAND_COLOR = "#e3e6df";
const HARBOUR_LABEL = projectLngLat({ lng: 114.183, lat: 22.2895 });
const SHENZHEN_LABEL = projectLngLat({ lng: 114.1, lat: 22.545 });

/** 全图视野下仍显示站名标签的站点（其余站放大后显示）。 */
const MAJOR_LABEL_STATIONS: ReadonlySet<MtrStationId> = new Set([
  "UNI",
  "RAC",
  "LOW",
  "LMC",
  "MOS",
  "KOB",
  "LCK",
  "JOR",
  "ADM",
  "AUS",
]);

const SHOW_ALL_LABELS_BELOW_WIDTH = 300;

/** 九龙城区片：区界只许落在主大陆环上（不含港内小岛）。 */
const URBAN_KOWLOON_DISTRICTS: ReadonlySet<string> = new Set([
  "ssp",
  "ytm",
  "ktc",
  "wts",
  "kt",
]);

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

function DistrictLegend({
  stations,
}: {
  stations: readonly MtrStation[];
}) {
  const visibleDistricts = useMemo(() => {
    const ids = new Set(stations.map((station) => station.districtId));
    return HK_DISTRICTS.filter((district) => ids.has(district.id));
  }, [stations]);

  return (
    <div
      className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground"
      role="group"
      aria-label="地区图例"
    >
      {visibleDistricts.map((district) => (
        <span key={district.id} className="inline-flex items-center gap-1.5">
          <span
            className="h-2.5 w-2.5 rounded-full opacity-60"
            style={{ backgroundColor: district.color }}
            aria-hidden="true"
          />
          {district.nameZh}
        </span>
      ))}
    </div>
  );
}

function StationNode({
  station,
  selected,
  scale,
}: {
  station: MtrStation;
  selected: boolean;
  scale: number;
}) {
  const line = lineById.get(station.lineIds[0] ?? "EAL");
  const interchange = station.lineIds.length > 1;

  return (
    <g aria-hidden="true">
      {selected ? (
        <circle
          cx={station.position.x}
          cy={station.position.y}
          r={(interchange ? 7.5 : 6.5) * scale}
          fill="none"
          stroke="var(--food-map-cu)"
          strokeWidth="2"
          vectorEffect="non-scaling-stroke"
        />
      ) : null}
      {station.id === ORIGIN_ID ? (
        <>
          <rect
            x={station.position.x - 6 * scale}
            y={station.position.y - 6 * scale}
            width={12 * scale}
            height={12 * scale}
            rx={3 * scale}
            fill="var(--food-map-cu)"
            stroke="var(--background)"
            strokeWidth="2"
            vectorEffect="non-scaling-stroke"
          />
          <circle
            cx={station.position.x}
            cy={station.position.y}
            r={2 * scale}
            fill="var(--food-map-cu-foreground)"
          />
        </>
      ) : station.service === "special-event" ? (
        <rect
          x={station.position.x - 4 * scale}
          y={station.position.y - 4 * scale}
          width={8 * scale}
          height={8 * scale}
          transform={`rotate(45 ${station.position.x} ${station.position.y})`}
          fill="var(--background)"
          stroke={line?.color}
          strokeWidth="1.8"
          vectorEffect="non-scaling-stroke"
        />
      ) : (
        <circle
          cx={station.position.x}
          cy={station.position.y}
          r={(interchange ? 4.5 : 3.2) * scale}
          fill="var(--background)"
          stroke={interchange ? "var(--foreground)" : line?.color}
          strokeWidth={interchange ? 1.8 : 1.5}
          vectorEffect="non-scaling-stroke"
        />
      )}
    </g>
  );
}

interface MapFrame {
  x: number;
  y: number;
  width: number;
  height: number;
}

const FULL_FRAME: MapFrame = {
  x: HK_CANVAS.x - 10,
  y: HK_CANVAS.y - 10,
  width: HK_CANVAS.width + 20,
  height: HK_CANVAS.height + 20,
};
const MAX_ZOOM = 8;

function clampFrame(frame: MapFrame, aspect: number): MapFrame {
  const width = Math.min(
    Math.max(frame.width, FULL_FRAME.width / MAX_ZOOM),
    FULL_FRAME.width,
  );
  const height = width / aspect;
  const maxX = FULL_FRAME.x + FULL_FRAME.width - width;
  const maxY = FULL_FRAME.y + FULL_FRAME.height - height;
  const x =
    maxX < FULL_FRAME.x
      ? FULL_FRAME.x + (FULL_FRAME.width - width) / 2
      : Math.min(Math.max(frame.x, FULL_FRAME.x), maxX);
  const y =
    maxY < FULL_FRAME.y
      ? FULL_FRAME.y + (FULL_FRAME.height - height) / 2
      : Math.min(Math.max(frame.y, FULL_FRAME.y), maxY);
  return { x, y, width, height };
}

/** 按可达站投影坐标的 bbox + padding 计算初始取景。 */
function presetFrameFor(stations: readonly MtrStation[]): MapFrame {
  const xs = stations.map((station) => station.position.x);
  const ys = stations.map((station) => station.position.y);
  const pad = 58;
  let x = Math.min(...xs) - pad;
  let y = Math.min(...ys) - pad;
  let width = Math.max(...xs) - Math.min(...xs) + pad * 2;
  let height = Math.max(...ys) - Math.min(...ys) + pad * 2;
  if (width < 190) {
    x -= (190 - width) / 2;
    width = 190;
  }
  if (height < 190) {
    y -= (190 - height) / 2;
    height = 190;
  }
  return clampFrame({ x, y, width, height }, width / height);
}

function frameViewBox(frame: MapFrame) {
  return `${frame.x} ${frame.y} ${frame.width} ${frame.height}`;
}

/** 共线区段渲染路径：分离距按 textScale 补偿，任何缩放下保持屏幕恒定（仿港铁官方图）。 */
const PARALLEL_SCREEN_SEPARATION = 7;

function segmentRenderPath(segment: MtrSegment, scale: number): string {
  if (!segment.parallel) return segment.path;
  const from = stationById.get(segment.from);
  const to = stationById.get(segment.to);
  if (!from || !to) return segment.path;
  // 统一按规范化方向算法向，避免两条线行驶方向相反时偏到同一侧
  const [canonicalFrom, canonicalTo] = [segment.from, segment.to].sort();
  const a = stationById.get(canonicalFrom as MtrStationId);
  const b = stationById.get(canonicalTo as MtrStationId);
  if (!a || !b) return segment.path;
  const length =
    Math.hypot(b.position.x - a.position.x, b.position.y - a.position.y) || 1;
  const offset =
    (segment.parallel.index - (segment.parallel.count - 1) / 2) *
    PARALLEL_SCREEN_SEPARATION *
    scale;
  const offsetX = (-(b.position.y - a.position.y) / length) * offset;
  const offsetY = ((b.position.x - a.position.x) / length) * offset;
  const round1 = (n: number) => Math.round(n * 10) / 10;
  return `M${round1(from.position.x + offsetX)} ${round1(from.position.y + offsetY)} L${round1(to.position.x + offsetX)} ${round1(to.position.y + offsetY)}`;
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
  const reachableStations = useMemo(
    () => getReachableStations(budget),
    [budget],
  );
  const preset = useMemo(
    () => presetFrameFor(reachableStations),
    [reachableStations],
  );
  const aspect = preset.width / preset.height;
  const [frame, setFrame] = useState<MapFrame>(() => preset);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const pointersRef = useRef(new Map<number, { x: number; y: number }>());

  useEffect(() => {
    const container = containerRef.current;
    const svg = svgRef.current;
    if (!container || !svg) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = svg.getBoundingClientRect();
      const px = rect.width ? (event.clientX - rect.left) / rect.width : 0.5;
      const py = rect.height ? (event.clientY - rect.top) / rect.height : 0.5;
      const factor = event.deltaY < 0 ? 0.85 : 1 / 0.85;
      setFrame((prev) => {
        const width = prev.width * factor;
        const scale = width / prev.width;
        const anchorX = prev.x + px * prev.width;
        const anchorY = prev.y + py * prev.height;
        return clampFrame(
          {
            x: anchorX - (anchorX - prev.x) * scale,
            y: anchorY - (anchorY - prev.y) * scale,
            width,
            height: prev.height * scale,
          },
          aspect,
        );
      });
    };
    container.addEventListener("wheel", onWheel, { passive: false });
    return () => container.removeEventListener("wheel", onWheel);
  }, [aspect]);

  function handlePointerDown(event: ReactPointerEvent<SVGSVGElement>) {
    event.currentTarget.setPointerCapture?.(event.pointerId);
    pointersRef.current.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
    });
  }

  function handlePointerMove(event: ReactPointerEvent<SVGSVGElement>) {
    const pointers = pointersRef.current;
    const previous = pointers.get(event.pointerId);
    if (!previous) return;
    const rect = svgRef.current?.getBoundingClientRect();

    if (pointers.size === 1) {
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (!rect || !rect.width || !rect.height) return;
      setFrame((prev) => {
        const dx = ((event.clientX - previous.x) / rect.width) * prev.width;
        const dy = ((event.clientY - previous.y) / rect.height) * prev.height;
        return clampFrame({ ...prev, x: prev.x - dx, y: prev.y - dy }, aspect);
      });
      return;
    }

    if (pointers.size === 2 && rect && rect.width && rect.height) {
      const [idA, idB] = [...pointers.keys()];
      const oldA = idA === event.pointerId ? previous : pointers.get(idA)!;
      const oldB = idB === event.pointerId ? previous : pointers.get(idB)!;
      const oldDist = Math.hypot(oldA.x - oldB.x, oldA.y - oldB.y);
      const oldMidX = (oldA.x + oldB.x) / 2;
      const oldMidY = (oldA.y + oldB.y) / 2;

      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      const newA = pointers.get(idA)!;
      const newB = pointers.get(idB)!;
      const newDist = Math.hypot(newA.x - newB.x, newA.y - newB.y);
      if (!oldDist || !newDist) return;
      const newMidX = (newA.x + newB.x) / 2;
      const newMidY = (newA.y + newB.y) / 2;

      const factor = oldDist / newDist;
      setFrame((prev) => {
        const width = prev.width * factor;
        const scale = width / prev.width;
        const fx = (oldMidX - rect.left) / rect.width;
        const fy = (oldMidY - rect.top) / rect.height;
        const anchorX = prev.x + fx * prev.width;
        const anchorY = prev.y + fy * prev.height;
        const panX = ((newMidX - oldMidX) / rect.width) * prev.width;
        const panY = ((newMidY - oldMidY) / rect.height) * prev.height;
        return clampFrame(
          {
            x: anchorX - (anchorX - prev.x) * scale - panX,
            y: anchorY - (anchorY - prev.y) * scale - panY,
            width,
            height: prev.height * scale,
          },
          aspect,
        );
      });
      return;
    }

    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
  }

  function handlePointerEnd(event: ReactPointerEvent<SVGSVGElement>) {
    pointersRef.current.delete(event.pointerId);
  }

  /** 以取景中心为锚点按比例缩放（+/- 按钮用，不依赖手势）。 */
  function zoomBy(factor: number) {
    setFrame((prev) => {
      const width = prev.width * factor;
      const scale = width / prev.width;
      const centerX = prev.x + prev.width / 2;
      const centerY = prev.y + prev.height / 2;
      return clampFrame(
        {
          x: centerX - (centerX - prev.x) * scale,
          y: centerY - (centerY - prev.y) * scale,
          width,
          height: prev.height * scale,
        },
        aspect,
      );
    });
  }

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
  const showAllLabels = frame.width <= SHOW_ALL_LABELS_BELOW_WIDTH;
  const originStation = stationById.get(ORIGIN_ID) ?? MTR_STATIONS[0];
  // 文字保持恒定屏幕大小：以全图（30 分钟）取景宽度为绝对基准做反向补偿，
  // 任何 budget、任何缩放级别下文字屏幕尺寸一致
  const referenceWidth = useMemo(() => presetFrameFor(MTR_STATIONS).width, []);
  const textScale = frame.width / referenceWidth;
  const shownLabelStations = reachableStations.filter(
    (station) =>
      showAllLabels ||
      MAJOR_LABEL_STATIONS.has(station.id) ||
      station.lineIds.length > 1 ||
      selectedStationId === station.id,
  );
  // 统一标签防重叠：站名标签与小地区气泡进入同一优先级队列，
  // 全图视野用大间距（稀疏），放大后用小间距（全量）
  interface LabelItem {
    kind: "station" | "area";
    x: number;
    y: number;
    priority: number;
    station?: (typeof shownLabelStations)[number];
    anchor?: { name: string };
  }
  const labelItems: LabelItem[] = [
    ...shownLabelStations.map((station) => ({
      kind: "station" as const,
      x:
        station.position.x +
        (station.label.x - station.position.x) * textScale,
      y:
        station.position.y +
        (station.label.y - station.position.y) * textScale,
      priority:
        (selectedStationId === station.id ? 4 : 0) +
        (MAJOR_LABEL_STATIONS.has(station.id) ? 2 : 0) +
        (station.lineIds.length > 1 ? 1 : 0),
      station,
    })),
    ...AREA_ANCHORS.map((anchor) => {
      const point = projectLngLat(anchor);
      return { kind: "area" as const, x: point.x, y: point.y, priority: 0, anchor };
    }),
  ].sort((a, b) => b.priority - a.priority);

  const labelSpacing = (showAllLabels ? 15 : 26) * textScale;
  const keptLabels: LabelItem[] = [];
  for (const item of labelItems) {
    const collides = keptLabels.some(
      (kept) => Math.hypot(kept.x - item.x, kept.y - item.y) < labelSpacing,
    );
    if (!collides) keptLabels.push(item);
  }
  const declutteredStations = keptLabels
    .filter((item) => item.kind === "station")
    .map((item) => item.station!);
  const visibleAreaAnchors = keptLabels
    .filter((item) => item.kind === "area")
    .map((item) => ({
      anchor: item.anchor!,
      point: { x: item.x, y: item.y },
    }));
  const selectedStation = selectedStationId
    ? (stationById.get(selectedStationId) ?? null)
    : null;
  // 全图视野站点密集，触控按钮缩小避免互相遮挡；放大后恢复 44px
  const hitSize = frame.width > SHOW_ALL_LABELS_BELOW_WIDTH ? 26 : 44;

  return (
    <div
      ref={containerRef}
      className="relative mx-auto w-full max-w-[29rem] select-none"
      onDoubleClick={(event) => {
        if ((event.target as Element).closest("[data-station-id]")) return;
        onClearSelection();
      }}
    >
      <svg
        ref={svgRef}
        className="block h-auto w-full touch-none cursor-grab text-foreground active:cursor-grabbing"
        viewBox={frameViewBox(frame)}
        role="img"
        aria-label={`以大学站为中心的港铁通勤图。大学站${budget}分钟内可达的${reachableStations.length}个车站。滚轮或双指缩放，拖拽平移。`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
      >
        <defs>
          <clipPath id="hk-land-clip">
            {HK_LAND_PATHS.map((path, index) => (
              <path key={index} d={path} />
            ))}
          </clipPath>
          <clipPath id="hk-mainland-clip">
            {HK_MAINLAND_LAND_PATHS.map((path, index) => (
              <path key={index} d={path} />
            ))}
          </clipPath>
          <clipPath id="hk-island-clip">
            <path d={HK_ISLAND_LAND_PATH} />
          </clipPath>
          <clipPath id="hk-continent-clip">
            <path d={HK_CONTINENT_LAND_PATH} />
          </clipPath>
          <clipPath id="hk-districts-clip">
            {HK_DISTRICT_GEOMETRY.map((geometry) => (
              <path key={geometry.id} d={geometry.path} />
            ))}
          </clipPath>
        </defs>
        {/* 海（画布底色） */}
        <rect
          x={FULL_FRAME.x}
          y={FULL_FRAME.y}
          width={FULL_FRAME.width}
          height={FULL_FRAME.height}
          fill={SEA_COLOR}
        />
        {/* 陆地底色：按真实海岸线（OSM）裁剪 */}
        <g clipPath="url(#hk-land-clip)">
          <rect
            x={FULL_FRAME.x}
            y={FULL_FRAME.y}
            width={FULL_FRAME.width}
            height={FULL_FRAME.height}
            fill={LAND_COLOR}
          />
        </g>
        {/* 深圳侧陆块（OSM 海岸线按河口走，边界以北需单独补陆） */}
        {HK_SHENZHEN_LAND_PATHS.map((path, index) => (
          <path key={index} d={path} fill={LAND_COLOR} aria-hidden="true" />
        ))}
        {/* 分区：九龙城区片只画在主大陆环，港岛各区只画在港岛；
            南区/离岛区被画布边缘切断，按用户决定不渲染（边缘裁净） */}
        {HK_DISTRICT_GEOMETRY.filter(
          (geometry) => geometry.id !== "sd" && geometry.id !== "is",
        ).map((geometry) => {
          const district = getHkDistrict(geometry.id as HkDistrictId);
          const clipId = ["wc", "cw", "ed"].includes(geometry.id)
            ? "hk-island-clip"
            : URBAN_KOWLOON_DISTRICTS.has(geometry.id)
              ? "hk-continent-clip"
              : "hk-mainland-clip";
          return (
            <g key={geometry.id} clipPath={`url(#${clipId})`}>
              <path
                data-district-polygon={geometry.id}
                d={geometry.path}
                fill={district.color}
                fillOpacity={selectedRoute ? 0.06 : 0.15}
                stroke="#9aa7b4"
                strokeOpacity="0.55"
                strokeWidth="1"
                vectorEffect="non-scaling-stroke"
                aria-hidden="true"
              />
            </g>
          );
        })}
        {/* 内陆河流（稍深一点的蓝色以便与海区分开；按 18 区区界裁剪） */}
        <g clipPath="url(#hk-districts-clip)">
          {HK_RIVER_LINE_PATHS.map((path, index) => (
            <path
              key={index}
              d={path}
              fill="none"
              stroke="#93c4e0"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            />
          ))}
        </g>
        {/* 深圳河河道不显示：涂成北区绿混合色到界线，虚线压上（用户决定） */}
        {HK_SHAMCHUN_COVER_PATHS.map((path, index) => (
          <path
            key={index}
            d={path}
            fill="none"
            stroke="#d8e0d1"
            strokeWidth="7"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          />
        ))}
        {/* 香港—深圳陆界（深圳河）与深圳标注 */}
        {HK_SHENZHEN_BORDER_PATHS.map((path, index) => (
          <path
            key={index}
            d={path}
            fill="none"
            stroke="#8a94a0"
            strokeWidth="1.5"
            strokeDasharray="6 4"
            vectorEffect="non-scaling-stroke"
            aria-hidden="true"
          />
        ))}
        <text
          x={SHENZHEN_LABEL.x}
          y={SHENZHEN_LABEL.y}
          textAnchor="middle"
          dominantBaseline="middle"
          fontSize={12 * textScale}
          fill="#8a94a0"
          aria-hidden="true"
        >
          深圳
        </text>
        {/* 区名 */}
        {HK_DISTRICT_GEOMETRY.filter(
          (geometry) => geometry.id !== "sd" && geometry.id !== "is",
        ).map((geometry) => {
          const district = getHkDistrict(geometry.id as HkDistrictId);
          const anchor = DISTRICT_LABEL_ANCHORS[geometry.id];
          const point = anchor ? projectLngLat(anchor) : geometry.centroid;
          return (
            <text
              key={`district-name-${geometry.id}`}
              x={point.x}
              y={point.y}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize={13 * textScale}
              fontWeight="500"
              fill={district.color}
              stroke="var(--background)"
              strokeWidth={3 * textScale}
              strokeLinejoin="round"
              paintOrder="stroke fill"
              opacity={selectedRoute ? 0.3 : 0.75}
              aria-hidden="true"
            >
              {geometry.name}
            </text>
          );
        })}
        {/* 小地区气泡 */}
        {visibleAreaAnchors.map(({ anchor, point }) => {
          const fontSize = 9.5 * textScale;
          const bubbleWidth = anchor.name.length * fontSize + 8 * textScale;
          const bubbleHeight = 15 * textScale;
          return (
            <g key={anchor.name} aria-hidden="true" opacity={selectedRoute ? 0.35 : 1}>
              <rect
                x={point.x - bubbleWidth / 2}
                y={point.y - bubbleHeight / 2}
                width={bubbleWidth}
                height={bubbleHeight}
                rx={4 * textScale}
                fill="var(--background)"
                fillOpacity="0.88"
                stroke="#b8c4d8"
                strokeWidth={1 * textScale}
              />
              <text
                x={point.x}
                y={point.y}
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize={fontSize}
                fill="#4a5a75"
              >
                {anchor.name}
              </text>
            </g>
          );
        })}
        <text
          x={HARBOUR_LABEL.x}
          y={HARBOUR_LABEL.y}
          textAnchor="middle"
          dominantBaseline="middle"
          fontSize={11 * textScale}
          fill="#5a8fa8"
          stroke={SEA_COLOR}
          strokeWidth={3 * textScale}
          strokeLinejoin="round"
          paintOrder="stroke fill"
          aria-hidden="true"
        >
          维多利亚港
        </text>

        {visibleSegments.map((segment) => {
          const line = lineById.get(segment.lineId);
          return (
            <path
              key={`${segment.from}|${segment.to}|${segment.lineId}`}
              d={segmentRenderPath(segment, textScale)}
              fill="none"
              stroke={line?.color}
              strokeWidth="3.5"
              strokeLinecap={segment.special ? "butt" : "round"}
              strokeLinejoin="round"
              strokeDasharray={segment.special ? "4 4" : undefined}
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
                d={segmentRenderPath(segment, textScale)}
                fill="none"
                stroke="var(--background)"
                strokeWidth="7"
                strokeLinecap={segment.special ? "butt" : "round"}
                strokeLinejoin="round"
                strokeDasharray={segment.special ? "4 4" : undefined}
                vectorEffect="non-scaling-stroke"
              />
              <path
                d={segmentRenderPath(segment, textScale)}
                fill="none"
                stroke={line.color}
                strokeWidth="4.5"
                strokeLinecap={segment.special ? "butt" : "round"}
                strokeLinejoin="round"
                strokeDasharray={segment.special ? "4 4" : undefined}
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
            scale={textScale}
          />
        ))}

        {declutteredStations.map((station) => (
          <text
            key={`label-${station.id}`}
            x={station.position.x + (station.label.x - station.position.x) * textScale}
            y={station.position.y + (station.label.y - station.position.y) * textScale}
            textAnchor={station.label.anchor}
            dominantBaseline="middle"
            fill="var(--foreground)"
            stroke={SEA_COLOR}
            strokeWidth={3 * textScale}
            strokeLinejoin="round"
            paintOrder="stroke fill"
            fontSize={12 * textScale}
            fontWeight={selectedStationId === station.id ? 500 : 400}
            opacity={
              selectedRoute && selectedStationId !== station.id ? 0.35 : 1
            }
          >
            {station.nameZh}
          </text>
        ))}

        <text
          x={originStation.position.x - 16 * textScale}
          y={originStation.position.y - 12 * textScale}
          textAnchor="end"
          dominantBaseline="middle"
          fill="var(--food-map-cu)"
          stroke={SEA_COLOR}
          strokeWidth={3 * textScale}
          strokeLinejoin="round"
          paintOrder="stroke fill"
          fontSize={11 * textScale}
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
              getHkDistrict(station.districtId).nameZh
            }，${station.minutes} 分钟${
              station.service === "special-event" ? "，特别班次" : ""
            }`}
            onClick={() => onSelectStation(station.id)}
            className={[
              "pointer-events-auto absolute -translate-x-1/2 -translate-y-1/2 touch-manipulation rounded-full",
              "focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-[#672d7e]/45",
            ].join(" ")}
            style={{
              width: hitSize,
              height: hitSize,
              left: `${((station.position.x - frame.x) / frame.width) * 100}%`,
              top: `${((station.position.y - frame.y) / frame.height) * 100}%`,
            }}
          />
        ))}
      </div>

      {selectedStation ? (
        <div
          className="pointer-events-none absolute z-10"
          role="status"
          aria-label="选中车站"
          style={{
            left: `${((selectedStation.position.x - frame.x) / frame.width) * 100}%`,
            top: `${((selectedStation.position.y - frame.y) / frame.height) * 100}%`,
          }}
        >
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2">
            <div className="rounded-xl border border-border bg-background px-3 py-1.5 text-center shadow-lg">
              <p className="whitespace-nowrap text-sm font-medium">
                {selectedStation.nameZh}
                <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                  {selectedStation.minutes} 分钟
                </span>
              </p>
              <p className="whitespace-nowrap text-xs text-muted-foreground">
                {getHkDistrict(selectedStation.districtId).nameZh} ·{" "}
                {selectedStation.areaZh}
              </p>
            </div>
            <div className="mx-auto h-2 w-2 -translate-y-px rotate-45 border-b border-r border-border bg-background" />
          </div>
        </div>
      ) : null}

      <div
        className="absolute right-2 top-2 flex flex-col gap-1.5"
        role="group"
        aria-label="缩放控制"
      >
        {(
          [
            { label: "放大", text: "+", action: () => zoomBy(0.7) },
            { label: "缩小", text: "−", action: () => zoomBy(1 / 0.7) },
            { label: "重置视野", text: "⌂", action: () => setFrame(preset) },
          ] as const
        ).map((control) => (
          <button
            key={control.label}
            type="button"
            aria-label={control.label}
            onClick={control.action}
            className={[
              "h-11 w-11 touch-manipulation rounded-lg border border-border bg-background/90 text-base font-medium shadow-sm",
              "transition-[background-color,transform] motion-reduce:transition-none active:scale-[0.95]",
              "hover:bg-muted focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
            ].join(" ")}
          >
            {control.text}
          </button>
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
        <p className="mt-0.5 text-xs text-muted-foreground">
          {getHkDistrict(station.districtId).nameZh} · {station.areaZh}
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
      <div className="mt-1.5">
        <DistrictLegend stations={getReachableStations(budget)} />
      </div>

      <div className="mt-2">
        <MtrSchematic
          key={budget}
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
