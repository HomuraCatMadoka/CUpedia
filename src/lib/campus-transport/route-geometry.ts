import type {
  CampusBusRouteMap,
  LngLat,
} from "@/lib/campus-transport/campus-bus";

type RouteGeometry = CampusBusRouteMap["geometry"];

/** 球面两点距离（haversine），单位米。 */
function haversineDistance(from: LngLat, to: LngLat) {
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

/** 把 MultiLineString / LineString 几何展开为按序排列的折线点列，去掉相邻重复点。 */
export function flattenRouteGeometry(
  geometry: RouteGeometry,
): LngLat[] {
  if (geometry.type !== "Feature") return [];
  const inner = geometry.geometry;
  if (!inner) return [];
  const lines =
    inner.type === "MultiLineString"
      ? inner.coordinates
      : inner.type === "LineString"
        ? [inner.coordinates]
        : [];
  const flattened: LngLat[] = [];
  for (const line of lines) {
    for (const [longitude, latitude] of line) {
      const point: LngLat = [longitude, latitude];
      const previous = flattened[flattened.length - 1];
      if (
        !previous ||
        previous[0] !== point[0] ||
        previous[1] !== point[1]
      ) {
        flattened.push(point);
      }
    }
  }
  return flattened;
}

export type ArcLength = {
  cumulative: number[];
  total: number;
};

/** 计算折线逐顶点累计弧长（米）。 */
export function computeCumulativeArcLength(
  points: LngLat[],
): ArcLength {
  const cumulative: number[] = [0];
  let total = 0;
  for (let index = 1; index < points.length; index += 1) {
    total += haversineDistance(points[index - 1]!, points[index]!);
    cumulative.push(total);
  }
  return { cumulative, total };
}

/** 按沿线里程（米）在折线上线性插值出经纬度；沿程边界自动 clamp。 */
export function interpolateAlongPolyline(
  points: LngLat[],
  cumulative: number[],
  along: number,
): LngLat {
  if (points.length === 0) return [0, 0];
  if (along <= 0) return points[0]!;
  if (along >= cumulative[cumulative.length - 1]!) return points.at(-1)!;

  let segmentIndex = 0;
  while (
    segmentIndex < cumulative.length - 2 &&
    along > cumulative[segmentIndex + 1]!
  ) {
    segmentIndex += 1;
  }
  const start = points[segmentIndex]!;
  const end = points[segmentIndex + 1]!;
  const segmentLength =
    cumulative[segmentIndex + 1]! - cumulative[segmentIndex]!;
  const ratio =
    segmentLength > 0
      ? (along - cumulative[segmentIndex]!) / segmentLength
      : 0;
  return [
    start[0] + (end[0] - start[0]) * ratio,
    start[1] + (end[1] - start[1]) * ratio,
  ];
}

export type NearestOnPolyline = {
  along: number;
  point: LngLat | null;
};

/** 折线上离给定坐标最近的点（沿线里程 + 经纬度）。 */
export function nearestPointOnPolyline(
  points: LngLat[],
  cumulative: number[],
  coordinates: LngLat,
): NearestOnPolyline {
  if (points.length === 0) return { along: 0, point: null };
  if (points.length === 1) return { along: 0, point: points[0]! };

  let best: NearestOnPolyline = {
    along: 0,
    point: points[0]!,
  };
  let bestDistance = Infinity;

  for (let index = 0; index < points.length - 1; index += 1) {
    const start = points[index]!;
    const end = points[index + 1]!;
    const segmentLength =
      cumulative[index + 1]! - cumulative[index]!;

    // 垂足投影比例（clamp 到 [0,1]）
    const dx = end[0] - start[0];
    const dy = end[1] - start[1];
    const projection =
      segmentLength === 0
        ? 0
        : Math.max(
            0,
            Math.min(
              1,
              ((coordinates[0] - start[0]) * dx +
                (coordinates[1] - start[1]) * dy) /
                (dx * dx + dy * dy),
            ),
          );
    const point: LngLat = [
      start[0] + dx * projection,
      start[1] + dy * projection,
    ];
    const distance = haversineDistance(coordinates, point);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = {
        along: cumulative[index]! + segmentLength * projection,
        point,
      };
    }
  }
  return best;
}
