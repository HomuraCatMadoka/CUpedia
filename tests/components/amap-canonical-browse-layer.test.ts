import { afterEach, describe, expect, it, vi } from "vitest";

import { AmapCanonicalBrowseLayer } from "@/components/campus-map/amap-canonical-browse-layer";
import {
  campusMapAmapBuildingPositionKey,
  campusMapAmapPlacePositionKey,
} from "@/lib/campus-map/amap-browse-projection";
import { asAmapPosition } from "@/lib/campus-map/amap-position";
import type { CampusMapBrowseProjection } from "@/lib/campus-map/browse-projection";

const buildingId = "80700000-0000-4000-8000-000000000040";
const placeId = "80700000-0000-4000-8000-000000000001";
const position = asAmapPosition([114.205304, 22.422607]);
const placeProjection: CampusMapBrowseProjection = {
  buildings: [],
  presences: [],
  places: [
    {
      placeId,
      revisionId: "80700000-0000-4000-8000-000000000002",
      name: "打印站",
      placeType: "printer",
      regularHours: null,
      officialActions: [],
      visitNote: null,
      capabilities: [],
      gender: null,
      wheelchairAccess: null,
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
      observedAt: null,
      verifiedAt: null,
      provenance: [],
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
      placeType: "printer",
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
  const name = "卫星遥感地面接收站";
  const englishName = "Satellite Remote Sensing Receiving Station";
  const eastBuildingId = "80700000-0000-4000-8000-000000000013";
  const buildingPlace = {
    ...placeProjection.places[0]!,
    buildingId,
    location: {
      kind: "building" as const,
      building: { id: buildingId, name, englishName, code: "H40" },
    },
    selectionTarget: {
      kind: "place" as const,
      placeId,
      buildingId,
      floorId: null,
    },
  };
  return {
    buildings: [
      {
        buildingId,
        name,
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
        selectionTarget: { kind: "building", buildingId },
      },
      {
        buildingId: eastBuildingId,
        name,
        englishName,
        code: "E13",
        aliases: [],
        anchor: { longitude: 114.21, latitude: 22.42, crs: "wgs84" },
        floors: [],
        placeIds: [],
        selectionTarget: { kind: "building", buildingId: eastBuildingId },
      },
    ],
    places: [buildingPlace],
    presences: [
      {
        buildingId,
        placeType: "printer",
        placeIds: [placeId],
        floorIds: [],
      },
    ],
    markers: [
      {
        kind: "building-presence",
        buildingId,
        placeType: "printer",
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

function healthBuildingProjection(
  serviceCount: 1 | 2,
): CampusMapBrowseProjection {
  const projection = duplicateBuildingProjection();
  const outpatient = {
    ...projection.places[0]!,
    name: "门诊（Outpatient Service）",
    placeType: "health-service" as const,
  };
  const dental = {
    ...outpatient,
    placeId: "80700000-0000-4000-8000-000000000003",
    revisionId: "80700000-0000-4000-8000-000000000004",
    name: "牙科（Dental Service）",
    selectionTarget: {
      ...outpatient.selectionTarget,
      placeId: "80700000-0000-4000-8000-000000000003",
    },
  };
  const places = serviceCount === 1 ? [outpatient] : [outpatient, dental];
  const placeIds = places.map((place) => place.placeId);
  return {
    ...projection,
    buildings: projection.buildings.map((building) =>
      building.buildingId === buildingId ? { ...building, placeIds } : building,
    ),
    places,
    presences: [
      {
        buildingId,
        placeType: "health-service",
        placeIds,
        floorIds: [],
      },
    ],
    markers: [
      {
        kind: "building-presence",
        buildingId,
        placeType: "health-service",
        placeIds,
        position: {
          longitude: position[0],
          latitude: position[1],
          crs: "wgs84",
        },
      },
    ],
  };
}

class TestMarker {
  static latest: TestMarker | null = null;
  private readonly handlers = new Map<string, () => void>();

  constructor(private readonly position: readonly [number, number]) {
    TestMarker.latest = this;
  }

  on(event: string, handler: () => void) {
    this.handlers.set(event, handler);
  }

  emitClickWithoutPointerGesture() {
    this.handlers.get("click")?.();
  }

  getPosition() {
    return { lng: this.position[0], lat: this.position[1] };
  }

  setContent() {}
  setzIndex() {}
}

class TestMarkerCluster {
  constructor(
    _map: TestMap,
    data: readonly Record<string, unknown>[],
    options: Record<string, unknown>,
  ) {
    const renderMarker = options.renderMarker as (input: {
      marker: TestMarker;
    }) => void;
    const marker = new TestMarker(data[0]!.lnglat as readonly [number, number]);
    renderMarker({ marker });
  }

  on() {}
  setMap() {}
}

class TestMap {
  private readonly handlers = new Map<string, (event: object) => void>();

  on(event: string, handler: (event: object) => void) {
    this.handlers.set(event, handler);
  }

  off(event: string, handler: (event: object) => void) {
    if (this.handlers.get(event) === handler) this.handlers.delete(event);
  }

  emitClick() {
    this.handlers.get("click")?.({});
  }

  emitHotspot(event: {
    id?: string;
    name?: string;
    lnglat: { lng: number; lat: number };
  }) {
    this.handlers.get("hotspotclick")?.(event);
  }

  listenerCount() {
    return this.handlers.size;
  }
}

class StickyEmptyMarker {
  content = "";
  zIndex = 0;
  private readonly handlers = new Map<string, () => void>();

  constructor(private readonly markerPosition: readonly [number, number]) {}

  on(event: string, handler: () => void) {
    this.handlers.set(event, handler);
  }

  getPosition() {
    return { lng: this.markerPosition[0], lat: this.markerPosition[1] };
  }

  setContent(content: string) {
    this.content = content;
  }

  setzIndex(zIndex: number) {
    this.zIndex = zIndex;
  }
}

class StickyEmptyCluster {
  static instances: StickyEmptyCluster[] = [];
  readonly markers: StickyEmptyMarker[] = [];
  readonly setMap = vi.fn();

  constructor(
    _map: TestMap,
    data: readonly Record<string, unknown>[],
    private readonly options: Record<string, unknown>,
  ) {
    StickyEmptyCluster.instances.push(this);
    this.render(data);
  }

  on() {}

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

function installManualFrames() {
  let nextId = 1;
  const pending = new Map<number, FrameRequestCallback>();
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    const id = nextId++;
    pending.set(id, callback);
    return id;
  });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => pending.delete(id));
  return {
    flush() {
      for (const callback of [...pending.values()]) callback(0);
      pending.clear();
    },
  };
}

afterEach(() => {
  TestMarker.latest = null;
  StickyEmptyCluster.instances = [];
  vi.unstubAllGlobals();
});

describe("AmapCanonicalBrowseLayer", () => {
  it("forwards one AMap hotspot without a companion map dismissal", () => {
    const frames = installManualFrames();
    const intents: unknown[] = [];
    const hotspots: unknown[] = [];
    const map = new TestMap();
    const layer = new AmapCanonicalBrowseLayer({
      map,
      provider: { MarkerCluster: TestMarkerCluster },
      onIntent: (intent) => intents.push(intent),
      onHotspot: (hotspot) => hotspots.push(hotspot),
    });

    map.emitHotspot({
      id: "B0FFF2MN12",
      name: "科学馆北座高锟楼",
      lnglat: { lng: 114.20801, lat: 22.41966 },
    });
    map.emitClick();
    frames.flush();

    expect(hotspots).toEqual([
      {
        providerObjectId: "B0FFF2MN12",
        name: "科学馆北座高锟楼",
      },
    ]);
    expect(intents).toEqual([]);
    layer.destroy();
  });

  it("opens a canonical Place from a keyboard-style marker click", () => {
    const intents: unknown[] = [];
    const layer = new AmapCanonicalBrowseLayer({
      map: new TestMap(),
      provider: { MarkerCluster: TestMarkerCluster },
      onIntent: (intent) => intents.push(intent),
      onHotspot: vi.fn(),
    });

    layer.render({
      projection: placeProjection,
      providerPositions: {
        [campusMapAmapPlacePositionKey(placeId)]: position,
      },
      mode: { kind: "places", placeIds: [placeId], selectedPlaceId: null },
    });
    TestMarker.latest?.emitClickWithoutPointerGesture();

    expect(intents).toEqual([{ type: "OPEN_PLACE", placeId }]);
    layer.destroy();
  });

  it.each([
    ["one health service directly", 1, { type: "OPEN_PLACE", placeId }],
    [
      "the Building list for two health services",
      2,
      { type: "OPEN_BUILDING", buildingId },
    ],
  ] as const)(
    "opens %s from a Building marker",
    (_label, serviceCount, intent) => {
      const intents: unknown[] = [];
      const projection = healthBuildingProjection(serviceCount);
      const layer = new AmapCanonicalBrowseLayer({
        map: new TestMap(),
        provider: { MarkerCluster: TestMarkerCluster },
        onIntent: (nextIntent) => intents.push(nextIntent),
        onHotspot: vi.fn(),
      });

      layer.render({
        projection,
        providerPositions: {
          [campusMapAmapBuildingPositionKey(buildingId)]: position,
        },
        mode: {
          kind: "places",
          placeIds: projection.places.map((place) => place.placeId),
          selectedPlaceId: null,
        },
      });
      TestMarker.latest?.emitClickWithoutPointerGesture();

      expect(intents).toEqual([intent]);
      layer.destroy();
    },
  );

  it("reopens the selected service from a shared Building marker", () => {
    const intents: unknown[] = [];
    const projection = healthBuildingProjection(2);
    const layer = new AmapCanonicalBrowseLayer({
      map: new TestMap(),
      provider: { MarkerCluster: TestMarkerCluster },
      onIntent: (intent) => intents.push(intent),
      onHotspot: vi.fn(),
    });

    const renderInput = {
      projection,
      providerPositions: {
        [campusMapAmapBuildingPositionKey(buildingId)]: position,
      },
      mode: {
        kind: "places" as const,
        placeIds: projection.places.map((place) => place.placeId),
        selectedPlaceId: null,
      },
    };
    layer.render(renderInput);
    layer.render({
      ...renderInput,
      mode: { ...renderInput.mode, selectedPlaceId: placeId },
    });
    TestMarker.latest?.emitClickWithoutPointerGesture();

    expect(intents).toEqual([{ type: "OPEN_PLACE", placeId }]);
    layer.destroy();
  });

  it("opens the only visible service from a shared Building marker", () => {
    const intents: unknown[] = [];
    const projection = healthBuildingProjection(2);
    const layer = new AmapCanonicalBrowseLayer({
      map: new TestMap(),
      provider: { MarkerCluster: TestMarkerCluster },
      onIntent: (intent) => intents.push(intent),
      onHotspot: vi.fn(),
    });

    layer.render({
      projection,
      providerPositions: {
        [campusMapAmapBuildingPositionKey(buildingId)]: position,
      },
      mode: {
        kind: "places",
        placeIds: [placeId],
        selectedPlaceId: null,
      },
    });
    TestMarker.latest?.emitClickWithoutPointerGesture();

    expect(intents).toEqual([{ type: "OPEN_PLACE", placeId }]);
    layer.destroy();
  });

  it("does not dismiss after a marker-first companion map click", () => {
    const frames = installManualFrames();
    const intents: unknown[] = [];
    const map = new TestMap();
    const layer = new AmapCanonicalBrowseLayer({
      map,
      provider: { MarkerCluster: TestMarkerCluster },
      onIntent: (intent) => intents.push(intent),
      onHotspot: vi.fn(),
    });
    layer.render({
      projection: placeProjection,
      providerPositions: {
        [campusMapAmapPlacePositionKey(placeId)]: position,
      },
      mode: { kind: "places", placeIds: [placeId], selectedPlaceId: null },
    });

    TestMarker.latest?.emitClickWithoutPointerGesture();
    map.emitClick();
    frames.flush();

    expect(intents).toEqual([{ type: "OPEN_PLACE", placeId }]);
    layer.destroy();
  });

  it("does not dismiss when the map callback arrives before its marker", () => {
    const frames = installManualFrames();
    const intents: unknown[] = [];
    const map = new TestMap();
    const layer = new AmapCanonicalBrowseLayer({
      map,
      provider: { MarkerCluster: TestMarkerCluster },
      onIntent: (intent) => intents.push(intent),
      onHotspot: vi.fn(),
    });
    layer.render({
      projection: placeProjection,
      providerPositions: {
        [campusMapAmapPlacePositionKey(placeId)]: position,
      },
      mode: { kind: "places", placeIds: [placeId], selectedPlaceId: null },
    });

    map.emitClick();
    TestMarker.latest?.emitClickWithoutPointerGesture();
    frames.flush();

    expect(intents).toEqual([{ type: "OPEN_PLACE", placeId }]);
    layer.destroy();
  });

  it("dismisses one independent map click after provider callbacks settle", () => {
    const frames = installManualFrames();
    const intents: unknown[] = [];
    const map = new TestMap();
    const layer = new AmapCanonicalBrowseLayer({
      map,
      provider: { MarkerCluster: TestMarkerCluster },
      onIntent: (intent) => intents.push(intent),
      onHotspot: vi.fn(),
    });
    layer.render({
      projection: placeProjection,
      providerPositions: {
        [campusMapAmapPlacePositionKey(placeId)]: position,
      },
      mode: { kind: "places", placeIds: [placeId], selectedPlaceId: null },
    });

    map.emitClick();
    expect(intents).toEqual([]);
    frames.flush();

    expect(intents).toEqual([{ type: "DISMISS" }]);
    layer.destroy();
  });

  it("keeps background dismissal available before markers are ready", () => {
    const frames = installManualFrames();
    const intents: unknown[] = [];
    const map = new TestMap();
    const layer = new AmapCanonicalBrowseLayer({
      map,
      provider: { MarkerCluster: TestMarkerCluster },
      onIntent: (intent) => intents.push(intent),
      onHotspot: vi.fn(),
    });

    map.emitClick();
    frames.flush();

    expect(intents).toEqual([{ type: "DISMISS" }]);
    layer.destroy();
  });

  it("cancels pending work and detaches from the map when destroyed", () => {
    const frames = installManualFrames();
    const intents: unknown[] = [];
    const map = new TestMap();
    const layer = new AmapCanonicalBrowseLayer({
      map,
      provider: { MarkerCluster: TestMarkerCluster },
      onIntent: (intent) => intents.push(intent),
      onHotspot: vi.fn(),
    });
    layer.render({
      projection: placeProjection,
      providerPositions: {
        [campusMapAmapPlacePositionKey(placeId)]: position,
      },
      mode: { kind: "places", placeIds: [placeId], selectedPlaceId: null },
    });
    map.emitClick();

    layer.destroy();
    frames.flush();

    expect(intents).toEqual([]);
    expect(map.listenerCount()).toBe(0);
  });

  it("keeps a rendered Place marker's selected state in sync", () => {
    const layer = new AmapCanonicalBrowseLayer({
      map: new TestMap(),
      provider: { MarkerCluster: StickyEmptyCluster },
      onIntent: vi.fn(),
      onHotspot: vi.fn(),
    });

    layer.render({
      projection: placeProjection,
      providerPositions: {
        [campusMapAmapPlacePositionKey(placeId)]: position,
      },
      mode: {
        kind: "places",
        placeIds: [placeId],
        selectedPlaceId: placeId,
      },
    });

    const marker = StickyEmptyCluster.instances[0]?.markers[0];
    expect(marker?.content).toContain('aria-pressed="true"');
    expect(marker?.zIndex).toBe(220);
    layer.destroy();
  });

  it("renders when a published Place receives its provider position", () => {
    const layer = new AmapCanonicalBrowseLayer({
      map: new TestMap(),
      provider: { MarkerCluster: StickyEmptyCluster },
      onIntent: vi.fn(),
      onHotspot: vi.fn(),
    });
    const mode = {
      kind: "places" as const,
      placeIds: [placeId],
      selectedPlaceId: placeId,
    };

    layer.render({ projection: placeProjection, providerPositions: {}, mode });
    layer.render({
      projection: placeProjection,
      providerPositions: {
        [campusMapAmapPlacePositionKey(placeId)]: position,
      },
      mode,
    });

    expect(StickyEmptyCluster.instances).toHaveLength(1);
    expect(StickyEmptyCluster.instances[0]?.markers[0]?.content).toContain(
      `data-canonical-marker-key="${campusMapAmapPlacePositionKey(placeId)}"`,
    );
    layer.destroy();
  });

  it("keeps duplicate-name Building markers distinguishable", () => {
    const layer = new AmapCanonicalBrowseLayer({
      map: new TestMap(),
      provider: { MarkerCluster: StickyEmptyCluster },
      onIntent: vi.fn(),
      onHotspot: vi.fn(),
    });

    layer.render({
      projection: duplicateBuildingProjection(),
      providerPositions: {
        [campusMapAmapBuildingPositionKey(buildingId)]: position,
      },
      mode: {
        kind: "places",
        placeIds: [placeId],
        selectedPlaceId: null,
      },
    });

    const content = StickyEmptyCluster.instances[0]?.markers[0]?.content;
    expect(content).toContain("卫星遥感地面接收站（H40）");
    expect(content).not.toContain("E13");
    layer.destroy();
  });
});
