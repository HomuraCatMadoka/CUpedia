import { describe, expect, it } from "vitest";

import {
  campusMapBuildingDisplayFor,
  projectCampusMapBuildingDisplay,
} from "@/lib/campus-map/building-display";

describe("Campus Map building display", () => {
  it("uses codes only to distinguish duplicate visible names", () => {
    const display = projectCampusMapBuildingDisplay([
      { buildingId: "science", name: "科学馆", code: "H10" },
      { buildingId: "ics", name: "中国文化研究所", code: "H4" },
      { buildingId: "museum", name: "文物馆", code: "H4" },
      {
        buildingId: "remote-west",
        name: "卫星遥感地面接收站",
        code: "H40",
      },
      {
        buildingId: "remote-east",
        name: "卫星遥感地面接收站",
        code: "E13",
      },
    ]);

    expect(campusMapBuildingDisplayFor(display, "science")?.label).toBe(
      "科学馆",
    );
    expect(campusMapBuildingDisplayFor(display, "ics")?.label).toBe(
      "中国文化研究所",
    );
    expect(campusMapBuildingDisplayFor(display, "museum")?.label).toBe(
      "文物馆",
    );
    expect(campusMapBuildingDisplayFor(display, "remote-west")?.label).toBe(
      "卫星遥感地面接收站（H40）",
    );
    expect(campusMapBuildingDisplayFor(display, "remote-east")?.label).toBe(
      "卫星遥感地面接收站（E13）",
    );
    expect(
      display.entries.map(({ buildingId, qualifier }) => [
        buildingId,
        qualifier,
      ]),
    ).toEqual([
      ["science", null],
      ["ics", null],
      ["museum", null],
      ["remote-west", "H40"],
      ["remote-east", "E13"],
    ]);
  });

  it("normalizes harmless name formatting before deciding ambiguity", () => {
    const display = projectCampusMapBuildingDisplay([
      { buildingId: "first", name: "Test  Building", code: "A1" },
      { buildingId: "second", name: " test building ", code: "A2" },
    ]);

    expect(campusMapBuildingDisplayFor(display, "first")?.qualifier).toBe("A1");
    expect(campusMapBuildingDisplayFor(display, "second")?.qualifier).toBe(
      "A2",
    );
  });

  it("falls back to unique English names when duplicate codes cannot distinguish records", () => {
    const display = projectCampusMapBuildingDisplay([
      {
        buildingId: "north",
        name: "测试楼",
        englishName: "North Test Building",
        code: "A1",
      },
      {
        buildingId: "south",
        name: "测试楼",
        englishName: "South Test Building",
        code: "A1",
      },
    ]);

    expect(campusMapBuildingDisplayFor(display, "north")?.label).toBe(
      "测试楼（North Test Building）",
    );
    expect(campusMapBuildingDisplayFor(display, "south")?.label).toBe(
      "测试楼（South Test Building）",
    );
  });

  it("falls back to a visible position when names and codes are still identical", () => {
    const display = projectCampusMapBuildingDisplay([
      {
        buildingId: "west-record",
        name: "测试楼",
        englishName: "Test Building",
        code: null,
        anchor: { longitude: 114.2, latitude: 22.41, crs: "wgs84" },
      },
      {
        buildingId: "east-record",
        name: "测试楼",
        englishName: "Test Building",
        code: null,
        anchor: { longitude: 114.21, latitude: 22.42, crs: "wgs84" },
      },
    ]);

    expect(campusMapBuildingDisplayFor(display, "west-record")?.qualifier).toBe(
      "位置 114.20000, 22.41000",
    );
    expect(campusMapBuildingDisplayFor(display, "east-record")?.qualifier).toBe(
      "位置 114.21000, 22.42000",
    );
  });

  it("always gives otherwise identical records a stable final qualifier", () => {
    const display = projectCampusMapBuildingDisplay([
      { buildingId: "aaaaaaaa-1", name: "测试楼", code: null },
      { buildingId: "aaaaaaaa-2", name: "测试楼", code: null },
    ]);

    expect(campusMapBuildingDisplayFor(display, "aaaaaaaa-1")?.qualifier).toBe(
      "记录 aaaaaaaa-1",
    );
    expect(campusMapBuildingDisplayFor(display, "aaaaaaaa-2")?.qualifier).toBe(
      "记录 aaaaaaaa-2",
    );
  });
});
