import { describe, expect, it } from "vitest";

import type { CampusMapHistoricalFactV2 } from "@/lib/campus-map/fact-store";
import { projectCampusMapLegacyPlaceFact } from "@/lib/campus-map/legacy-place-ui-adapter";

function v2Fact(
  input: Partial<CampusMapHistoricalFactV2> = {},
): CampusMapHistoricalFactV2 {
  return {
    factSchemaVersion: 2,
    name: "饮水点",
    placeType: "water",
    regularHours: null,
    officialActions: [],
    visitNote: null,
    capabilities: [],
    gender: null,
    wheelchairAccess: null,
    buildingId: null,
    floorId: null,
    locationKind: "outdoor-point",
    pointPrecision: "approximate",
    longitude: 114.205,
    latitude: 22.419,
    coordinateCrs: "wgs84",
    observedAt: null,
    verifiedAt: null,
    provenance: [],
    ...input,
  };
}

describe("Campus Map legacy public UI adapter", () => {
  it("projects a legacy type without exposing new V2 fields", () => {
    const result = projectCampusMapLegacyPlaceFact(
      v2Fact({
        regularHours: {
          timezone: "Asia/Hong_Kong",
          intervals: [{ days: ["mon"], opensAt: "08:30", closesAt: "18:00" }],
        },
        officialActions: [
          { label: "查看官方详情", url: "https://www.cuhk.edu.hk/" },
        ],
      }),
    );

    expect(result).toMatchObject({
      name: "饮水点",
      pinType: "water",
      accessSchedule: {
        kind: "weekly",
        timezone: "Asia/Hong_Kong",
      },
    });
    expect(result).not.toHaveProperty("officialActions");
  });

  it("does not expose a new V2 type before its UI issue lands", () => {
    expect(
      projectCampusMapLegacyPlaceFact(
        v2Fact({ name: "大学游泳池", placeType: "sports-facility" }),
      ),
    ).toBeNull();
  });
});
