export type CampusMapPosition = readonly [longitude: number, latitude: number];

/** Translates an AMap GCJ-02 point through the measured projection offset. */
export function providerPositionToWgs84(
  providerPosition: CampusMapPosition,
  providerOffset: CampusMapPosition,
): CampusMapPosition {
  return [
    providerPosition[0] - providerOffset[0],
    providerPosition[1] - providerOffset[1],
  ];
}
