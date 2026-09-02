import { describe, expect, it } from "vitest";

import {
  CAMPUS_MAP_AMAP_PROJECTION,
  asAmapPosition,
  asWgs84Position,
  projectAmapPositionToWgs84,
  projectCampusMapWgs84ToAmap,
} from "@/lib/campus-map/amap-position";

describe("Campus Map AMap position adapter (#807)", () => {
  it("projects an approximate point inside the calibrated CUHK range", () => {
    const wgs84 = asWgs84Position([114.2072, 22.4191]);
    const result = projectCampusMapWgs84ToAmap(wgs84, "approximate");

    expect(result).toEqual({
      status: "projected",
      position: [114.212077, 22.416268],
    });
    if (result.status !== "projected") throw new Error("projection failed");
    expect(projectAmapPositionToWgs84(result.position)).toEqual({
      status: "projected",
      position: wgs84,
    });
  });

  it("routes precise points to the provider instead of silently approximating them", () => {
    expect(
      projectCampusMapWgs84ToAmap(
        asWgs84Position([114.2072, 22.4191]),
        "precise",
      ),
    ).toEqual({ status: "requires-provider" });
  });

  it("routes points outside the calibrated CUHK range to the provider", () => {
    expect(
      projectCampusMapWgs84ToAmap(
        asWgs84Position([113.5439, 22.1987]),
        "approximate",
      ),
    ).toEqual({ status: "requires-provider" });
  });

  it("requires an explicit AMap position at the reverse seam", () => {
    expect(
      projectAmapPositionToWgs84(asAmapPosition([114.212077, 22.416268])),
    ).toEqual({ status: "projected", position: [114.2072, 22.4191] });
  });

  it("publishes the projection version and measured approximate-point limit", () => {
    expect(CAMPUS_MAP_AMAP_PROJECTION).toMatchObject({
      method: "cuhk-calibrated-offset",
      version: "2026-08-25-v1",
      maxObservedErrorMeters: 3.19,
      precision: "approximate",
    });
  });

  it.each([
    ["西南", 114.1965, 22.41, 114.201377, 22.407168],
    ["南中", 114.2072, 22.41, 114.212077, 22.407168],
    ["东南", 114.2179, 22.41, 114.222777, 22.407168],
    ["西中", 114.1965, 22.4191, 114.201377, 22.416268],
    ["中心", 114.2072, 22.4191, 114.212077, 22.416268],
    ["东中", 114.2179, 22.4191, 114.222777, 22.416268],
    ["西北", 114.1965, 22.4282, 114.201377, 22.425368],
    ["北中", 114.2072, 22.4282, 114.212077, 22.425368],
    ["东北", 114.2179, 22.4282, 114.222777, 22.425368],
  ])(
    "keeps the measured nine-point fixture at %s inside the local seam",
    (_name, longitude, latitude, amapLongitude, amapLatitude) => {
      const canonical = asWgs84Position([longitude, latitude]);
      const result = projectCampusMapWgs84ToAmap(canonical, "approximate");

      expect(result).toEqual({
        status: "projected",
        position: [amapLongitude, amapLatitude],
      });
      if (result.status !== "projected") throw new Error("projection failed");
      expect(projectAmapPositionToWgs84(result.position)).toEqual({
        status: "projected",
        position: canonical,
      });
    },
  );

  it.each([
    [114.196499, 22.4191],
    [114.217901, 22.4191],
    [114.2072, 22.409999],
    [114.2072, 22.428201],
  ])(
    "routes a point immediately outside the calibration rectangle",
    (longitude, latitude) => {
      expect(
        projectCampusMapWgs84ToAmap(
          asWgs84Position([longitude, latitude]),
          "approximate",
        ),
      ).toEqual({ status: "requires-provider" });
    },
  );

  it("rejects reverse projection outside the measured campus range", () => {
    expect(projectAmapPositionToWgs84(asAmapPosition([113.55, 22.2]))).toEqual({
      status: "requires-provider",
    });
  });
});
