import type {
  CampusBusPassengerRoute,
  LngLat,
} from "@/lib/campus-transport/campus-bus";
import { scheduledDeparturesForDate } from "@/lib/campus-transport/campus-bus";
import {
  busTripTimeline,
  BUS_DWELL_MILLISECONDS,
  positionAlongSegment,
  solveTrapezoidProfile,
} from "@/lib/campus-transport/bus-kinematics";
import {
  buildStopAnchoredPath,
  interpolateAlongSegmentPath,
  type SegmentPath,
} from "@/lib/campus-transport/route-geometry";

export const BUS_ACCELERATION_METERS_PER_SECOND_SQUARED = 0.8;

export type BusPosition = {
  /** 班次发车时刻（epoch ms），用于区分同一路线上的多辆车。 */
  departureAt: number;
  /** 当前经纬度。 */
  position: LngLat;
  /** 是否正停在站点（含发车前/到站后停留）。 */
  atStop: boolean;
  /** 停留时所在站点 id（行驶中为 null）。 */
  stopId: string | null;
  /** 当前沿线里程（米，从首站起累计）。 */
  along: number;
};

type RouteGeometryCache = {
  /** 站序锚定的分段路径（站 k → 站 k+1）。 */
  path: SegmentPath;
  /** 各站沿全程的累计里程（米）。 */
  stopAlongs: number[];
  /** 全程总长（米）。 */
  totalLength: number;
};

const geometryCache = new WeakMap<object, RouteGeometryCache>();

function cachedGeometry(route: CampusBusPassengerRoute): RouteGeometryCache {
  const cached = geometryCache.get(route);
  if (cached) return cached;
  const stops = route.stops.map(
    (stop) => route.map.stopCoordinates[stop.id]!,
  );
  const path = buildStopAnchoredPath(route.map.geometry, stops);
  const stopAlongs: number[] = [0];
  for (const segment of path.segments) {
    stopAlongs.push(
      stopAlongs[stopAlongs.length - 1]! + segment.totalLength,
    );
  }
  const totalLength = stopAlongs[stopAlongs.length - 1]!;
  const value = { path, stopAlongs, totalLength };
  geometryCache.set(route, value);
  return value;
}

/**
 * 计算指定时刻线路上所有在途班次的车辆位置。
 *
 * 每班次：发车时刻 departureAt + 逐站累计到站秒数（p50Seconds）构成时间轴；
 * 站间用梯形速度剖面（加速→匀速→减速）在站序锚定的沿线弧长上插值。
 */
export function computeBusPositions(
  route: CampusBusPassengerRoute,
  now: number,
  dwellMilliseconds = BUS_DWELL_MILLISECONDS,
): BusPosition[] {
  const geometry = cachedGeometry(route);
  if (geometry.path.segments.length === 0) return [];

  const positions: BusPosition[] = [];
  for (const departure of scheduledDeparturesForDate(now, route)) {
    const { departureAt, pattern } = departure;
    const p50Seconds = pattern.projections.map((projection) => projection.p50Seconds);
    const { arrivals, leaves } = busTripTimeline(
      departureAt,
      p50Seconds,
      dwellMilliseconds,
    );
    if (arrivals.length < 2) continue;
    // 未发车（now < 首站发车时刻）或已收班（now > 末站到站时刻）都不渲染
    if (now < departureAt) continue;
    if (now > arrivals[arrivals.length - 1]!) continue;

    // 定位所在段：leave[k] <= now < leave[k+1]（k 为当前段起点站）
    let segmentIndex = 0;
    while (
      segmentIndex < leaves.length - 2 &&
      now >= leaves[segmentIndex + 1]!
    ) {
      segmentIndex += 1;
    }
    const segmentArrival = arrivals[segmentIndex + 1]!;
    const segmentLeave = leaves[segmentIndex + 1]!;

    if (now >= segmentArrival && now < segmentLeave) {
      // 停在段末站（到站后 dwell）
      const stop = route.stops[segmentIndex + 1]!;
      positions.push({
        departureAt,
        position:
          route.map.stopCoordinates[stop.id] ??
          geometry.path.segments[0]!.points[0]!,
        atStop: true,
        stopId: stop.id,
        along: geometry.stopAlongs[segmentIndex + 1] ?? 0,
      });
      continue;
    }

    // 行驶中：站 segmentIndex → segmentIndex+1
    const segment = geometry.path.segments[segmentIndex];
    if (!segment) continue;
    const lengthMeters = segment.totalLength;
    const travelSeconds = (arrivals[segmentIndex + 1]! - leaves[segmentIndex]!) / 1_000;
    const profile = solveTrapezoidProfile(
      lengthMeters,
      travelSeconds,
      BUS_ACCELERATION_METERS_PER_SECOND_SQUARED,
    );
    const elapsed = (now - leaves[segmentIndex]!) / 1_000;
    const distance = positionAlongSegment(elapsed, profile);
    const along =
      (geometry.stopAlongs[segmentIndex] ?? 0) + Math.min(distance, lengthMeters);
    positions.push({
      departureAt,
      position: interpolateAlongSegmentPath(geometry.path, along),
      atStop: false,
      stopId: null,
      along,
    });
  }

  return positions;
}
