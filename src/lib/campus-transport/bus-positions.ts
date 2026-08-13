import type {
  CampusBusPassengerRoute,
  LngLat,
} from "@/lib/campus-transport/campus-bus";
import { scheduledDeparturesForDate } from "@/lib/campus-transport/campus-bus";
import {
  busTripTimeline,
  positionAlongSegment,
  solveTrapezoidProfile,
} from "@/lib/campus-transport/bus-kinematics";
import {
  computeCumulativeArcLength,
  flattenRouteGeometry,
  interpolateAlongPolyline,
  nearestPointOnPolyline,
} from "@/lib/campus-transport/route-geometry";

export const BUS_ACCELERATION_METERS_PER_SECOND_SQUARED = 0.8;
export const BUS_DWELL_MILLISECONDS = 30_000;

export type BusPosition = {
  /** 班次发车时刻（epoch ms），用于区分同一路线上的多辆车。 */
  departureAt: number;
  /** 当前经纬度。 */
  position: LngLat;
  /** 是否正停在站点（含发车前/到站后停留）。 */
  atStop: boolean;
  /** 停留时所在站点 id（行驶中为 null）。 */
  stopId: string | null;
  /** 当前沿线里程（米）。 */
  along: number;
};

type RouteGeometryCache = {
  points: LngLat[];
  cumulative: number[];
  stopAlongs: number[];
};

const geometryCache = new WeakMap<object, RouteGeometryCache>();

function cachedGeometry(route: CampusBusPassengerRoute): RouteGeometryCache {
  const cached = geometryCache.get(route);
  if (cached) return cached;
  const points = flattenRouteGeometry(route.map.geometry);
  const { cumulative } = computeCumulativeArcLength(points);
  const stopAlongs = route.stops.map((stop) => {
    const coordinates = route.map.stopCoordinates[stop.id];
    if (!coordinates) return 0;
    return nearestPointOnPolyline(points, cumulative, coordinates).along;
  });
  const value = { points, cumulative, stopAlongs };
  geometryCache.set(route, value);
  return value;
}

/**
 * 计算指定时刻线路上所有在途班次的车辆位置。
 *
 * 每班次：发车时刻 departureAt + 逐站累计到站秒数（p50Seconds）构成时间轴；
 * 站间用梯形速度剖面（加速→匀速→减速）在沿线弧长上插值。
 */
export function computeBusPositions(
  route: CampusBusPassengerRoute,
  now: number,
  dwellMilliseconds = BUS_DWELL_MILLISECONDS,
): BusPosition[] {
  const geometry = cachedGeometry(route);
  if (geometry.points.length === 0) return [];

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
          route.map.stopCoordinates[stop.id] ?? geometry.points[0]!,
        atStop: true,
        stopId: stop.id,
        along: geometry.stopAlongs[segmentIndex + 1] ?? 0,
      });
      continue;
    }

    // 行驶中：站 segmentIndex → segmentIndex+1
    const lengthMeters =
      (geometry.stopAlongs[segmentIndex + 1] ?? 0) -
      (geometry.stopAlongs[segmentIndex] ?? 0);
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
      position: interpolateAlongPolyline(geometry.points, geometry.cumulative, along),
      atStop: false,
      stopId: null,
      along,
    });
  }

  return positions;
}
