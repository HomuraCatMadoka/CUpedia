import { describe, expect, it, vi } from "vitest";

import {
  AmapBuildingPickerRuntime,
  buildingPickerMarkerContent,
} from "@/components/campus-map/amap-building-picker-runtime";
import { asAmapPosition } from "@/lib/campus-map/amap-position";
import type { CampusMapBrowseProjection } from "@/lib/campus-map/browse-projection";

class Marker {
  readonly handlers = new Map<string, () => void>();
  readonly content: string;

  constructor(options: Record<string, unknown>) {
    this.content = String(options.content);
  }

  on(event: string, handler: () => void) {
    this.handlers.set(event, handler);
  }

  emit(event: string) {
    this.handlers.get(event)?.();
  }

  getPosition() {
    return null;
  }

  setContent() {}

  setzIndex() {}
}

const projection: CampusMapBrowseProjection = {
  buildings: [
    {
      buildingId: "science-centre",
      name: "科学馆",
      englishName: "Science Centre",
      code: "H10",
      aliases: [],
      anchor: { longitude: 114.208, latitude: 22.419, crs: "wgs84" },
      floors: [],
      placeIds: [],
      selectionTarget: { kind: "building", buildingId: "science-centre" },
    },
    {
      buildingId: "without-anchor",
      name: "未定位建筑",
      englishName: null,
      code: null,
      aliases: [],
      anchor: null,
      floors: [],
      placeIds: [],
      selectionTarget: { kind: "building", buildingId: "without-anchor" },
    },
  ],
  places: [],
  presences: [],
  markers: [],
};

describe("AmapBuildingPickerRuntime", () => {
  it("renders only projected canonical Buildings and routes their click", () => {
    const add = vi.fn();
    const remove = vi.fn();
    const selectBuilding = vi.fn();
    const claimProviderTarget = vi.fn((action: () => void) => action());
    const runtime = new AmapBuildingPickerRuntime();

    runtime.sync({
      map: { add, remove },
      provider: { Marker },
      projection,
      providerPositions: {
        "building:science-centre": asAmapPosition([114.21, 22.42]),
      },
      scope: "draft-a",
      claimProviderTarget,
      selectBuilding,
    });

    const markers = add.mock.calls[0]![0] as Marker[];
    expect(markers).toHaveLength(1);
    expect(markers[0]!.content).toContain("data-campus-map-building-picker");
    expect(markers[0]!.content).toContain("选择科学馆作为所属建筑");
    markers[0]!.emit("click");
    expect(selectBuilding).toHaveBeenCalledWith("science-centre");

    runtime.destroy();
    expect(remove).toHaveBeenCalledWith(markers);
  });

  it("escapes canonical labels before placing them in provider HTML", () => {
    const content = buildingPickerMarkerContent('A&B <座> "东"');

    expect(content).toContain("A&amp;B &lt;座&gt; &quot;东&quot;");
    expect(content).not.toContain("A&B <座>");
  });
});
