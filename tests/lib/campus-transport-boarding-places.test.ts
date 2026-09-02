import { describe, expect, it } from "vitest";

import {
  hongKongWallTimeToEpoch,
  toCampusBusPassengerRoute,
  type CampusBusPassengerRoute,
} from "@/lib/campus-transport/campus-bus";
import {
  buildCampusBusBoardingPlaces,
  campusBusDistanceInMeters,
  filterCampusBusBoardingPlaces,
  findNearbyCampusBusBoardingPlaces,
  formatApproximateCampusBusDistance,
  getCampusBusBoardingPlaceRouteBoards,
} from "@/lib/campus-transport/boarding-places";
import {
  campusBusRoutes,
  getCampusBusRoute,
} from "@/lib/campus-transport/routes-data";

function hkt(hour: number, minute: number) {
  return hongKongWallTimeToEpoch({
    day: 11,
    hour,
    minute,
    month: 8,
    year: 2026,
  });
}

describe("campus bus Boarding places", () => {
  const routes = campusBusRoutes.map(toCampusBusPassengerRoute);

  it("aggregates the same reviewed Stop across Routes and reverses every occurrence", () => {
    const places = buildCampusBusBoardingPlaces(routes);
    const universityStation = places.find(
      (place) => place.id === "stop:cuhk-wp-stop-2552",
    )!;

    expect(universityStation.nameZhHant).toBe("大學站");
    expect(universityStation.stopIds).toEqual(["cuhk-wp-stop-2552"]);
    expect(
      new Set(
        universityStation.stopOccurrences.map(
          (occurrence) => occurrence.routeId,
        ),
      ),
    ).toEqual(new Set(["1a", "2", "2s", "4", "8", "n", "h"]));
    expect(
      universityStation.stopOccurrences.filter(
        (occurrence) => occurrence.routeId === "1a",
      ),
    ).toEqual([
      expect.objectContaining({
        patternIds: expect.arrayContaining(["1a:default"]),
        stopId: "cuhk-wp-stop-2552",
        stopOccurrenceId: "cuhk-wp-stop-2552#1",
      }),
      expect.objectContaining({
        patternIds: expect.arrayContaining(["1a:default"]),
        stopId: "cuhk-wp-stop-2552",
        stopOccurrenceId: "cuhk-wp-stop-2552#2",
      }),
    ]);
  });

  it("does not merge different directional Stops just because names are related", () => {
    const places = buildCampusBusBoardingPlaces(routes);

    expect(
      places.find((place) => place.nameZhHant === "聯合書院（上行）")?.id,
    ).toBe("stop:cuhk-wp-stop-2816");
    expect(
      places.find((place) => place.nameZhHant === "聯合書院（下行）")?.id,
    ).toBe("stop:cuhk-wp-stop-2818");
  });

  it("searches names without location and keeps missing-coordinate places usable", () => {
    const route = structuredClone(
      toCampusBusPassengerRoute(getCampusBusRoute("2")!),
    ) as CampusBusPassengerRoute;
    route.map.stopCoordinates = {};
    const places = buildCampusBusBoardingPlaces([route]);

    expect(filterCampusBusBoardingPlaces(places, "Univ. Station")).toEqual([
      expect.objectContaining({
        coordinates: null,
        id: "stop:cuhk-wp-stop-2552",
      }),
    ]);
    expect(filterCampusBusBoardingPlaces(places, "不存在")).toEqual([]);
  });

  it("labels origins as scheduled departures and intermediate stops as projections", () => {
    const places = buildCampusBusBoardingPlaces(routes);
    const universityStation = places.find(
      (place) => place.id === "stop:cuhk-wp-stop-2552",
    )!;
    const sportsCentre = places.find(
      (place) => place.id === "stop:cuhk-wp-stop-2546",
    )!;

    const origin = getCampusBusBoardingPlaceRouteBoards(
      universityStation,
      routes,
      hkt(7, 38),
    ).find(
      (board) =>
        board.routeId === "1a" &&
        board.stopOccurrenceId === "cuhk-wp-stop-2552#1",
    );
    const intermediate = getCampusBusBoardingPlaceRouteBoards(
      sportsCentre,
      routes,
      hkt(7, 38),
    ).find((board) => board.routeId === "1a");

    expect(origin).toMatchObject({
      nextTimeKind: "origin_departure",
      repeatedStopIndex: 1,
      repeatedStopTotal: 2,
    });
    expect(intermediate).toMatchObject({
      nextTimeKind: "arrival_projection",
      repeatedStopIndex: null,
      repeatedStopTotal: 1,
    });
  });

  it("sorts coordinate-bearing places by straight-line distance without selecting a Stop", () => {
    const places = buildCampusBusBoardingPlaces(routes);
    const origin = places.find(
      (place) => place.id === "stop:cuhk-wp-stop-2552",
    )!.coordinates!;
    const nearby = findNearbyCampusBusBoardingPlaces(places, origin, 500);

    expect(nearby[0]).toMatchObject({
      distanceMeters: 0,
      place: { id: "stop:cuhk-wp-stop-2552" },
    });
    expect(nearby.map((item) => item.distanceMeters)).toEqual(
      [...nearby.map((item) => item.distanceMeters)].sort(
        (left, right) => left - right,
      ),
    );
    expect(formatApproximateCampusBusDistance(123)).toBe("約 120 米");
    expect(campusBusDistanceInMeters(origin, origin)).toBe(0);
    expect(nearby[0]?.place.stopOccurrences.length).toBeGreaterThan(1);
  });
});
