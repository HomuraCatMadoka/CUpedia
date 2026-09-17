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

class TestDomElement {
  private readonly listeners = new Map<
    string,
    Array<(event: { detail: number }) => void>
  >();

  constructor(readonly outerHTML: string) {}

  addEventListener(
    event: string,
    listener: (event: { detail: number }) => void,
  ) {
    const listeners = this.listeners.get(event) ?? [];
    listeners.push(listener);
    this.listeners.set(event, listeners);
  }

  emitClick(detail: number) {
    for (const listener of this.listeners.get("click") ?? []) {
      listener({ detail });
    }
  }
}

class TestDomContainer {
  firstElementChild: TestDomElement | null = null;

  set innerHTML(content: string) {
    this.firstElementChild = new TestDomElement(content);
  }
}

function installTestDocument() {
  vi.stubGlobal("document", {
    createElement: () => new TestDomContainer(),
  });
}

class TestMarker {
  static latest: TestMarker | null = null;
  content = "";
  zIndex = 0;
  private readonly handlers = new Map<string, () => void>();
  private contentElement: TestDomElement | null = null;

  constructor(
    private readonly position: readonly [number, number],
    private readonly emitBridge?: (event: string, payload: object) => void,
  ) {
    TestMarker.latest = this;
  }

  on(event: string, handler: () => void) {
    this.handlers.set(event, handler);
  }

  emitClickWithoutPointerGesture() {
    this.emit("click", {});
  }

  emit(event: string, payload: object) {
    this.handlers.get(event)?.();
    this.emitBridge?.(event, payload);
  }

  emitContentClick(detail: number) {
    this.contentElement?.emitClick(detail);
  }

  getPosition() {
    return { lng: this.position[0], lat: this.position[1] };
  }

  setContent(content: string | Element) {
    if (typeof content === "string") {
      this.content = content;
      this.contentElement = null;
      return;
    }
    this.content = content.outerHTML;
    this.contentElement = content as unknown as TestDomElement;
  }
  setzIndex(zIndex: number) {
    this.zIndex = zIndex;
  }
}

class TestSelectedMarker extends TestMarker {
  constructor(options: Record<string, unknown>) {
    super(options.position as readonly [number, number]);
  }
}

class TestMarkerCluster {
  static instances: TestMarkerCluster[] = [];
  private click: ((event: object) => void) | null = null;
  readonly singleMarkers: TestMarker[] = [];
  constructor(
    _map: TestMap,
    readonly data: readonly Record<string, unknown>[],
    private readonly options: Record<string, unknown>,
  ) {
    TestMarkerCluster.instances.push(this);
    const renderMarker = options.renderMarker as (input: {
      marker: TestMarker;
    }) => void;
    const marker = new TestMarker(data[0]!.lnglat as readonly [number, number]);
    this.singleMarkers.push(marker);
    renderMarker({ marker });
  }

  on(_event: string, handler: (event: object) => void) {
    this.click = handler;
  }
  emitClick(data = this.data, marker = new TestMarker([0, 0])) {
    this.click?.({
      marker,
      clusterData: data.map(({ lnglat }) => ({ lnglat })),
    });
  }
  renderCluster(data = this.data) {
    const marker = new TestMarker([0, 0], (event) => {
      if (event === "click") this.emitClick(data, marker);
    });
    (this.options.renderClusterMarker as (input: object) => void)({
      marker,
      count: data.length,
    });
    return marker;
  }
  setMap() {}
}

class TestMap {
  readonly overlays: Array<{ content: string; zIndex: number }> = [];
  add(marker: TestMarker) {
    this.overlays.push(marker);
  }
  remove(markers: readonly TestMarker[]) {
    for (const marker of markers) {
      const index = this.overlays.indexOf(marker);
      if (index >= 0) this.overlays.splice(index, 1);
    }
  }
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

class RoundedPositionCluster {
  static latestMarker: TestMarker | null = null;
  static offset = 0.0000002;

  constructor(
    _map: TestMap,
    data: readonly Record<string, unknown>[],
    options: Record<string, unknown>,
  ) {
    const [longitude, latitude] = data[0]!.lnglat as readonly [number, number];
    const marker = new TestMarker([
      longitude + RoundedPositionCluster.offset,
      latitude - RoundedPositionCluster.offset,
    ]);
    RoundedPositionCluster.latestMarker = marker;
    (options.renderMarker as (input: { marker: TestMarker }) => void)({
      marker,
    });
  }

  on() {}
  setMap() {}
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
  RoundedPositionCluster.latestMarker = null;
  RoundedPositionCluster.offset = 0.0000002;
  TestMarkerCluster.instances = [];
  vi.unstubAllGlobals();
});

