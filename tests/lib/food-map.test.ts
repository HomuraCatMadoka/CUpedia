import { describe, expect, it } from "vitest";
import {
  FOOD_MAP_BUDGETS,
  FOOD_MAP_ORIGIN_STATION_ID,
  FOOD_MAP_SOURCES,
  MTR_LINES,
  MTR_SEGMENTS,
  MTR_STATIONS,
  getReachableStations,
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

    expect(lineIds.size).toBe(MTR_LINES.length);
    expect(stationIds.size).toBe(MTR_STATIONS.length);
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
  });

  it("records official MTR sources and avoids dash glyphs in UI text", () => {
    expect(FOOD_MAP_SOURCES.map((source) => source.url)).toEqual([
      "https://www.mtr.com.hk/ch/customer/jp/index.php",
      "https://www.mtr.com.hk/ch/customer/services/system_map.html",
      "https://data.gov.hk/en-data/dataset/mtr-data-routes-fares-barrier-free-facilities",
      "https://www.mtr.com.hk/ch/customer/main/jp_cust_notice.html",
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
      ...MTR_STATIONS.flatMap((station) => [station.nameZh, station.nameEn]),
    ];
    expect(visibleText.every((text) => !/[–—]/u.test(text))).toBe(true);
  });
});
