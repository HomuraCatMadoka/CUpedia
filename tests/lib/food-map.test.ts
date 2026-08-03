import { describe, expect, it } from "vitest";
import { HK_DISTRICTS, getHkDistrict } from "@/lib/food-map/districts";
import { HK_DISTRICT_GEOMETRY } from "@/lib/food-map/hk-geometry";
import {
  FOOD_MAP_BUDGETS,
  FOOD_MAP_ORIGIN_STATION_ID,
  FOOD_MAP_SOURCES,
  MOCK_RESTAURANTS,
  MTR_LINES,
  MTR_SEGMENTS,
  MTR_STATIONS,
  getReachableStations,
  getRestaurantsForStation,
  type MtrStationId,
} from "@/lib/food-map/data";

describe("food map data", () => {
  it("uses the 10, 20 and 30 minute budget boundaries", () => {
    expect(FOOD_MAP_BUDGETS).toEqual([10, 20, 30]);
    expect(
      FOOD_MAP_BUDGETS.map((budget) => getReachableStations(budget).length),
    ).toEqual([7, 17, 43]);
    expect(MTR_LINES.map((line) => line.id)).toEqual([
      "EAL",
      "TML",
      "KTL",
      "TWL",
    ]);

    const within10 = new Set(
      getReachableStations(10).map((station) => station.id),
    );
    expect(within10.has("TAW")).toBe(true);
    expect(within10.has("KOT")).toBe(false);

    const within20 = new Set(
      getReachableStations(20).map((station) => station.id),
    );
    expect(within20.has("HUH")).toBe(true);
    expect(within20.has("DIH")).toBe(true);
    expect(within20.has("LOW")).toBe(false);
    expect(within20.has("SHM")).toBe(false);

    expect(getReachableStations(30)).toHaveLength(MTR_STATIONS.length);
  });

  it("keeps ids and cross references unique and valid", () => {
    const lineIds = new Set(MTR_LINES.map((line) => line.id));
    const stationIds = new Set(MTR_STATIONS.map((station) => station.id));
    const restaurantIds = new Set(
      MOCK_RESTAURANTS.map((restaurant) => restaurant.id),
    );

    expect(lineIds.size).toBe(MTR_LINES.length);
    expect(stationIds.size).toBe(MTR_STATIONS.length);
    expect(restaurantIds.size).toBe(MOCK_RESTAURANTS.length);
    expect(stationIds.has(FOOD_MAP_ORIGIN_STATION_ID)).toBe(true);

    for (const station of MTR_STATIONS) {
      expect(station.position.x).toBeGreaterThanOrEqual(0);
      expect(station.position.x).toBeLessThanOrEqual(480);
      expect(station.position.y).toBeGreaterThanOrEqual(0);
      expect(station.position.y).toBeLessThanOrEqual(885);
      for (const lineId of station.lineIds) {
        expect(lineIds.has(lineId), `${station.id}: ${lineId}`).toBe(true);
      }
    }

    const segmentKeys = new Set<string>();
    for (const segment of MTR_SEGMENTS) {
      expect(stationIds.has(segment.from), segment.from).toBe(true);
      expect(stationIds.has(segment.to), segment.to).toBe(true);
      expect(lineIds.has(segment.lineId), segment.lineId).toBe(true);
      expect(segment.from).not.toBe(segment.to);
      expect(
        MTR_STATIONS.find((station) => station.id === segment.from)?.lineIds,
      ).toContain(segment.lineId);
      expect(
        MTR_STATIONS.find((station) => station.id === segment.to)?.lineIds,
      ).toContain(segment.lineId);

      const key = `${segment.lineId}:${segment.from}:${segment.to}`;
      expect(segmentKeys.has(key)).toBe(false);
      segmentKeys.add(key);
    }

    for (const restaurant of MOCK_RESTAURANTS) {
      expect(stationIds.has(restaurant.stationId), restaurant.id).toBe(true);
    }
  });

  it("assigns every station a valid district and area", () => {
    const districtIds = new Set(HK_DISTRICTS.map((district) => district.id));
    expect(districtIds.size).toBe(HK_DISTRICTS.length);

    expect(HK_DISTRICT_GEOMETRY).toHaveLength(HK_DISTRICTS.length);
    for (const geometry of HK_DISTRICT_GEOMETRY) {
      expect(districtIds.has(geometry.id as never), geometry.id).toBe(true);
      expect(geometry.path.startsWith("M"), geometry.id).toBe(true);
    }

    for (const station of MTR_STATIONS) {
      expect(districtIds.has(station.districtId), station.id).toBe(true);
      expect(station.areaZh.length, station.id).toBeGreaterThan(0);
      expect(getHkDistrict(station.districtId).nameZh).toMatch(/区$/u);
    }

    const byId = new Map(MTR_STATIONS.map((station) => [station.id, station]));
    expect(byId.get("HOM")?.districtId).toBe("ktc");
    expect(byId.get("HOM")?.areaZh).toBe("何文田");
    expect(byId.get("UNI")?.districtId).toBe("st");
    expect(byId.get("UNI")?.areaZh).toBe("马料水");
    expect(byId.get("ADM")?.districtId).toBe("cw");
    expect(byId.get("LMC")?.districtId).toBe("yl");
    expect(byId.get("EXC")?.districtId).toBe("wc");
    // 车公庙站在沙田头，第一城站在沙田第一城（不可互换）
    expect(byId.get("CKT")?.areaZh).toBe("沙田头");
    expect(byId.get("CIO")?.areaZh).toBe("沙田第一城");
  });

  it("places stations at geographically sane projected positions", () => {
    const byId = new Map(MTR_STATIONS.map((station) => [station.id, station]));
    const north = (a: MtrStationId, b: MtrStationId) =>
      expect(byId.get(a)!.position.y).toBeLessThan(byId.get(b)!.position.y);
    const west = (a: MtrStationId, b: MtrStationId) =>
      expect(byId.get(a)!.position.x).toBeLessThan(byId.get(b)!.position.x);

    north("LOW", "FAN"); // 罗湖在粉岭以北
    north("FAN", "UNI"); // 粉岭在大学以北
    north("HUH", "ADM"); // 红磡在金钟以北（港岛在南）
    west("LCK", "MOK"); // 荔枝角在旺角以西
    west("MOK", "MOS"); // 旺角在马鞍山以西
    west("LMC", "LOW"); // 落马洲在罗湖以西
  });

  it("gives every station contextual mock restaurant data", () => {
    for (const station of MTR_STATIONS) {
      const restaurants = getRestaurantsForStation(station.id);
      expect(restaurants.length, station.id).toBeGreaterThan(0);
      expect(
        restaurants.every(
          (restaurant) =>
            restaurant.stationId === station.id &&
            restaurant.walkMinutes > 0 &&
            restaurant.note.length > 0,
        ),
      ).toBe(true);
    }
  });

  it("records official MTR sources and avoids dash glyphs in UI text", () => {
    expect(FOOD_MAP_SOURCES.map((source) => source.url)).toEqual([
      "https://www.mtr.com.hk/ch/customer/jp/index.php",
      "https://www.mtr.com.hk/ch/customer/services/system_map.html",
      "https://data.gov.hk/en-data/dataset/mtr-data-routes-fares-barrier-free-facilities",
      "https://www.mtr.com.hk/ch/customer/main/jp_cust_notice.html",
      "https://www.had.gov.hk",
      "https://www.openstreetmap.org/copyright",
    ]);
    expect(
      FOOD_MAP_SOURCES.every((source) => source.accessedOn === "2026-07-30"),
    ).toBe(true);

    const visibleText = [
      ...FOOD_MAP_SOURCES.flatMap((source) => [
        source.title,
        source.publisher,
        source.scope,
      ]),
      ...MTR_LINES.flatMap((line) => [line.nameZh, line.nameEn]),
      ...MTR_STATIONS.flatMap((station) => [
        station.nameZh,
        station.nameEn,
        station.areaZh,
      ]),
      ...HK_DISTRICTS.map((district) => district.nameZh),
      ...MOCK_RESTAURANTS.flatMap((restaurant) => [
        restaurant.name,
        restaurant.cuisine,
        restaurant.note,
      ]),
    ];
    expect(visibleText.every((text) => !/[–—]/u.test(text))).toBe(true);
  });
});
