import { describe, expect, it } from "vitest";

import { chooseCampusMapMarkerLabelPlacement } from "@/lib/campus-map/marker-label-layout";

const mobileMap = { top: 0, right: 320, bottom: 640, left: 0 };

describe("chooseCampusMapMarkerLabelPlacement", () => {
  it("keeps the stable top placement when the full label fits", () => {
    expect(
      chooseCampusMapMarkerLabelPlacement({
        marker: { x: 160, y: 320 },
        map: mobileMap,
        obstacles: [],
      }),
    ).toBe("top");
  });

  it("moves below a marker when the search and category chrome block the top", () => {
    expect(
      chooseCampusMapMarkerLabelPlacement({
        marker: { x: 160, y: 104 },
        map: mobileMap,
        obstacles: [{ top: 0, right: 320, bottom: 92, left: 0 }],
      }),
    ).toBe("bottom");
  });

  it("uses the left side beside the mobile map controls without clipping", () => {
    expect(
      chooseCampusMapMarkerLabelPlacement({
        marker: { x: 276, y: 176 },
        map: mobileMap,
        obstacles: [{ top: 96, right: 320, bottom: 300, left: 254 }],
      }),
    ).toBe("left");
  });

  it("keeps the whole label above a bottom sheet", () => {
    expect(
      chooseCampusMapMarkerLabelPlacement({
        marker: { x: 160, y: 486 },
        map: { top: 0, right: 390, bottom: 844, left: 0 },
        obstacles: [{ top: 520, right: 390, bottom: 844, left: 0 }],
      }),
    ).toBe("top");
  });
});
