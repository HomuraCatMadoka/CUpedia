import { describe, expect, it } from "vitest";
import type { GeoJSONSourceSpecification } from "maplibre-gl";

import { campusBusRoutes } from "@/lib/campus-transport/routes-data";
import {
  buildStopAnchoredPath,
  interpolateAlongSegmentPath,
  type SegmentPath,
} from "@/lib/campus-transport/route-geometry";

// ref #601 — the raw MultiLineString geometry has duplicate segments and no
// guaranteed direction; stop-anchored graph reconstruction fixes both.

type TestGeometry = GeoJSONSourceSpecification["data"];

function multiLineString(lines: number[][][]): TestGeometry {
  return {
    type: "Feature",
    properties: {},
    geometry: {
      type: "MultiLineString",
      coordinates: lines,
    },
  };
}

// 正方形环线：4 段，其中第 4 段是第 1 段的重复（模拟 OSM 重复引用）
const SQUARE_LINES: number[][][] = [
  [
    [0, 0],
    [0, 1],
  ],
  [
    [0, 1],
    [1, 1],
  ],
  [
    [1, 1],
    [1, 0],
  ],
  [
    [1, 0],
    [0, 0],
  ],
  // 重复段（方向相反）
  [
    [0, 0],
    [1, 0],
  ],
];

const SQUARE_STOPS: [number, number][] = [
  [0, 0],
  [0, 1],
  [1, 1],
  [1, 0],
  [0, 0],
];

describe("buildStopAnchoredPath", () => {
  it("reconstructs a square loop ignoring the duplicate segment", () => {
    const path = buildStopAnchoredPath(multiLineString(SQUARE_LINES), SQUARE_STOPS);
    expect(path.segments).toHaveLength(4);
    for (const segment of path.segments) {
      expect(segment.totalLength).toBeGreaterThan(0);
    }
    // 第一段从 (0,0) 出发，沿 y 增方向（站序决定方向）
    const first = path.segments[0]!;
    expect(first.points[0]![0]).toBeCloseTo(0, 6);
    expect(first.points[0]![1]).toBeCloseTo(0, 6);
    expect(first.points.at(-1)![1]).toBeGreaterThan(0.5);
  });

  it("falls back to empty path when geometry has no segments", () => {
    const path = buildStopAnchoredPath(
      {
        type: "Feature",
        properties: {},
        geometry: { type: "LineString", coordinates: [] },
      },
      SQUARE_STOPS,
    );
    expect(path.segments).toHaveLength(0);
  });

  it("matches the verified 1A loop length", () => {
    const route = campusBusRoutes.find((c) => c.routeId === "1a")!;
    const stops = route.stops.map(
      (stop) => route.map.stopCoordinates[stop.id]!,
    );
    const path = buildStopAnchoredPath(route.map.geometry, stops);
    // Python 图重建验证值：总环线 2994m（±2%）
    const total = path.segments.reduce(
      (sum, segment) => sum + segment.totalLength,
      0,
    );
    expect(total).toBeGreaterThan(2_900);
    expect(total).toBeLessThan(3_100);
  });
});

describe("interpolateAlongSegmentPath", () => {
  it("interpolates within a segment and across segment boundaries", () => {
    // 正方形：每条边 1 单位（≈111km）
    const path: SegmentPath = buildStopAnchoredPath(
      multiLineString(SQUARE_LINES),
      SQUARE_STOPS,
    );
    const start = path.segments[0]!;
    const mid = interpolateAlongSegmentPath(path, start.totalLength / 2);
    expect(mid[0]).toBeCloseTo(0, 6);
    expect(mid[1]).toBeCloseTo(0.5, 2);

    // 跨越到第二条边（> 第一条边长度）
    const beyond = interpolateAlongSegmentPath(path, start.totalLength * 1.5);
    expect(beyond[0]).toBeGreaterThan(0);
  });

  it("clamps to the start and end", () => {
    const path: SegmentPath = buildStopAnchoredPath(
      multiLineString(SQUARE_LINES),
      SQUARE_STOPS,
    );
    const total = path.segments.reduce(
      (sum, segment) => sum + segment.totalLength,
      0,
    );
    const start = interpolateAlongSegmentPath(path, -10);
    const end = interpolateAlongSegmentPath(path, total + 10);
    expect(start[0]).toBeCloseTo(0, 6);
    expect(end[0]).toBeCloseTo(0, 6);
    expect(end[1]).toBeCloseTo(0, 6);
  });
});