describe("AmapCanonicalBrowseLayer", () => {
  function renderClusterProjection(projection: CampusMapBrowseProjection) {
    const map = new TestMap();
    const intents: unknown[] = [];
    const layer = new AmapCanonicalBrowseLayer({
      map,
      provider: {
        Marker: TestSelectedMarker,
        MarkerCluster: TestMarkerCluster,
      },
      onIntent: (intent) => intents.push(intent),
      onHotspot: vi.fn(),
    });
    const providerPositions = Object.fromEntries(
      projection.markers.map((marker) => [
        marker.kind === "building-presence"
          ? campusMapAmapBuildingPositionKey(marker.buildingId)
          : campusMapAmapPlacePositionKey(marker.placeId),
        asAmapPosition([marker.position.longitude, marker.position.latitude]),
      ]),
    );
    const input = {
      projection,
      providerPositions,
      mode: {
        kind: "places" as const,
        placeIds: projection.places.map((place) => place.placeId),
        selectedPlaceId: null as string | null,
      },
    };
    layer.render(input);
    return {
      layer,
      map,
      intents,
      input,
      cluster: TestMarkerCluster.instances.at(-1)!,
    };
  }

  it("counts canonical Places and opens the directory for a same-Building cluster", () => {
    const projection = healthBuildingProjection(2);
    const printer = {
      ...projection.places[0]!,
      placeId: "printer",
      name: "打印站",
      placeType: "printer" as const,
    };
    const runtime = renderClusterProjection({
      ...projection,
      places: [...projection.places, printer],
      markers: [
        ...projection.markers,
        {
          ...projection.markers[0]!,
          placeType: "printer",
          placeIds: [printer.placeId],
        } as CampusMapBrowseProjection["markers"][number],
      ],
    });
    expect(runtime.cluster.data).toHaveLength(1);
    const marker = runtime.cluster.singleMarkers[0]!;
    expect(marker.content).toContain("3 个不同类别地点，1 个地图位置");
    expect(marker.content).toContain("打开建筑目录");
    marker.emitClickWithoutPointerGesture();
    expect(runtime.intents).toEqual([{ type: "OPEN_BUILDING", buildingId }]);
    runtime.layer.destroy();
  });

  it("keeps category styling while counting distinct cluster positions", () => {
    const projection = healthBuildingProjection(2);
    const otherId = projection.buildings[1]!.buildingId;
    const other = {
      ...projection.places[0]!,
      placeId: "other-health",
      buildingId: otherId,
    };
    const runtime = renderClusterProjection({
      ...projection,
      places: [...projection.places, other],
      markers: [
        ...projection.markers,
        {
          ...projection.markers[0]!,
          buildingId: otherId,
          placeIds: [other.placeId],
          position: projection.buildings[1]!.anchor!,
        } as CampusMapBrowseProjection["markers"][number],
      ],
    });

    const marker = runtime.cluster.renderCluster();
    expect(marker.content).toContain("background:#b33d5c");
    expect(marker.content).toContain('data-place-type-icon="health-service"');
    expect(marker.content).toContain("2 个地图位置，类别：医疗服务");
    runtime.layer.destroy();
  });

  it("uses truthful position semantics when render callbacks omit members", () => {
    const projection = healthBuildingProjection(2);
    const otherId = projection.buildings[1]!.buildingId;
    const other = {
      ...projection.places[0]!,
      placeId: "other-health",
      buildingId: otherId,
    };
    const runtime = renderClusterProjection({
      ...projection,
      places: [...projection.places, other, placeProjection.places[0]!],
      markers: [
        ...projection.markers,
        {
          ...projection.markers[0]!,
          buildingId: otherId,
          placeIds: [other.placeId],
          position: projection.buildings[1]!.anchor!,
        } as CampusMapBrowseProjection["markers"][number],
        placeProjection.markers[0]!,
      ],
    });
    const members = runtime.cluster.data.slice(0, 2);
    const marker = runtime.cluster.renderCluster(members);
    expect(marker.content).toContain("background:#374151");
    expect(marker.content).toContain("2 个地图位置，放大查看这些位置");
    expect(marker.content).not.toContain("不同类别");
    expect(marker.content).not.toContain("地点数量暂不可用");
    runtime.cluster.emitClick(members);
    expect(runtime.intents).toEqual([
      {
        type: "EXPAND_CLUSTER",
        positions: members.map((member) => member.lnglat),
      },
    ]);
    runtime.layer.destroy();
  });

  it("routes keyboard cluster activation through the provider click event once", () => {
    installTestDocument();
    const projection = healthBuildingProjection(2);
    const otherId = projection.buildings[1]!.buildingId;
    const other = {
      ...projection.places[0]!,
      placeId: "other-health",
      buildingId: otherId,
    };
    const runtime = renderClusterProjection({
      ...projection,
      places: [...projection.places, other, placeProjection.places[0]!],
      markers: [
        ...projection.markers,
        {
          ...projection.markers[0]!,
          buildingId: otherId,
          placeIds: [other.placeId],
          position: projection.buildings[1]!.anchor!,
        } as CampusMapBrowseProjection["markers"][number],
        placeProjection.markers[0]!,
      ],
    });
    const members = runtime.cluster.data.slice(0, 2);
    const marker = runtime.cluster.renderCluster(members);

    marker.emitContentClick(1);
    runtime.cluster.emitClick(members, marker);
    expect(runtime.intents).toHaveLength(1);
    runtime.intents.length = 0;

    marker.emitContentClick(0);
    expect(runtime.intents).toEqual([
      {
        type: "EXPAND_CLUSTER",
        positions: members.map((member) => member.lnglat),
      },
    ]);
    runtime.layer.destroy();
  });

  it("does not invent Building membership from equal coordinates or names", () => {
    const projection = healthBuildingProjection(2);
    const otherId = projection.buildings[1]!.buildingId;
    const other = {
      ...projection.places[0]!,
      placeId: "other-health",
      buildingId: otherId,
    };
    const runtime = renderClusterProjection({
      ...projection,
      buildings: projection.buildings.map((building) => ({
        ...building,
        anchor: projection.buildings[0]!.anchor,
      })),
      places: [...projection.places, other],
      markers: [
        ...projection.markers,
        {
          ...projection.markers[0]!,
          buildingId: otherId,
          placeIds: [other.placeId],
        } as CampusMapBrowseProjection["markers"][number],
      ],
    });
    expect(runtime.cluster.data).toHaveLength(1);
    const marker = runtime.cluster.singleMarkers[0]!;
    expect(marker.content).toContain("3 个医疗服务，1 个地图位置");
    expect(marker.content).not.toContain("打开建筑目录");
    marker.emitClickWithoutPointerGesture();
    expect(runtime.intents[0]).toEqual({
      type: "OPEN_CLUSTER_MEMBERS",
      placeIds: [
        ...projection.places.map((place) => place.placeId),
        other.placeId,
      ],
      placeType: "health-service",
    });
    runtime.cluster.emitClick([{ lnglat: [0, 0] }]);
    expect(runtime.intents).toHaveLength(1);
    runtime.layer.destroy();
  });

  it("shows the selected canonical room outside clustering and replaces its label on rapid switching", () => {
    const projection = healthBuildingProjection(2);
    const runtime = renderClusterProjection(projection);
    runtime.layer.render({
      ...runtime.input,
      mode: { ...runtime.input.mode, selectedPlaceId: placeId },
    });
    expect(runtime.map.overlays).toHaveLength(1);
    expect(runtime.map.overlays[0]!.content).toContain(">已选 · 门诊</span>");
    expect(runtime.map.overlays[0]!.content).toContain("Outpatient Service");
    expect(runtime.map.overlays[0]!.content).toContain(
      "所属建筑 · 非室内精确位置",
    );
    runtime.layer.render({
      ...runtime.input,
      mode: {
        ...runtime.input.mode,
        selectedPlaceId: projection.places[1]!.placeId,
      },
    });
    expect(runtime.map.overlays).toHaveLength(1);
    expect(runtime.map.overlays[0]!.content).toContain(">已选 · 牙科</span>");
    expect(runtime.map.overlays[0]!.content).not.toContain("Outpatient");
    runtime.cluster.emitClick();
    expect(runtime.intents).toEqual([]);
    runtime.layer.destroy();
    expect(runtime.map.overlays).toHaveLength(0);
  });
  it("forwards one AMap hotspot without a companion map dismissal", () => {
    const frames = installManualFrames();
    const intents: unknown[] = [];
    const hotspots: unknown[] = [];
    const map = new TestMap();
    const layer = new AmapCanonicalBrowseLayer({
      map,
      provider: {
        Marker: TestSelectedMarker,
        MarkerCluster: TestMarkerCluster,
      },
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
        providerPosition: asAmapPosition([114.20801, 22.41966]),
      },
    ]);
    expect(intents).toEqual([]);
    layer.destroy();
  });

  it("opens a canonical Place from a keyboard-style marker click", () => {
    const intents: unknown[] = [];
    const layer = new AmapCanonicalBrowseLayer({
      map: new TestMap(),
      provider: {
        Marker: TestSelectedMarker,
        MarkerCluster: TestMarkerCluster,
      },
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
        provider: {
          Marker: TestSelectedMarker,
          MarkerCluster: TestMarkerCluster,
        },
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
      provider: {
        Marker: TestSelectedMarker,
        MarkerCluster: TestMarkerCluster,
      },
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
      provider: {
        Marker: TestSelectedMarker,
        MarkerCluster: TestMarkerCluster,
      },
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
      provider: {
        Marker: TestSelectedMarker,
        MarkerCluster: TestMarkerCluster,
      },
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
      provider: {
        Marker: TestSelectedMarker,
        MarkerCluster: TestMarkerCluster,
      },
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
      provider: {
        Marker: TestSelectedMarker,
        MarkerCluster: TestMarkerCluster,
      },
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
      provider: {
        Marker: TestSelectedMarker,
        MarkerCluster: TestMarkerCluster,
      },
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
      provider: {
        Marker: TestSelectedMarker,
        MarkerCluster: TestMarkerCluster,
      },
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
    const map = new TestMap();
    const layer = new AmapCanonicalBrowseLayer({
      map,
      provider: {
        Marker: TestSelectedMarker,
        MarkerCluster: StickyEmptyCluster,
      },
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

    const marker = map.overlays[0];
    expect(marker?.content).toContain('aria-pressed="true"');
    expect(marker?.zIndex).toBe(240);
    expect(StickyEmptyCluster.instances).toHaveLength(0);
    layer.destroy();
  });

  it("renders when a published Place receives its provider position", () => {
    const map = new TestMap();
    const layer = new AmapCanonicalBrowseLayer({
      map,
      provider: {
        Marker: TestSelectedMarker,
        MarkerCluster: StickyEmptyCluster,
      },
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

    expect(map.overlays).toHaveLength(1);
    expect(map.overlays[0]?.content).toContain(
      `data-canonical-marker-key="${campusMapAmapPlacePositionKey(placeId)}"`,
    );
    layer.destroy();
  });

  it("reconnects a provider-rounded coordinate to its custom marker", () => {
    const layer = new AmapCanonicalBrowseLayer({
      map: new TestMap(),
      provider: {
        Marker: TestSelectedMarker,
        MarkerCluster: RoundedPositionCluster,
      },
      onIntent: vi.fn(),
      onHotspot: vi.fn(),
    });

    layer.render({
      projection: placeProjection,
      providerPositions: {
        [campusMapAmapPlacePositionKey(placeId)]: position,
      },
      mode: { kind: "places", placeIds: [placeId], selectedPlaceId: null },
    });

    expect(RoundedPositionCluster.latestMarker?.content).toContain(
      `data-canonical-marker-key="${campusMapAmapPlacePositionKey(placeId)}"`,
    );
    expect(RoundedPositionCluster.latestMarker?.content).toContain(
      'data-cupedia-marker="true"',
    );
    layer.destroy();
  });

  it("replaces an unmatched provider callback with a named custom fallback", () => {
    RoundedPositionCluster.offset = 0.00001;
    const layer = new AmapCanonicalBrowseLayer({
      map: new TestMap(),
      provider: {
        Marker: TestSelectedMarker,
        MarkerCluster: RoundedPositionCluster,
      },
      onIntent: vi.fn(),
      onHotspot: vi.fn(),
    });

    layer.render({
      projection: placeProjection,
      providerPositions: {
        [campusMapAmapPlacePositionKey(placeId)]: position,
      },
      mode: { kind: "places", placeIds: [placeId], selectedPlaceId: null },
    });

    expect(RoundedPositionCluster.latestMarker?.content).toContain(
      "data-campus-map-cluster",
    );
    expect(RoundedPositionCluster.latestMarker?.content).toContain(
      'aria-label="校园地点标记，地点列表仍可使用"',
    );
    layer.destroy();
  });

  it("renders the selected label on the collision-free side", () => {
    const map = new TestMap();
    const layer = new AmapCanonicalBrowseLayer({
      map,
      provider: {
        Marker: TestSelectedMarker,
        MarkerCluster: StickyEmptyCluster,
      },
      selectedLabelPlacement: () => "right",
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

    expect(map.overlays[0]?.content).toContain(
      'data-campus-map-label-placement="right"',
    );
    layer.destroy();
  });

  it("keeps duplicate-name Building markers distinguishable", () => {
    const layer = new AmapCanonicalBrowseLayer({
      map: new TestMap(),
      provider: {
        Marker: TestSelectedMarker,
        MarkerCluster: StickyEmptyCluster,
      },
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
