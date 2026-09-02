import { describe, expect, it, vi } from "vitest";

import { AmapFacilityMarkerRuntime } from "@/components/campus-map/amap-facility-marker-runtime";
import { asAmapPosition } from "@/lib/campus-map/amap-position";
import type { CampusMapBrowseProjection } from "@/lib/campus-map/browse-projection";

const placeId = "80700000-0000-4000-8000-000000000001";
const position = [114.205304, 22.422607] as const;
const providerPosition = asAmapPosition(position);

const projection: CampusMapBrowseProjection = {
  buildings: [],
  presences: [],
  places: [
    {
      placeId,
      revisionId: "80700000-0000-4000-8000-000000000002",
      name: "打印站",
      pinType: "printer",
      capabilities: [],
      access: {
        audience: "public",
        credentialRequirement: "none",
        schedule: { kind: "always" },
        reservationRequirement: "none",
        temporaryStatus: "normal",
      },
      facets: { gender: "unknown", wheelchairAccess: "unknown" },
      buildingId: null,
      floorId: null,
      floorLabel: null,
      location: {
        kind: "outdoor-point",
        point: {
          longitude: position[0],
          latitude: position[1],
          crs: "wgs84",
          precision: "approximate",
        },
      },
      publishedAt: "2026-08-30T00:00:00.000Z",
      selectionTarget: {
        kind: "place",
        placeId,
        buildingId: null,
        floorId: null,
      },
    },
  ],
  markers: [
    {
      kind: "place",
      placeId,
      pinType: "printer",
      position: {
        longitude: position[0],
        latitude: position[1],
        crs: "wgs84",
        precision: "approximate",
      },
    },
  ],
};

function duplicateBuildingProjection(): CampusMapBrowseProjection {
  const buildingName = "卫星遥感地面接收站";
  const englishName = "Satellite Remote Sensing Receiving Station";
  const westBuildingId = "80700000-0000-4000-8000-000000000040";
  const eastBuildingId = "80700000-0000-4000-8000-000000000013";
  const buildingPlace = {
    ...projection.places[0]!,
    buildingId: westBuildingId,
    location: {
      kind: "building" as const,
      building: {
        id: westBuildingId,
        name: buildingName,
        englishName,
        code: "H40",
      },
    },
    selectionTarget: {
      kind: "place" as const,
      placeId,
      buildingId: westBuildingId,
      floorId: null,
    },
  };
  return {
    buildings: [
      {
        buildingId: westBuildingId,
        name: buildingName,
        englishName,
        code: "H40",
        aliases: [],
        anchor: {
          longitude: position[0],
          latitude: position[1],
          crs: "wgs84",
        },
        floors: [],
        placeIds: [placeId],
        selectionTarget: { kind: "building", buildingId: westBuildingId },
      },
      {
        buildingId: eastBuildingId,
        name: buildingName,
        englishName,
        code: "E13",
        aliases: [],
        anchor: {
          longitude: 114.21,
          latitude: 22.42,
          crs: "wgs84",
        },
        floors: [],
        placeIds: [],
        selectionTarget: { kind: "building", buildingId: eastBuildingId },
      },
    ],
    places: [buildingPlace],
    presences: [
      {
        buildingId: westBuildingId,
        pinType: "printer",
        placeIds: [placeId],
        floorIds: [],
      },
    ],
    markers: [
      {
        kind: "building-presence",
        buildingId: westBuildingId,
        pinType: "printer",
        placeIds: [placeId],
        position: {
          longitude: position[0],
          latitude: position[1],
          crs: "wgs84",
        },
      },
    ],
  };
}

class StickyEmptyMarker {
  content = "";

  constructor(private readonly position: readonly [number, number]) {}

  on() {}

  getPosition() {
    return { lng: this.position[0], lat: this.position[1] };
  }

  setContent(content: string) {
    this.content = content;
  }

  setzIndex() {}
}

class StickyEmptyCluster {
  static instances: StickyEmptyCluster[] = [];

