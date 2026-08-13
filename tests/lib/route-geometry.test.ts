import { describe, expect, it } from "vitest";
import type { GeoJSONSourceSpecification } from "maplibre-gl";

import {
  computeCumulativeArcLength,
  flattenRouteGeometry,
  interpolateAlongPolyline,
  nearestPointOnPolyline,
} from "@/lib/campus-transport/route-geometry";

// ref #601 — vehicle positions along the existing purple route geometry.
// The geometry is a MultiLineString (OSM relation); flattening joins the
// segments in order and drops adjacent duplicate vertices (the polyline is a
// closed loop, so the first and last points coincide).

type TestGeometry = GeoJSONSourceSpecification["data"];

function lineString(coordinates: number[][]): TestGeometry {
  return {
    type: "Feature",
    properties: {},
    geometry: {
      type: "LineString",
      coordinates,
    },
  };
}

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

describe("flattenRouteGeometry", () => {
  it("joins MultiLineString segments in order and drops adjacent duplicates", () => {
    const geometry = multiLineString([
      [
        [0, 0],
        [0, 1],
      ],
      [
        [0, 1],
        [0, 2],
      ],
      [
        [0, 2],
        [1, 2],
      ],
    ]);
    expect(flattenRouteGeometry(geometry)).toEqual([
      [0, 0],
      [0, 1],
      [0, 2],
      [1, 2],
    ]);
  });

  it("passes a LineString through unchanged after dedupe", () => {
    const geometry = lineString([
      [0, 0],
      [0, 0],
      [1, 1],
    ]);
    expect(flattenRouteGeometry(geometry)).toEqual([
      [0, 0],
      [1, 1],
    ]);
  });

  it("handles a single-segment MultiLineString", () => {
    const geometry = multiLineString([
      [
        [0, 0],
        [1, 1],
      ],
    ]);
    expect(flattenRouteGeometry(geometry)).toEqual([
      [0, 0],
      [1, 1],
    ]);
  });

  it("returns an empty array for empty geometry", () => {
    expect(flattenRouteGeometry(multiLineString([]))).toEqual([]);
  });
});

describe("computeCumulativeArcLength", () => {
  it("accumulates haversine distances from the first point", () => {
    // 1 degree of longitude at the equator ≈ 111,195 m (mean radius 6371 km)
    const points: [number, number][] = [
      [0, 0],
      [1, 0],
      [2, 0],
    ];
    const { cumulative, total } = computeCumulativeArcLength(points);
    expect(cumulative[0]).toBe(0);
    expect(cumulative[1]).toBeCloseTo(111_195, 0);
    expect(total).toBeCloseTo(222_390, 0);
  });

  it("returns zero total for a single point", () => {
    const { total } = computeCumulativeArcLength([[0, 0]]);
    expect(total).toBe(0);
  });

  it("returns zero total for empty input", () => {
    const { total } = computeCumulativeArcLength([]);
    expect(total).toBe(0);
  });
});

describe("interpolateAlongPolyline", () => {
  const points: [number, number][] = [
    [0, 0],
    [0, 1],
    [0, 2],
  ];
  const { cumulative } = computeCumulativeArcLength(points);

  it("returns the first point at along=0", () => {
    expect(interpolateAlongPolyline(points, cumulative, 0)).toEqual([0, 0]);
  });

  it("returns the last point at along=total", () => {
    const { total } = computeCumulativeArcLength(points);
    expect(interpolateAlongPolyline(points, cumulative, total)).toEqual([0, 2]);
  });

  it("interpolates linearly between vertices", () => {
    const { cumulative } = computeCumulativeArcLength([
      [0, 0],
      [0, 1],
    ]);
    const mid = interpolateAlongPolyline(
      [
        [0, 0],
        [0, 1],
      ],
      cumulative,
      cumulative[1] / 2,
    );
    expect(mid[0]).toBeCloseTo(0, 6);
    expect(mid[1]).toBeCloseTo(0.5, 6);
  });
});

describe("nearestPointOnPolyline", () => {
  const points: [number, number][] = [
    [0, 0],
    [0, 1],
    [0, 2],
  ];
  const { cumulative } = computeCumulativeArcLength(points);

  it("clamps to the nearest endpoint when the point is beyond the polyline", () => {
    const result = nearestPointOnPolyline(points, cumulative, [0, 5]);
    expect(result.along).toBeCloseTo(cumulative[2], 6);
    expect(result.point?.[1]).toBeCloseTo(2, 6);
  });

  it("finds the perpendicular projection on a segment", () => {
    // Point (0.5, 0.5) is vertically above the middle of segment (0,0)-(0,1)
    const result = nearestPointOnPolyline(points, cumulative, [0.5, 0.5]);
    expect(result.point?.[0]).toBeCloseTo(0, 6);
    expect(result.point?.[1]).toBeCloseTo(0.5, 6);
    expect(result.along).toBeCloseTo(cumulative[1] / 2, 2);
  });

  it("returns the first point for an empty polyline with along 0", () => {
    const result = nearestPointOnPolyline([], [], [1, 1]);
    expect(result).toEqual({ along: 0, point: null });
  });
});
