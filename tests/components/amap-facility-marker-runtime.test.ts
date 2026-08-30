import { describe, expect, it, vi } from "vitest";

import { AmapFacilityMarkerRuntime } from "@/components/campus-map/amap-facility-marker-runtime";
import type { CampusMapBrowseProjection } from "@/lib/campus-map/browse-projection";

const placeId = "80700000-0000-4000-8000-000000000001";
const position = [114.205304, 22.422607] as const;

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
      providerPositions: { [`place:${placeId}`]: position },
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
});