  readonly markers: StickyEmptyMarker[] = [];
  readonly setMap = vi.fn();
  private readonly startedEmpty: boolean;

  constructor(
    _map: object,
    data: readonly Record<string, unknown>[],
    private readonly options: Record<string, unknown>,
  ) {
    this.startedEmpty = data.length === 0;
    StickyEmptyCluster.instances.push(this);
    this.render(data);
  }

  on() {}

  setData(data: readonly Record<string, unknown>[]) {
    if (!this.startedEmpty) this.render(data);
  }

  private render(data: readonly Record<string, unknown>[]) {
    const renderMarker = this.options.renderMarker as
      | ((input: { marker: StickyEmptyMarker }) => void)
      | undefined;
    for (const item of data) {
      const marker = new StickyEmptyMarker(
        item.lnglat as readonly [number, number],
      );
      this.markers.push(marker);
      renderMarker?.({ marker });
    }
  }
}

describe("AmapFacilityMarkerRuntime", () => {
  it("keeps the rendered marker selection in sync with its DOM identity", () => {
    const disconnect = vi.fn();
    vi.stubGlobal(
      "MutationObserver",
      class {
        observe() {}
        disconnect = disconnect;
      },
    );
    const marker = {
      dataset: { facilityId: `place:${placeId}` },
      setAttribute: vi.fn(),
    };
    const container = {
      querySelectorAll: vi.fn(() => [marker]),
    } as unknown as HTMLElement;
    const runtime = new AmapFacilityMarkerRuntime();

    const cleanup = runtime.syncSelection(container, projection, placeId);

    expect(marker.setAttribute).toHaveBeenCalledWith("aria-pressed", "true");
    cleanup();
    expect(disconnect).toHaveBeenCalledOnce();
    vi.unstubAllGlobals();
  });

  it("rebuilds a cluster when a published Place receives its provider position", () => {
    StickyEmptyCluster.instances = [];
    const runtime = new AmapFacilityMarkerRuntime();
    const input = {
      map: {},
      provider: { MarkerCluster: StickyEmptyCluster },
      projection,
      markerScope: `place:${placeId}`,
      visibleAmenity: "printer" as const,
      selectedPlaceId: placeId,
      claimProviderTarget: vi.fn(),
      selectBuilding: vi.fn(),
      selectPlace: vi.fn(),
      fitCluster: vi.fn(),
    };

    runtime.sync({ ...input, providerPositions: {} });
    runtime.sync({
      ...input,
      providerPositions: { [`place:${placeId}`]: providerPosition },
    });

    expect(StickyEmptyCluster.instances).toHaveLength(2);
    expect(StickyEmptyCluster.instances[0]?.setMap).toHaveBeenCalledWith(null);
    expect(StickyEmptyCluster.instances[1]?.markers[0]?.content).toContain(
      `data-facility-id="place:${placeId}"`,
    );
    expect(StickyEmptyCluster.instances[1]?.markers[0]?.content).toContain(
      'aria-pressed="true"',
    );
  });

  it("keeps duplicate-name Building markers distinguishable", () => {
    StickyEmptyCluster.instances = [];
    const runtime = new AmapFacilityMarkerRuntime();
    const duplicateProjection = duplicateBuildingProjection();

    runtime.sync({
      map: {},
      provider: { MarkerCluster: StickyEmptyCluster },
      projection: duplicateProjection,
      providerPositions: {
        "building:80700000-0000-4000-8000-000000000040": providerPosition,
      },
      markerScope: "category:printer",
      visibleAmenity: "printer",
      selectedPlaceId: null,
      claimProviderTarget: vi.fn(),
      selectBuilding: vi.fn(),
      selectPlace: vi.fn(),
      fitCluster: vi.fn(),
    });

    const content = StickyEmptyCluster.instances[0]?.markers[0]?.content;
    expect(content).toContain("卫星遥感地面接收站（H40）");
    expect(content).not.toContain("E13");
  });
});
