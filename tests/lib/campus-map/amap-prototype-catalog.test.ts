import { describe, expect, it } from "vitest";

import { AMAP_PROTOTYPE_BUILDINGS } from "@/lib/campus-map/amap-prototype-catalog";

describe("AMap campus prototype catalog", () => {
  it("keeps the University Library WGS84 anchor tied to its source record", () => {
    const library = AMAP_PROTOTYPE_BUILDINGS.find(
      (building) => building.id === "university-library",
    );

    expect(library).toMatchObject({
      position: [114.20491129159927, 22.419498675716074],
      coordinateCrs: "wgs84",
      coordinateProvenance: {
        accessedOn: "2026-08-14",
        note: expect.stringContaining("H3/building 5"),
      },
    });
    expect(library?.coordinateProvenance.url).toMatch(/^https:\/\//);
  });
});
