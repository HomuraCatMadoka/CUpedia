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

/**
 * 站间路径：每段是从一个站点到下一个站点的有序折线。
 *
 * OSM relation 的 MultiLineString 含重复段且不保证方向与站序一致，
 * 因此先把所有线段去重并构建无向图，再用 Dijkstra 按站序寻找相邻
 * 站点之间的最短路径——方向由站序锚定，彻底摆脱原始段序。
 */
export type SegmentPathSegment = {
  /** 本段按序排列的折线点列（不含上一段的终点）。 */
  points: LngLat[];
  /** 本段累计弧长（米）。 */
  cumulative: number[];
  /** 本段总长（米）。 */
  totalLength: number;
};

export type SegmentPath = {
  segments: SegmentPathSegment[];
};

type GraphVertex = {
  point: LngLat;
  key: string;
};

/** 顶点坐标四舍五入到微度，作为去重键。 */
function vertexKey(point: LngLat) {
  return `${Math.round(point[0] * 1e6)},${Math.round(point[1] * 1e6)}`;
}

/** 由折线点列构建累计弧长。 */
function cumulativeLengths(points: LngLat[]) {
  const cumulative: number[] = [0];
  let total = 0;
  for (let index = 1; index < points.length; index += 1) {
    total += haversineDistance(points[index - 1]!, points[index]!);
    cumulative.push(total);
  }
  return { cumulative, total };
}

/**
 * 按站序重建沿线路径。
 *
 * 1. 展开 MultiLineString/LineString 的所有线段
 * 2. 顶点去重 + 线段去重（同一条路被 OSM relation 引用两次只算一次）
 * 3. 无向图 + Dijkstra：每对相邻站点找最短路径
 * 4. 输出分段路径，每段为从站 k 到站 k+1 的折线
 */
export function buildStopAnchoredPath(
  geometry: RouteGeometry,
  stops: readonly LngLat[],
): SegmentPath {
  if (geometry.type !== "Feature" || stops.length < 2) {
    return { segments: [] };
  }
  const inner = geometry.geometry;
  if (!inner) return { segments: [] };
  const lines =
    inner.type === "MultiLineString"
      ? inner.coordinates
      : inner.type === "LineString"
        ? [inner.coordinates]
        : [];
  if (lines.length === 0) return { segments: [] };

  // 顶点去重 + 无向图构建
  const vertices = new Map<string, GraphVertex>();
  const adjacency = new Map<string, Map<string, number>>();
  const getVertex = (point: LngLat): GraphVertex => {
    const key = vertexKey(point);
    let vertex = vertices.get(key);
    if (!vertex) {
      vertex = { point, key };
      vertices.set(key, vertex);
      adjacency.set(key, new Map());
    }
    return vertex;
  };
  const addEdge = (from: GraphVertex, to: GraphVertex) => {
    const distance = haversineDistance(from.point, to.point);
    if (distance === 0) return;
    adjacency.get(from.key)!.set(to.key, distance);
    adjacency.get(to.key)!.set(from.key, distance);
  };

  for (const line of lines) {
    let previous: GraphVertex | null = null;
    for (const [longitude, latitude] of line) {
      const vertex = getVertex([longitude, latitude]);
      if (previous && previous.key !== vertex.key) {
        addEdge(previous, vertex);
      }
      previous = vertex;
    }
  }

  // 站坐标 → 最近图顶点
  const nearestVertex = (coordinates: LngLat): GraphVertex | null => {
    let best: GraphVertex | null = null;
    let bestDistance = Infinity;
    for (const vertex of vertices.values()) {
      const distance = haversineDistance(coordinates, vertex.point);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = vertex;
      }
    }
    return best;
  };

  // Dijkstra：返回从 start 到 end 的顶点 key 序列
  const shortestPath = (
    start: string,
    end: string,
  ): string[] | null => {
    if (start === end) return [start];
    const distances = new Map<string, number>([[start, 0]]);
    const previous = new Map<string, string>();
    const queue = new Set<string>([start]);
    while (queue.size > 0) {
      let current: string | null = null;
      let currentDistance = Infinity;
      for (const key of queue) {
        const distance = distances.get(key) ?? Infinity;
        if (distance < currentDistance) {
          currentDistance = distance;
          current = key;
        }
      }
      if (!current) break;
      queue.delete(current);
      if (current === end) break;
      for (const [neighbor, weight] of adjacency.get(current)!) {
        const candidate = currentDistance + weight;
        if (candidate < (distances.get(neighbor) ?? Infinity)) {
          distances.set(neighbor, candidate);
          previous.set(neighbor, current);
          queue.add(neighbor);
        }
      }
    }
    if (!previous.has(end)) return null;
    const path: string[] = [];
    let cursor: string | undefined = end;
    while (cursor) {
      path.unshift(cursor);
      cursor = previous.get(cursor);
    }
    return path;
  };

  // 逐站构建分段路径
  const segments: SegmentPathSegment[] = [];
  for (let index = 0; index < stops.length - 1; index += 1) {
    const from = nearestVertex(stops[index]!);
    const to = nearestVertex(stops[index + 1]!);
    if (!from || !to) continue;
    const keys = shortestPath(from.key, to.key);
    if (!keys) continue;
    const points = keys
      .map((key) => vertices.get(key)!.point)
      .filter(
        (point, pointIndex, all) =>
          pointIndex === 0 ||
          pointIndex === all.length - 1 ||
          point[0] !== all[pointIndex - 1]![0] ||
          point[1] !== all[pointIndex - 1]![1],
      );
    if (points.length < 2) continue;
    const { cumulative, total } = cumulativeLengths(points);
    segments.push({ points, cumulative, totalLength: total });
  }

  return { segments };
}

/** 在分段路径上按累计里程插值（跨段连续），边界自动 clamp。 */
export function interpolateAlongSegmentPath(
  path: SegmentPath,
  along: number,
): LngLat {
  const segments = path.segments;
  if (segments.length === 0) return [0, 0];

  let remaining = along;
  for (const segment of segments) {
    if (remaining <= segment.totalLength) {
      return interpolateAlongPolyline(
        segment.points,
        segment.cumulative,
        remaining,
      );
    }
    remaining -= segment.totalLength;
  }
  const last = segments.at(-1)!;
  return last.points.at(-1)!;
}
