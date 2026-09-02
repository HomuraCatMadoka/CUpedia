import type { CampusMapPointPrecision } from "@/db/schema";

declare const campusMapWgs84Position: unique symbol;
declare const campusMapAmapPosition: unique symbol;

type CoordinatePosition = readonly [longitude: number, latitude: number];
export type CampusMapWgs84Position = CoordinatePosition & {
  readonly [campusMapWgs84Position]: true;
};
export type CampusMapAmapPosition = CoordinatePosition & {
  readonly [campusMapAmapPosition]: true;
};
type CampusMapPositionPrecision = CampusMapPointPrecision;

/**
 * Versioned presentation projection measured against nine CUHK reference
 * points on 2026-08-25. It is suitable only for approximate campus points;
 * canonical facts remain WGS84.
 */
export const CAMPUS_MAP_AMAP_PROJECTION = {
  method: "cuhk-calibrated-offset",
  version: "2026-08-25-v1",
  precision: "approximate",
  offset: [0.004877, -0.002832] as CoordinatePosition,
  calibrationBounds: {
    west: 114.1965,
    east: 114.2179,
    south: 22.41,
    north: 22.4282,
  },
  // Slightly wider than the measured 3.19 m edge error, for reverse checks.
  reverseCalibrationMarginDegrees: 0.00005,
  maxObservedErrorMeters: 3.19,
  averageObservedErrorMeters: 1.973,
} as const;

function roundedCoordinate(value: number) {
  return Math.round(value * 1_000_000_000_000) / 1_000_000_000_000;
}

function isWorldPosition(position: CoordinatePosition) {
  return (
    Number.isFinite(position[0]) &&
    position[0] >= -180 &&
    position[0] <= 180 &&
    Number.isFinite(position[1]) &&
    position[1] >= -90 &&
    position[1] <= 90
  );
}

export function asWgs84Position(
  position: CoordinatePosition,
): CampusMapWgs84Position {
  if (!isWorldPosition(position))
    throw new RangeError("invalid WGS84 position");
  return [position[0], position[1]] as unknown as CampusMapWgs84Position;
}

export function asAmapPosition(
  position: CoordinatePosition,
): CampusMapAmapPosition {
  if (!isWorldPosition(position)) throw new RangeError("invalid AMap position");
  return [position[0], position[1]] as unknown as CampusMapAmapPosition;
}

function isInsideCampusCalibration(
  position: CampusMapWgs84Position,
  margin = 0,
) {
  const { west, east, south, north } =
    CAMPUS_MAP_AMAP_PROJECTION.calibrationBounds;
  return (
    position[0] >= west - margin &&
    position[0] <= east + margin &&
    position[1] >= south - margin &&
    position[1] <= north + margin
  );
}

type CampusMapLocalAmapProjection =
  | { status: "projected"; position: CampusMapAmapPosition }
  | { status: "requires-provider" };

/**
 * Projects only approximate WGS84 points inside the measured CUHK rectangle.
 * Every other point must be resolved by the provider or hidden fail-closed.
 */
export function projectCampusMapWgs84ToAmap(
  position: CampusMapWgs84Position,
  precision: CampusMapPositionPrecision,
): CampusMapLocalAmapProjection {
  if (precision === "precise") {
    return { status: "requires-provider" };
  }
  if (!isInsideCampusCalibration(position)) {
    return { status: "requires-provider" };
  }
  return {
    status: "projected",
    position: asAmapPosition([
      roundedCoordinate(position[0] + CAMPUS_MAP_AMAP_PROJECTION.offset[0]),
      roundedCoordinate(position[1] + CAMPUS_MAP_AMAP_PROJECTION.offset[1]),
    ]),
  };
}

type CampusMapLocalWgs84Projection =
  | { status: "projected"; position: CampusMapWgs84Position }
  | { status: "requires-provider" };

/** Projects an in-range AMap interaction back to approximate canonical WGS84. */
export function projectAmapPositionToWgs84(
  position: CampusMapAmapPosition,
): CampusMapLocalWgs84Projection {
  const canonical = asWgs84Position([
    roundedCoordinate(position[0] - CAMPUS_MAP_AMAP_PROJECTION.offset[0]),
    roundedCoordinate(position[1] - CAMPUS_MAP_AMAP_PROJECTION.offset[1]),
  ]);
  if (
    !isInsideCampusCalibration(
      canonical,
      CAMPUS_MAP_AMAP_PROJECTION.reverseCalibrationMarginDegrees,
    )
  ) {
    return { status: "requires-provider" };
  }
  return { status: "projected", position: canonical };
}
