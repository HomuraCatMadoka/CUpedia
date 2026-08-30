import { describe, expect, it } from "vitest";

import {
  facilityMarkerContent,
  facilityMarkerIcon,
} from "@/lib/campus-map/facility-marker";

describe("facility marker icon", () => {
  it("renders a water icon instead of a text glyph or cluster count", () => {
    const icon = facilityMarkerIcon("water");

    expect(icon).toContain('data-amenity-icon="water"');
    expect(icon).toContain("<svg");
    expect(icon).not.toMatch(/>水</);
    expect(icon).not.toMatch(/>1</);
  });

  it("keeps the water icon in selected marker content", () => {
    const content = facilityMarkerContent({
      id: "science-water",
      name: "饮水机",
      buildingName: "科学馆",
      floorLabel: "1/F",
      category: "water",
      color: "#227a9b",
      selected: true,
    });

    expect(content).toContain('data-amenity-icon="water"');
    expect(content).toContain('aria-pressed="true"');
    expect(content).toContain('aria-label="科学馆内有饮水机，1/F，建筑级位置"');
  });

  it("escapes fixture-derived marker attributes", () => {
    const content = facilityMarkerContent({
      id: 'water" onclick="alert(1)',
      name: "饮水机<test>",
      buildingName: '科学馆"',
      floorLabel: "1/F",
      category: "water",
      color: "red;position:fixed",
      selected: false,
    });

    expect(content).not.toContain('onclick="alert(1)');
    expect(content).toContain("&quot;");
    expect(content).toContain("&lt;test&gt;");
    expect(content).toContain("background:#176346");
  });
});
