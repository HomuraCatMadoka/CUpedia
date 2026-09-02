/**
 * @vitest-environment jsdom
 */
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockLoadBrowseProjection, mockLoadProviderPoiCard } = vi.hoisted(
  () => ({
    mockLoadBrowseProjection: vi.fn(),
    mockLoadProviderPoiCard: vi.fn(),
  }),
);

vi.mock("@/lib/campus-map/browse-actions", () => ({
  loadCampusMapBrowseProjection: mockLoadBrowseProjection,
  loadCampusMapAmapPoiCard: mockLoadProviderPoiCard,
}));
vi.mock("@/lib/campus-map/edit-actions", () => ({
  identifyCampusMapEditPublisher: vi.fn(async () => ({
    status: "authenticated",
    actorId: "60000000-0000-4000-8000-000000000001",
  })),
  loadCampusMapEditablePlace: vi.fn(async (placeId: string) => ({
    placeId,
    baseRevisionId: "72000000-0000-4000-8000-000000000005",
    locationDisplay: null,
    fact: {
      name: "林荫饮水点",
      buildingId: null,
      floorId: null,
      pinType: "water",
      capabilities: [],
      gender: "unknown",
      wheelchairAccess: "unknown",
      audience: "cuhk-member",
      credentialRequirement: "unknown",
      accessSchedule: { kind: "unknown" },
      reservationRequirement: "unknown",
      temporaryStatus: "unknown",
      location: {
        kind: "outdoor-point",
        longitude: 114.2078,
        latitude: 22.4188,
        crs: "wgs84",
        precision: "precise",
      },
      observedAt: null,
    },
  })),
  publishCampusMapEdit: vi.fn(),
  reconcileCampusMapEditPublish: vi.fn(async () => ({
    status: "not-committed",
  })),
}));

import { CampusMapRuntime as CampusMapRuntimeView } from "@/components/campus-map/campus-map-runtime";
import {
  encodeCampusMapEditSnapshot,
  transitionCampusMapEdit,
} from "@/lib/campus-map/edit-session";
import { installAmapRuntime } from "../helpers/amap-runtime";
import {
  CAMPUS_MAP_TEST_FACILITIES,
  createCampusMapBrowseFixture,
} from "../helpers/campus-map-browse-projection";
import type { CampusMapBrowseProjection } from "@/lib/campus-map/browse-projection";

function CampusMapRuntime(props: ComponentProps<typeof CampusMapRuntimeView>) {
  return (
    <CampusMapRuntimeView
      initialBrowseProjection={createCampusMapBrowseFixture()}
      {...props}
    />
  );
}

function createNullablePlaceFixture(): CampusMapBrowseProjection {
  const base = createCampusMapBrowseFixture();
  const template = base.places[0]!;
  const building = base.buildings.find(
    (candidate) => candidate.buildingId === template.buildingId,
  )!;
  const buildingOnly = {
    ...template,
    placeId: "building-only-water",
    revisionId: "building-only-water-revision",
    name: "大堂饮水点",
    pinType: "water" as const,
    buildingId: building.buildingId,
    floorId: null,
    floorLabel: null,
    location: {
      kind: "building" as const,
      building: {
        id: building.buildingId,
        name: building.name,
        englishName: building.englishName,
        code: building.code,
      },
    },
    selectionTarget: {
      kind: "place" as const,
      placeId: "building-only-water",
      buildingId: building.buildingId,
      floorId: null,
    },
  };
  const outdoor = {
    ...template,
    placeId: "outdoor-water",
    revisionId: "outdoor-water-revision",
    name: "林荫饮水点",
    pinType: "water" as const,
    buildingId: null,
    floorId: null,
    floorLabel: null,
    location: {
      kind: "outdoor-point" as const,
      point: {
        longitude: 114.2078,
        latitude: 22.4188,
        crs: "wgs84" as const,
        precision: "precise" as const,
      },
    },
    selectionTarget: {
      kind: "place" as const,
      placeId: "outdoor-water",
      buildingId: null,
      floorId: null,
    },
  };
  return {
    ...base,
    buildings: base.buildings.map((candidate) =>
      candidate.buildingId === building.buildingId
        ? {
            ...candidate,
            placeIds: [...candidate.placeIds, buildingOnly.placeId],
          }
        : candidate,
    ),
    places: [buildingOnly, outdoor, ...base.places],
    markers: [
      ...base.markers.map((marker) =>
        marker.kind === "building-presence" &&
        marker.buildingId === building.buildingId &&
        marker.pinType === buildingOnly.pinType
          ? {
              ...marker,
              placeIds: [...marker.placeIds, buildingOnly.placeId],
            }
          : marker,
      ),
      {
        kind: "place",
        placeId: outdoor.placeId,
        pinType: outdoor.pinType,
        position: outdoor.location.point,
      },
    ],
  };
}

const mutableFacilityFixtures = CAMPUS_MAP_TEST_FACILITIES as unknown as Array<
  (typeof CAMPUS_MAP_TEST_FACILITIES)[number]
>;
const originalFacilityFixtures = [...CAMPUS_MAP_TEST_FACILITIES];
const scrollIntoView = vi.fn();
type PositionCallbacks = {
  success: PositionCallback;
  error: PositionErrorCallback;
};
let positionCallbacks: PositionCallbacks[];
let getCurrentPosition: ReturnType<typeof vi.fn>;

function geolocationPosition(
  longitude: number,
  latitude: number,
  accuracy = 24,
) {
  return {
    coords: { longitude, latitude, accuracy },
  } as GeolocationPosition;
}

function geolocationError(code: number) {
  return {
    code,
    PERMISSION_DENIED: 1,
    POSITION_UNAVAILABLE: 2,
    TIMEOUT: 3,
  } as GeolocationPositionError;
}

function restoreFacilityFixtures() {
  mutableFacilityFixtures.splice(
    0,
    mutableFacilityFixtures.length,
    ...originalFacilityFixtures,
  );
}

beforeEach(() => {
  vi.restoreAllMocks();
  scrollIntoView.mockReset();
  Object.defineProperty(Element.prototype, "scrollIntoView", {
    configurable: true,
    value: scrollIntoView,
  });
  window.sessionStorage.clear();
  window.history.replaceState(null, "", "/campus-map");
  restoreFacilityFixtures();
  positionCallbacks = [];
  getCurrentPosition = vi.fn(
    (success: PositionCallback, error: PositionErrorCallback) => {
      positionCallbacks.push({ success, error });
    },
  );
  Object.defineProperty(window.navigator, "geolocation", {
    configurable: true,
    value: { getCurrentPosition },
  });
  mockLoadBrowseProjection.mockReset();
  mockLoadBrowseProjection.mockImplementation(async () =>
    createCampusMapBrowseFixture(),
  );
  mockLoadProviderPoiCard.mockReset();
  mockLoadProviderPoiCard.mockImplementation(
    async ({
      providerObjectId,
      name,
      position,
    }: {
      providerObjectId: string | null;
      name: string;
      position: readonly [number, number];
    }) => {
      if (providerObjectId === "B0J2RXUQB6") {
        return {
          kind: "linked" as const,
          title: "科学馆",
          selectionTarget: {
            kind: "building" as const,
            buildingId: "science-centre",
          },
        };
      }
      if (providerObjectId === "test-wmy-poi") {
        return {
          kind: "linked" as const,
          title: "伍何曼原楼",
          selectionTarget: {
            kind: "building" as const,
            buildingId: "wmy",
          },
        };
      }
      return {
        kind: "transient" as const,
        externalId: providerObjectId ?? `${position[0]},${position[1]}`,
        title: name,
        position,
      };
    },
  );
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        configured: true,
        key: "test-key",
        serviceHost: "/_AMapService",
      }),
    }),
  );
});

afterEach(() => {
  cleanup();
  delete (Element.prototype as { scrollIntoView?: () => void }).scrollIntoView;
  document
    .querySelectorAll("script[data-amap-campus]")
    .forEach((script) => script.remove());
  vi.unstubAllGlobals();
  restoreFacilityFixtures();
});

async function renderWithRuntime(options?: {
  projection?: CampusMapBrowseProjection;
  initialSearch?: string;
  deferConvertFrom?: boolean;
  convertFromFails?: boolean;
  convertFromMutatesInput?: boolean;
  convertFromOffset?: { longitude: number; latitude: number };
  markerClusterStatus?:
    | "ready"
    | "pending"
    | "plugin-error"
    | "constructor-error";
  mapRect?: { top: number; right: number; bottom: number; left: number };
  panelRect?: { top: number; right: number; bottom: number; left: number };
  projectedPoint?: { x: number; y: number };
  placementAnchorPosition?: { longitude: number; latitude: number };
}) {
  const { projection, initialSearch, ...runtimeOptions } = options ?? {};
  const runtime = installAmapRuntime(runtimeOptions);
  render(
    <CampusMapRuntime
      initialBrowseProjection={projection ?? createCampusMapBrowseFixture()}
      initialSearch={initialSearch}
    />,
  );
  await waitFor(() => expect(runtime.maps).toHaveLength(1));
  const map = runtime.maps[0]!;
  await waitFor(() =>
    expect(runtime.coordinateConversionRequests).toHaveLength(1),
  );
  if (!options?.deferConvertFrom) {
    await act(async () => {
      await Promise.resolve();
    });
  }
  return { runtime, map };
}

async function openOutdoorPlaceEdit(
  options?: Parameters<typeof renderWithRuntime>[0],
) {
  const projection = createNullablePlaceFixture();
  const place = projection.places.find(
    (candidate) => candidate.placeId === "outdoor-water",
  )!;
  const rendered = await renderWithRuntime({
    ...options,
    projection,
    initialSearch: `?v=1&scene=place&id=${place.placeId}&snap=peek`,
  });

  await screen.findByRole("heading", { name: place.name });
  fireEvent.click(screen.getByRole("button", { name: "建议修改" }));
  await screen.findByRole("heading", { name: "修改设施" });

  return { ...rendered, place };
}

describe("Campus Map AMap runtime effects", () => {
  it("opens a building-required Add without waiting for coordinate conversion", async () => {
    const { runtime } = await renderWithRuntime({
      deferConvertFrom: true,
      placementAnchorPosition: { longitude: 114.22, latitude: 22.43 },
    });

    fireEvent.click(screen.getByRole("button", { name: "新增设施" }));

    expect(
      await screen.findByRole("heading", { name: "新增设施" }),
    ).not.toBeNull();
    expect(screen.getByRole("group", { name: "所属建筑" })).not.toBeNull();
    expect(screen.queryByRole("button", { name: "使用此位置" })).toBeNull();
    expect(screen.queryByText(/WGS84/)).toBeNull();
    expect(runtime.geocodeRequests).toHaveLength(0);
  });

  it("does not infer a Building from the current map position", async () => {
    const { runtime } = await renderWithRuntime({
      placementAnchorPosition: { longitude: 114.20801, latitude: 22.41966 },
    });

    fireEvent.click(screen.getByRole("button", { name: "新增设施" }));

    const building = await screen.findByRole("combobox", { name: "建筑" });
    expect((building as HTMLSelectElement).value).toBe("");
    expect(
      screen.getByText("请选择设施所在的建筑。楼层不确定时可以不选。"),
    ).not.toBeNull();
    expect(runtime.geocodeRequests).toHaveLength(0);
  });

  it("recenters an existing outdoor Place before repositioning it", async () => {
    const { runtime, map } = await openOutdoorPlaceEdit({
      convertFromOffset: { longitude: 0.01, latitude: 0.01 },
    });
    map.setZoomAndCenter.mockClear();

    fireEvent.click(screen.getByRole("button", { name: "修改位置" }));
    await screen.findByRole("heading", { name: "修改设施位置" });
    await runtime.flushAnimationFrames();

    expect(map.setZoomAndCenter).toHaveBeenCalledWith(
      map.getZoom(),
      expect.objectContaining({
        lng: expect.closeTo(114.2178, 10),
        lat: expect.closeTo(22.4288, 10),
      }),
      true,
      0,
    );
    await act(async () => map.emit("moveend", {}));
    const persisted = JSON.parse(
      window.sessionStorage.getItem("cupedia:campus-map:edit-session:v1")!,
    );
    expect(persisted.session.draft.placementCandidate).toMatchObject({
      longitude: expect.closeTo(114.2078, 10),
      latitude: expect.closeTo(22.4188, 10),
    });
  });

  it("routes coordinate input through an existing outdoor Place edit", async () => {
    const { runtime, map } = await openOutdoorPlaceEdit({
      convertFromOffset: { longitude: 0.01, latitude: 0.01 },
    });
    fireEvent.click(screen.getByRole("button", { name: "修改位置" }));
    await screen.findByRole("heading", { name: "修改设施位置" });
    fireEvent.click(screen.getByRole("button", { name: "输入坐标" }));
    fireEvent.change(screen.getByRole("textbox", { name: "经度（WGS84）" }), {
      target: { value: "114.21" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: "纬度（WGS84）" }), {
      target: { value: "22.42" },
    });
    map.setZoomAndCenter.mockClear();

    fireEvent.click(screen.getByRole("button", { name: "使用输入坐标" }));
    await runtime.flushAnimationFrames();

    expect(map.setZoomAndCenter).toHaveBeenCalledWith(
      map.getZoom(),
      expect.objectContaining({
        lng: expect.closeTo(114.22, 10),
        lat: expect.closeTo(22.43, 10),
      }),
      true,
      0,
    );
    expect(document.activeElement).toBe(
      screen.getByRole("heading", { name: "修改设施" }),
    );
  });

  it("keeps the latest reposition target when an older moveend arrives", async () => {
    const { map } = await openOutdoorPlaceEdit();
    fireEvent.click(screen.getByRole("button", { name: "修改位置" }));
    await screen.findByRole("heading", { name: "修改设施位置" });
    await act(async () => map.emit("moveend", {}));
    await waitFor(() =>
      expect(
        (
          screen.getByRole("button", {
            name: "使用此位置",
          }) as HTMLButtonElement
        ).disabled,
      ).toBe(false),
    );

    await act(async () => {
      map.emit("hotspotclick", {
        id: "science-centre",
        name: "ScienceCentre 科学馆",
        lnglat: { lng: 114.20801, lat: 22.41966 },
      });
    });
    await act(async () => {
      map.center = { lng: 114.2078, lat: 22.4188 };
      map.emit("moveend", {});
    });
    expect(
      (
        screen.getByRole("button", {
          name: "正在确定位置…",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);

    await act(async () => {
      map.center = { lng: 114.20801, lat: 22.41966 };
      map.emit("moveend", {});
    });
    await waitFor(() =>
      expect(
        (
          screen.getByRole("button", {
            name: "使用此位置",
          }) as HTMLButtonElement
        ).disabled,
      ).toBe(false),
    );

    await act(async () => {
      map.center = { lng: 114.2078, lat: 22.4188 };
      map.emit("moveend", {});
    });
    const persisted = JSON.parse(
      window.sessionStorage.getItem("cupedia:campus-map:edit-session:v1")!,
    );
    expect(persisted.session.draft.placementCandidate).toMatchObject({
      longitude: expect.closeTo(114.20801, 10),
      latitude: expect.closeTo(22.41966, 10),
    });
  });

  it("refreshes a dirty outdoor edit after closing during a map gesture", async () => {
    const { map } = await openOutdoorPlaceEdit();
    fireEvent.change(screen.getByRole("textbox", { name: "设施名称或编号" }), {
      target: { value: "林荫饮水点（更新）" },
    });
    fireEvent.click(screen.getByRole("button", { name: "修改位置" }));
    await screen.findByRole("heading", { name: "修改设施位置" });
    await act(async () => map.emit("moveend", {}));
    await waitFor(() =>
      expect(
        (
          screen.getByRole("button", {
            name: "使用此位置",
          }) as HTMLButtonElement
        ).disabled,
      ).toBe(false),
    );

    await act(async () => {
      map.emit("movestart", {});
      map.center = { lng: 114.213, lat: 22.423 };
    });
    fireEvent.click(screen.getByRole("button", { name: "关闭地图编辑" }));
    expect(
      screen.getByRole("alertdialog", { name: "放弃未发布的修改？" }),
    ).not.toBeNull();
    await act(async () => map.emit("moveend", {}));
    fireEvent.click(screen.getByRole("button", { name: "继续编辑" }));

    await waitFor(() => {
      const persisted = JSON.parse(
        window.sessionStorage.getItem("cupedia:campus-map:edit-session:v1")!,
      );
      expect(persisted.session.draft.placementCandidate).toMatchObject({
        longitude: 114.213,
        latitude: 22.423,
      });
    });
  });

  it("initializes when the AMap SDK is already present", async () => {
    const { runtime } = await renderWithRuntime();

    expect(runtime.maps).toHaveLength(1);
    expect(runtime.maps[0]?.mapOptions).toMatchObject({
      rotateEnable: false,
      pitchEnable: false,
    });
    expect(document.querySelector("script[data-amap-campus]")).toBeNull();
  });

  it("restores a placing draft at its saved center after refresh", async () => {
    const started = transitionCampusMapEdit(null, {
      type: "START_ADD",
      idempotencyKey: "10000000-0000-4000-8000-000000000001",
    }).session;
    const saved = transitionCampusMapEdit(started, {
      type: "UPDATE_PLACEMENT_CANDIDATE",
      position: {
        longitude: 114.21,
        latitude: 22.42,
        crs: "wgs84",
        precision: "approximate",
        method: "pointer",
      },
    }).session!;
    window.sessionStorage.setItem(
      "cupedia:campus-map:edit-session:v1",
      encodeCampusMapEditSnapshot(saved),
    );

    const { runtime, map } = await renderWithRuntime({
      convertFromOffset: { longitude: 0.01, latitude: 0.01 },
    });
    await screen.findByRole("heading", { name: "选择设施位置" });
    await runtime.flushAnimationFrames();

    expect(map.setZoomAndCenter).toHaveBeenCalledWith(
      map.getZoom(),
      expect.objectContaining({
        lng: expect.closeTo(114.22, 10),
        lat: expect.closeTo(22.43, 10),
      }),
      true,
      0,
    );
    const persisted = JSON.parse(
      window.sessionStorage.getItem("cupedia:campus-map:edit-session:v1")!,
    );
    expect(persisted.session.draft.placementCandidate).toMatchObject({
      longitude: 114.21,
      latitude: 22.42,
    });
  });

  it("re-resolves transient place context for a locked location after refresh", async () => {
    const started = transitionCampusMapEdit(null, {
      type: "START_ADD",
      idempotencyKey: "10000000-0000-4000-8000-000000000001",
    }).session;
    const saved = transitionCampusMapEdit(started, {
      type: "CONFIRM_POSITION",
      position: {
        longitude: 114.21,
        latitude: 22.42,
        crs: "wgs84",
        precision: "approximate",
        method: "pointer",
      },
    }).session!;
    window.sessionStorage.setItem(
      "cupedia:campus-map:edit-session:v1",
      encodeCampusMapEditSnapshot(saved),
    );

    const { runtime } = await renderWithRuntime({
      convertFromOffset: { longitude: 0.01, latitude: 0.01 },
    });
    await screen.findByRole("heading", { name: "新增设施" });
    await waitFor(() => expect(runtime.geocodeRequests).toHaveLength(1));
    expect(runtime.geocodeRequests[0]?.position).toEqual([
      expect.closeTo(114.22, 10),
      expect.closeTo(22.43, 10),
    ]);

    await runtime.resolveGeocode(0, "complete", {
      regeocode: {
        formattedAddress: "香港中文大学科学馆",
        pois: [{ id: "science-centre", name: "科学馆", distance: "12" }],
      },
    });

    expect(await screen.findByText("科学馆")).not.toBeNull();
    expect(screen.queryByText(/高德参考.*香港中文大学科学馆/)).toBeNull();
    expect(
      window.sessionStorage.getItem("cupedia:campus-map:edit-session:v1"),
    ).not.toContain("science-centre");
  });

  it("opens Add once from an empty category", async () => {
    mutableFacilityFixtures.splice(
      0,
      mutableFacilityFixtures.length,
      ...originalFacilityFixtures.filter(
        (facility) => facility.category !== "printer",
      ),
    );
    const push = vi.spyOn(window.history, "pushState");
    await renderWithRuntime();
    fireEvent.click(screen.getByRole("button", { name: "打印服务" }));
    expect(await screen.findByText("暂无地点")).not.toBeNull();
    push.mockClear();

    fireEvent.click(screen.getByRole("button", { name: "新增打印服务" }));

    expect(
      await screen.findByRole("heading", { name: "新增设施" }),
    ).not.toBeNull();
    expect(screen.getByRole("group", { name: "所属建筑" })).not.toBeNull();
    expect(
      (screen.getByRole("radio", { name: "打印服务" }) as HTMLInputElement)
        .checked,
    ).toBe(true);
    expect(push).toHaveBeenCalledTimes(1);
  });

  it("does not move an already unobscured linked hotspot", async () => {
    const push = vi.spyOn(window.history, "pushState");
    const { runtime, map } = await renderWithRuntime();
    map.setZoomAndCenter.mockClear();
    map.panTo.mockClear();

    await act(async () => {
      map.emit("hotspotclick", {
        id: "B0J2RXUQB6",
        name: "ScienceCentre科学馆",
        lnglat: { lng: 114.20801, lat: 22.41966 },
      });
    });
    await screen.findByRole("heading", { name: "科学馆" });
    await runtime.flushAnimationFrames();

    expect(push).toHaveBeenCalledTimes(1);
    expect(map.setZoomAndCenter).not.toHaveBeenCalled();
    expect(map.panTo).not.toHaveBeenCalled();
  });

  it("does not let a late coordinate projection override a newer linked hotspot", async () => {
    const { runtime, map } = await renderWithRuntime({
      deferConvertFrom: true,
    });

    await act(async () => {
      map.emit("hotspotclick", {
        id: "B0J2RXUQB6",
        name: "ScienceCentre科学馆",
        lnglat: { lng: 114.20801, lat: 22.41966 },
      });
    });
    await screen.findByRole("heading", { name: "科学馆" });

    await runtime.flushCoordinateConversions();
    await runtime.flushAnimationFrames();

    expect(window.location.search).toContain(
      "scene=building&id=science-centre",
    );
    expect(map.setZoomAndCenter).not.toHaveBeenCalled();
  });

  it("does not dismiss a linked hotspot when its companion map click arrives later", async () => {
    const push = vi.spyOn(window.history, "pushState");
    const { runtime, map } = await renderWithRuntime({
      projectedPoint: { x: 360, y: 700 },
    });

    await act(async () => {
      map
        .getContainer()
        .dispatchEvent(new Event("pointerdown", { bubbles: true }));
      map.emit("hotspotclick", {
        id: "B0J2RXUQB6",
        name: "ScienceCentre科学馆",
        lnglat: { lng: 114.20801, lat: 22.41966 },
      });
    });
    await screen.findByRole("heading", { name: "科学馆" });
    await runtime.flushAnimationFrames();

    await act(async () => {
      map.emit("click", { lnglat: { lng: 114.20801, lat: 22.41966 } });
    });

    expect(screen.getByRole("heading", { name: "科学馆" })).not.toBeNull();
    expect(push).toHaveBeenCalledTimes(1);
  });

  it("does not dismiss a linked hotspot when map click arrives first", async () => {
    const push = vi.spyOn(window.history, "pushState");
    const { map } = await renderWithRuntime();

    await act(async () => {
      map
        .getContainer()
        .dispatchEvent(new Event("pointerdown", { bubbles: true }));
      map.emit("click", { lnglat: { lng: 114.20801, lat: 22.41966 } });
      map.emit("hotspotclick", {
        id: "B0J2RXUQB6",
        name: "ScienceCentre科学馆",
        lnglat: { lng: 114.20801, lat: 22.41966 },
      });
      await Promise.resolve();
    });

    expect(
      await screen.findByRole("heading", { name: "科学馆" }),
    ).not.toBeNull();
    expect(push).toHaveBeenCalledTimes(1);
  });

  it("keeps only the latest camera request during rapid hotspot selection", async () => {
    const { runtime, map } = await renderWithRuntime({
      projectedPoint: { x: 360, y: 700 },
    });
    map.setZoomAndCenter.mockClear();
    map.panTo.mockClear();

    await act(async () => {
      map
        .getContainer()
        .dispatchEvent(new Event("pointerdown", { bubbles: true }));
      map.emit("hotspotclick", {
        id: "B0J2RXUQB6",
        name: "ScienceCentre 科学馆",
        lnglat: { lng: 114.20801, lat: 22.41966 },
      });
      map
        .getContainer()
        .dispatchEvent(new Event("pointerdown", { bubbles: true }));
      map.emit("hotspotclick", {
        id: "test-wmy-poi",
        name: "伍何曼原楼",
        lnglat: { lng: 114.21161, lat: 22.4167 },
      });
    });
    await screen.findByRole("heading", { name: "伍何曼原楼" });
    await runtime.flushAnimationFrames();

    expect(window.location.search).toContain("scene=building&id=wmy");
    expect(map.setZoomAndCenter).not.toHaveBeenCalled();
    expect(map.panTo).toHaveBeenCalledTimes(1);
  });

  it("does not let an older provider-mapping response replace the latest Building", async () => {
    let resolveFirst!: (value: {
      kind: "linked";
      title: string;
      selectionTarget: { kind: "building"; buildingId: string };
    }) => void;
    let resolveSecond!: (value: {
      kind: "linked";
      title: string;
      selectionTarget: { kind: "building"; buildingId: string };
    }) => void;
    mockLoadProviderPoiCard
      .mockImplementationOnce(
        () => new Promise((resolve) => (resolveFirst = resolve)),
      )
      .mockImplementationOnce(
        () => new Promise((resolve) => (resolveSecond = resolve)),
      );
    const { map } = await renderWithRuntime();

    await act(async () => {
      map
        .getContainer()
        .dispatchEvent(new Event("pointerdown", { bubbles: true }));
      map.emit("hotspotclick", {
        id: "B0J2RXUQB6",
        name: "科学馆",
        lnglat: { lng: 114.20801, lat: 22.41966 },
      });
      map
        .getContainer()
        .dispatchEvent(new Event("pointerdown", { bubbles: true }));
      map.emit("hotspotclick", {
        id: "test-wmy-poi",
        name: "伍何曼原楼",
        lnglat: { lng: 114.21161, lat: 22.4167 },
      });
    });
    await act(async () =>
      resolveSecond({
        kind: "linked",
        title: "伍何曼原楼",
        selectionTarget: { kind: "building", buildingId: "wmy" },
      }),
    );
    await screen.findByRole("heading", { name: "伍何曼原楼" });

    await act(async () =>
      resolveFirst({
        kind: "linked",
        title: "科学馆",
        selectionTarget: {
          kind: "building",
          buildingId: "science-centre",
        },
      }),
    );

    expect(screen.getByRole("heading", { name: "伍何曼原楼" })).not.toBeNull();
    expect(window.location.search).toContain("scene=building&id=wmy");
  });

  it("does not let a pending provider response replace a newer manual selection", async () => {
    let resolveProvider!: (value: {
      kind: "linked";
      title: string;
      selectionTarget: { kind: "building"; buildingId: string };
    }) => void;
    mockLoadProviderPoiCard.mockImplementationOnce(
      () => new Promise((resolve) => (resolveProvider = resolve)),
    );
    const { map } = await renderWithRuntime();

    await act(async () => {
      map.emit("hotspotclick", {
        id: "test-wmy-poi",
        name: "伍何曼原楼",
        lnglat: { lng: 114.21161, lat: 22.4167 },
      });
    });
    const search = screen.getByPlaceholderText("搜索建筑或地点…");
    fireEvent.change(search, { target: { value: "科学馆" } });
    const scienceResult = await waitFor(() =>
      document.querySelector<HTMLButtonElement>(
        '[data-search-result="science-centre"]',
      ),
    );
    fireEvent.click(scienceResult!);
    await screen.findByRole("heading", { name: "科学馆" });

    await act(async () =>
      resolveProvider({
        kind: "linked",
        title: "伍何曼原楼",
        selectionTarget: { kind: "building", buildingId: "wmy" },
      }),
    );

    expect(screen.getByRole("heading", { name: "科学馆" })).not.toBeNull();
    expect(window.location.search).toContain(
      "scene=building&id=science-centre",
    );
  });

  it("opens an explicitly mapped provider POI as the canonical Place", async () => {
    const placeId = "71000000-0000-4000-8000-000000000005";
    mockLoadProviderPoiCard.mockResolvedValueOnce({
      kind: "linked",
      title: "饮水机",
      selectionTarget: {
        kind: "place",
        placeId,
        buildingId: "university-library",
        floorId: "G",
      },
    });
    const { map } = await renderWithRuntime();

    await act(async () => {
      map.emit("hotspotclick", {
        id: "explicit-library-water",
        name: "高德饮水点",
        lnglat: { lng: 114.2049, lat: 22.4195 },
      });
    });

    await screen.findByRole("heading", { name: "饮水机" });
    expect(window.location.search).toContain(`scene=place&id=${placeId}`);
  });

  it("refreshes a stale projection before opening a newly mapped canonical Place", async () => {
    const latest = createCampusMapBrowseFixture();
    const place = latest.places[0]!;
    const initial = {
      ...latest,
      places: latest.places.filter(
        (candidate) => candidate.placeId !== place.placeId,
      ),
    };
    mockLoadBrowseProjection.mockResolvedValueOnce(latest);
    mockLoadProviderPoiCard.mockResolvedValueOnce({
      kind: "linked",
      title: place.name,
      selectionTarget: place.selectionTarget,
    });
    const { map } = await renderWithRuntime({ projection: initial });

    await act(async () => {
      map.emit("hotspotclick", {
        id: "newly-mapped-place",
        name: place.name,
        lnglat: { lng: 114.2049, lat: 22.4195 },
      });
    });

    expect(mockLoadBrowseProjection).toHaveBeenCalledOnce();
    expect(
      await screen.findByRole("heading", { name: place.name }),
    ).not.toBeNull();
    expect(window.location.search).toContain(`scene=place&id=${place.placeId}`);
    expect(window.location.search).not.toContain("scene=building");
  });

  it("refreshes a stale projection before opening a newly mapped canonical Building", async () => {
    const latest = createCampusMapBrowseFixture();
    const building = latest.buildings[0]!;
    const initial = {
      ...latest,
      buildings: latest.buildings.filter(
        (candidate) => candidate.buildingId !== building.buildingId,
      ),
    };
    mockLoadBrowseProjection.mockResolvedValueOnce(latest);
    mockLoadProviderPoiCard.mockResolvedValueOnce({
      kind: "linked",
      title: building.name,
      selectionTarget: {
        kind: "building",
        buildingId: building.buildingId,
      },
    });
    const { map } = await renderWithRuntime({ projection: initial });

    await act(async () => {
      map.emit("hotspotclick", {
        id: "newly-mapped-building",
        name: building.name,
        lnglat: { lng: 114.2049, lat: 22.4195 },
      });
    });

    expect(mockLoadBrowseProjection).toHaveBeenCalledOnce();
    expect(
      await screen.findByRole("heading", { name: building.name }),
    ).not.toBeNull();
    expect(window.location.search).toContain(
      `scene=building&id=${building.buildingId}`,
    );
  });

  it("shows an explicit error card when a mapped target cannot refresh", async () => {
    const latest = createCampusMapBrowseFixture();
    const place = latest.places[0]!;
    const building = latest.buildings[0]!;
    const initial = {
      ...latest,
      places: latest.places.filter(
        (candidate) => candidate.placeId !== place.placeId,
      ),
    };
    mockLoadBrowseProjection.mockRejectedValueOnce(
      new Error("PROJECTION_UNAVAILABLE"),
    );
    mockLoadProviderPoiCard.mockResolvedValueOnce({
      kind: "linked",
      title: place.name,
      selectionTarget: place.selectionTarget,
    });
    const initialSearch = `?v=1&scene=building&id=${building.buildingId}&snap=full`;
    const { map } = await renderWithRuntime({
      projection: initial,
      initialSearch,
    });

    await act(async () => {
      map.emit("hotspotclick", {
        id: "mapped-target-with-failed-refresh",
        name: place.name,
        lnglat: { lng: 114.2049, lat: 22.4195 },
      });
    });

    expect(
      await screen.findByRole("heading", {
        name: place.name,
      }),
    ).not.toBeNull();
    expect(screen.getByText("暂时无法载入地点资料")).not.toBeNull();
    expect(screen.queryByText(/正式映射/)).toBeNull();
    expect(window.location.search).toBe(initialSearch);
    expect(screen.getByRole("alert")).not.toBeNull();
    expect(screen.queryByRole("button", { name: "展开地点卡片" })).toBeNull();

    fireEvent.keyDown(window, { key: "Escape" });

    await waitFor(() =>
      expect(screen.queryByRole("heading", { name: place.name })).toBeNull(),
    );
    expect(screen.getByRole("heading", { name: building.name })).not.toBeNull();
  });

  it.each([
    ["search", "林荫饮水点", "outdoor-water"],
    ["category", "大堂饮水点", "building-only-water"],
  ])(
    "opens a nullable-context Place from %s as one canonical scene",
    async (entry, name, placeId) => {
      const projection = createNullablePlaceFixture();
      await renderWithRuntime({ projection });

      if (entry === "search") {
        fireEvent.change(screen.getByPlaceholderText("搜索建筑或地点…"), {
          target: { value: name },
        });
      } else {
        fireEvent.click(screen.getByRole("button", { name: "饮水点" }));
      }
      fireEvent.click(
        await screen.findByRole("button", { name: new RegExp(name) }),
      );

      expect(await screen.findByRole("heading", { name })).not.toBeNull();
      expect(window.location.search).toBe(
        `?v=1&scene=place&id=${placeId}&snap=peek`,
      );
      if (entry === "search") {
        expect(
          document.querySelector(`[data-search-result="${placeId}"]`),
        ).toBeNull();
      }
    },
  );

  it("opens a building-only Place from a multi-Place Building marker directory", async () => {
    const projection = createNullablePlaceFixture();
    const buildingOnly = projection.places.find(
      (place) => place.placeId === "building-only-water",
    )!;
    const buildingName = projection.buildings.find(
      (building) => building.buildingId === buildingOnly.buildingId,
    )!.name;
    const { runtime } = await renderWithRuntime({ projection });
    fireEvent.click(screen.getByRole("button", { name: "饮水点" }));

    const buildingPresence = await waitFor(() => {
      const match = runtime.markers.findLast(
        (marker) =>
          marker.content.includes(buildingName) &&
          marker.content.includes("建筑位置参考") &&
          (marker.handlers.get("click") ?? []).length > 0,
      );
      expect(match).toBeDefined();
      return match!;
    });
    await act(async () => buildingPresence.emit("click"));

    const buildingOnlyButton = await screen.findByRole("button", {
      name: /^查看设施：大堂饮水点，/,
    });
    expect((buildingOnlyButton as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(buildingOnlyButton);

    expect(
      await screen.findByRole("heading", { name: "大堂饮水点" }),
    ).not.toBeNull();
    expect(window.location.search).toBe(
      "?v=1&scene=place&id=building-only-water&snap=peek",
    );
  });

  it("opens an outdoor Place marker and focuses its projected public point", async () => {
    const projection = createNullablePlaceFixture();
    const { runtime } = await renderWithRuntime({
      projection,
      projectedPoint: { x: 360, y: 700 },
    });
    fireEvent.click(screen.getByRole("button", { name: "饮水点" }));
    const marker = await waitFor(() => {
      const match = runtime.markers.findLast(
        (candidate) =>
          candidate.content.includes("林荫饮水点") &&
          (candidate.handlers.get("click") ?? []).length > 0,
      );
      expect(match).toBeDefined();
      return match!;
    });

    await act(async () => {
      runtime.maps[0]!.getContainer().dispatchEvent(
        new Event("pointerdown", { bubbles: true }),
      );
      marker.emit("click");
    });
    await runtime.flushAnimationFrames();

    expect(window.location.search).toContain("scene=place&id=outdoor-water");
    expect(
      await screen.findByRole("heading", { name: "林荫饮水点" }),
    ).not.toBeNull();
    expect(runtime.maps[0]!.panTo).toHaveBeenCalled();
  });

  it("opens a mapped outdoor provider target as the same canonical Place", async () => {
    const projection = createNullablePlaceFixture();
    mockLoadProviderPoiCard.mockResolvedValueOnce({
      kind: "linked",
      title: "林荫饮水点",
      selectionTarget: {
        kind: "place",
        placeId: "outdoor-water",
        buildingId: null,
        floorId: null,
      },
    });
    const { runtime } = await renderWithRuntime({ projection });

    await act(async () => {
      runtime.maps[0]!.emit("hotspotclick", {
        id: "mapped-outdoor-water",
        name: "高德饮水点",
        lnglat: { lng: 114.2078, lat: 22.4188 },
      });
    });

    expect(
      await screen.findByRole("heading", { name: "林荫饮水点" }),
    ).not.toBeNull();
    expect(window.location.search).toContain("scene=place&id=outdoor-water");
  });

  it("restores an outdoor Place deep link after refresh", async () => {
    const projection = createNullablePlaceFixture();
    await renderWithRuntime({
      projection,
      initialSearch: "?v=1&scene=place&id=outdoor-water&snap=peek",
    });

    expect(
      await screen.findByRole("heading", { name: "林荫饮水点" }),
    ).not.toBeNull();
    expect(window.location.search).toBe(
      "?v=1&scene=place&id=outdoor-water&snap=peek",
    );
  });

  it.each([
    { edge: "left", point: { x: 10, y: 400 }, target: { lng: 346, lat: 422 } },
    {
      edge: "right",
      point: { x: 710, y: 400 },
      target: { lng: 374, lat: 422 },
    },
    { edge: "top", point: { x: 360, y: 10 }, target: { lng: 360, lat: 408 } },
    {
      edge: "bottom",
      point: { x: 360, y: 700 },
      target: { lng: 360, lat: 550 },
    },
  ])(
    "minimally relocates a hotspot occluded at the $edge safe-area edge",
    async ({ point, target }) => {
      const { runtime, map } = await renderWithRuntime({
        projectedPoint: point,
      });
      map.panTo.mockClear();

      await act(async () => {
        map.emit("hotspotclick", {
          id: "B0J2RXUQB6",
          name: "ScienceCentre 科学馆",
          lnglat: { lng: 114.20801, lat: 22.41966 },
        });
      });
      await screen.findByRole("heading", { name: "科学馆" });
      await runtime.flushAnimationFrames();

      expect(map.panTo).toHaveBeenCalledTimes(1);
      expect(map.panTo).toHaveBeenCalledWith(
        expect.objectContaining(target),
        320,
      );
    },
  );

  it("uses the measured 390px bottom-sheet safe area", async () => {
    const { runtime, map } = await renderWithRuntime({
      mapRect: { top: 0, right: 390, bottom: 844, left: 0 },
      panelRect: { top: 596, right: 390, bottom: 844, left: 0 },
      projectedPoint: { x: 195, y: 700 },
    });
    map.panTo.mockClear();

    await act(async () => {
      map.emit("hotspotclick", {
        id: "B0J2RXUQB6",
        name: "ScienceCentre 科学馆",
        lnglat: { lng: 114.20801, lat: 22.41966 },
      });
    });
    await screen.findByRole("heading", { name: "科学馆" });
    await runtime.flushAnimationFrames();

    expect(map.panTo).toHaveBeenCalledWith(
      expect.objectContaining({ lng: 195, lat: 550 }),
      320,
    );
  });

  it("uses the measured desktop side-panel safe area", async () => {
    const { runtime, map } = await renderWithRuntime({
      mapRect: { top: 0, right: 1280, bottom: 800, left: 0 },
      panelRect: { top: 16, right: 1264, bottom: 784, left: 874 },
      projectedPoint: { x: 1000, y: 400 },
    });
    map.panTo.mockClear();

    await act(async () => {
      map.emit("hotspotclick", {
        id: "B0J2RXUQB6",
        name: "ScienceCentre 科学馆",
        lnglat: { lng: 114.20801, lat: 22.41966 },
      });
    });
    await screen.findByRole("heading", { name: "科学馆" });
    await runtime.flushAnimationFrames();

    expect(map.panTo).toHaveBeenCalledWith(
      expect.objectContaining({ lng: 774, lat: 400 }),
      320,
    );
  });

  it("fits cluster members without selecting the first facility", async () => {
    const { runtime, map } = await renderWithRuntime();
    fireEvent.click(screen.getByRole("button", { name: "饮水点" }));
    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "饮水点" }).textContent).toBe(
        "饮水点 · 2 处",
      ),
    );
    await waitFor(() => {
      expect(
        runtime.clusters.some((cluster) => cluster.data.length === 2),
      ).toBe(true);
    });
    const cluster = runtime.clusters.findLast(
      (candidate) => candidate.data.length === 2,
    )!;
    map.setBounds.mockClear();

    await act(async () => {
      cluster.emit("click", {
        clusterData: [
          { lnglat: { lng: 114.20801, lat: 22.41966 } },
          { lnglat: { lng: 114.20763, lat: 22.41947 } },
        ],
      });
      map.emit("click", { lnglat: { lng: 114.20801, lat: 22.41966 } });
    });

    expect(map.setBounds).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("heading", { name: "饮水点" })).not.toBeNull();
    expect(window.location.search).not.toContain("scene=place");
  });

  it("fits co-located Places before opening their Building presence", async () => {
    const scienceWater = originalFacilityFixtures.find(
      (facility) =>
        facility.buildingId === "science-centre" &&
        facility.category === "water",
    )!;
    mutableFacilityFixtures.push({
      ...scienceWater,
      id: "71000000-0000-4000-8000-000000000006",
      name: "东翼饮水机",
    });

    const { runtime, map } = await renderWithRuntime();
    fireEvent.click(screen.getByRole("button", { name: "饮水点" }));
    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "饮水点" }).textContent).toBe(
        "饮水点 · 3 处",
      ),
    );

    const cluster = await waitFor(() => {
      const match = runtime.clusters.findLast(
        (candidate) => candidate.data.length === 3,
      );
      expect(match).toBeDefined();
      return match!;
    });
    const clusterMarker = cluster.renderCluster();
    expect(clusterMarker.content).toContain('aria-label="3 个饮水点"');
    expect(clusterMarker.content).toContain(">3</button>");

    const positionCounts = new Map<string, number>();
    for (const item of cluster.data) {
      const key = JSON.stringify(item.lnglat);
      positionCounts.set(key, (positionCounts.get(key) ?? 0) + 1);
    }
    const sciencePresence = cluster.data.filter(
      (item) => (positionCounts.get(JSON.stringify(item.lnglat)) ?? 0) > 1,
    );
    expect(sciencePresence).toHaveLength(2);
    map.setBounds.mockClear();
    await act(async () => {
      cluster.emit("click", { clusterData: sciencePresence });
    });
    expect(map.setBounds).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("heading", { name: "科学馆" })).toBeNull();
    expect(screen.getByRole("heading", { name: "饮水点" })).not.toBeNull();
  });

  it("renders one interactive Building presence for co-located Places", async () => {
    const scienceWater = originalFacilityFixtures.find(
      (facility) =>
        facility.buildingId === "science-centre" &&
        facility.category === "water",
    )!;
    const secondPlaceId = "71000000-0000-4000-8000-000000000006";
    mutableFacilityFixtures.push({
      ...scienceWater,
      id: secondPlaceId,
      name: "东翼饮水机",
    });

    const { runtime } = await renderWithRuntime();
    fireEvent.click(screen.getByRole("button", { name: "饮水点" }));
    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "饮水点" }).textContent).toBe(
        "饮水点 · 3 处",
      ),
    );

    const scienceMarkers = await waitFor(() => {
      const cluster = runtime.clusters.findLast(
        (candidate) => candidate.data.length === 3,
      );
      const matches = (cluster?.singleMarkers ?? []).filter(
        (marker) =>
          marker.content.includes("科学馆有 2 个饮水点") ||
          marker.content.includes('style="display:none"'),
      );
      expect(matches).toHaveLength(2);
      return matches;
    });
    const primaryMarker = scienceMarkers.find((marker) =>
      marker.content.includes("科学馆有 2 个饮水点"),
    )!;
    const countOnlyMarker = scienceMarkers.find((marker) =>
      marker.content.includes('style="display:none"'),
    )!;

    expect(primaryMarker.content).toContain('data-cupedia-marker="true"');
    expect(primaryMarker.content).toContain(
      'aria-label="科学馆有 2 个饮水点，建筑位置参考"',
    );
    expect(primaryMarker.handlers.get("click")).toHaveLength(1);
    expect(countOnlyMarker.content).toContain('aria-hidden="true"');
    expect(countOnlyMarker.content).not.toContain("data-cupedia-marker");
    expect(countOnlyMarker.handlers.get("click") ?? []).toHaveLength(0);

    await act(async () => {
      primaryMarker.emit("click");
    });

    expect(
      await screen.findByRole("heading", { name: "科学馆" }),
    ).not.toBeNull();
    expect(screen.getByText(scienceWater.name)).not.toBeNull();
    expect(screen.getByText("东翼饮水机")).not.toBeNull();
  });

  it("shows one selected Building marker for a direct co-located Place", async () => {
    const scienceWater = originalFacilityFixtures.find(
      (facility) =>
        facility.buildingId === "science-centre" &&
        facility.category === "water",
    )!;
    const secondPlaceId = "71000000-0000-4000-8000-000000000006";
    mutableFacilityFixtures.push({
      ...scienceWater,
      id: secondPlaceId,
      name: "东翼饮水机",
    });

    const { runtime } = await renderWithRuntime({
      initialSearch: `?v=1&scene=place&id=${secondPlaceId}&snap=peek`,
    });

    const selectedCluster = await waitFor(() => {
      const cluster = runtime.clusters.at(-1);
      expect(cluster?.data).toHaveLength(1);
      return cluster!;
    });
    expect(selectedCluster.singleMarkers).toHaveLength(1);
    await waitFor(() =>
      expect(selectedCluster.singleMarkers[0]?.content).toContain(
        'aria-pressed="true"',
      ),
    );
  });

  it("projects the University Library water fixture at the library building anchor", async () => {
    const { runtime } = await renderWithRuntime({
      convertFromOffset: { longitude: 0.01, latitude: 0.01 },
    });
    fireEvent.click(screen.getByRole("button", { name: "饮水点" }));
    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "饮水点" }).textContent).toBe(
        "饮水点 · 2 处",
      ),
    );
    await waitFor(() => {
      expect(
        runtime.clusters.some((cluster) =>
          cluster.data.some(
            (item) =>
              Array.isArray(item.lnglat) &&
              Math.abs(item.lnglat[0] - 114.21491129159927) < 1e-12 &&
              Math.abs(item.lnglat[1] - 22.429498675716076) < 1e-12,
          ),
        ),
      ).toBe(true);
    });
  });

  it("keeps one facility selection when a marker emits a companion map click", async () => {
    const push = vi.spyOn(window.history, "pushState");
    const { runtime, map } = await renderWithRuntime();
    fireEvent.click(screen.getByRole("button", { name: "饮水点" }));
    await waitFor(() => {
      expect(
        runtime.markers.some(
          (marker) =>
            marker.content.includes("科学馆") &&
            (marker.handlers.get("click") ?? []).length > 0,
        ),
      ).toBe(true);
    });
    const marker = runtime.markers.findLast(
      (candidate) =>
        candidate.content.includes("科学馆") &&
        (candidate.handlers.get("click") ?? []).length > 0,
    )!;

    await act(async () => {
      map
        .getContainer()
        .dispatchEvent(new Event("pointerdown", { bubbles: true }));
      marker.emit("click");
    });
    await screen.findByRole("heading", { name: "饮水机" });
    await runtime.flushAnimationFrames();

    await act(async () => {
      map.emit("click", { lnglat: { lng: 114.20801, lat: 22.41966 } });
    });

    expect(screen.getByRole("heading", { name: "饮水机" })).not.toBeNull();
    expect(window.location.search).toContain(
      "scene=place&id=71000000-0000-4000-8000-000000000002",
    );
    expect(push).toHaveBeenCalledTimes(1);
  });

  it("keeps category results honest while the marker plugin is pending", async () => {
    await renderWithRuntime({ markerClusterStatus: "pending" });

    fireEvent.click(screen.getByRole("button", { name: "饮水点" }));

    expect(
      await screen.findByRole("heading", { name: "饮水点" }),
    ).not.toBeNull();
    expect(screen.getByRole("status").textContent).toContain(
      "地图标记正在加载",
    );
  });

  it("keeps the result list usable when the marker plugin fails", async () => {
    await renderWithRuntime({ markerClusterStatus: "plugin-error" });

    fireEvent.click(screen.getByRole("button", { name: "饮水点" }));

    expect(
      await screen.findByRole("heading", { name: "饮水点" }),
    ).not.toBeNull();
    expect((await screen.findByRole("status")).textContent).toContain(
      "地图标记加载失败，列表仍可使用",
    );
  });

  it("keeps the result list usable when MarkerCluster construction fails", async () => {
    await renderWithRuntime({ markerClusterStatus: "constructor-error" });

    fireEvent.click(screen.getByRole("button", { name: "饮水点" }));

    expect(
      await screen.findByRole("heading", { name: "饮水点" }),
    ).not.toBeNull();
    expect((await screen.findByRole("status")).textContent).toContain(
      "地图标记加载失败，列表仍可使用",
    );
  });

  it("changes category results without moving the camera", async () => {
    const { map } = await renderWithRuntime();
    map.setZoomAndCenter.mockClear();
    map.panTo.mockClear();
    map.setBounds.mockClear();

    fireEvent.click(screen.getByRole("button", { name: "洗手间" }));
    await screen.findByRole("heading", { name: "洗手间" });
    fireEvent.click(screen.getByRole("button", { name: "饮水点" }));
    await screen.findByRole("heading", { name: "饮水点" });

    expect(map.setZoomAndCenter).not.toHaveBeenCalled();
    expect(map.panTo).not.toHaveBeenCalled();
    expect(map.setBounds).not.toHaveBeenCalled();
  });

  it("keeps the canonical Place selected when programmatic reframe emits a hotspot", async () => {
    const projection = createNullablePlaceFixture();
    const place = projection.places.find(
      (candidate) => candidate.placeId === "outdoor-water",
    )!;
    const { runtime, map } = await renderWithRuntime({
      projection,
      initialSearch: `?v=1&scene=place&id=${place.placeId}&snap=peek`,
    });

    await screen.findByRole("heading", { name: place.name });
    const canonicalSearch = window.location.search;
    expect(
      screen.getByRole("link", { name: "查看完整详情" }).getAttribute("href"),
    ).toBe(`/campus-map/places/${place.placeId}`);

    fireEvent.click(screen.getByRole("button", { name: "定位地点" }));
    map
      .getContainer()
      .dispatchEvent(new Event("pointerdown", { bubbles: true }));
    map.getContainer().dispatchEvent(new Event("pointerup", { bubbles: true }));
    await runtime.flushAnimationFrames();
    await act(async () => {
      map.emit("hotspotclick", {
        programmatic: true,
        id: "provider-east-wing",
        name: "科学馆东座",
        lnglat: { lng: 114.2084, lat: 22.4198 },
      });
    });

    expect(screen.getByRole("heading", { name: place.name })).not.toBeNull();
    expect(screen.queryByRole("heading", { name: "科学馆东座" })).toBeNull();
    expect(window.location.search).toBe(canonicalSearch);
    const selectedMarker = runtime.clusters
      .at(-1)
      ?.singleMarkers.find((marker) =>
        marker.content.includes('aria-pressed="true"'),
      );
    expect(selectedMarker?.content).toContain(
      `data-facility-id="place:${place.placeId}"`,
    );
  });

  it("expires a map gesture when the pointer is released outside the map", async () => {
    const projection = createNullablePlaceFixture();
    const place = projection.places.find(
      (candidate) => candidate.placeId === "outdoor-water",
    )!;
    const { runtime, map } = await renderWithRuntime({
      projection,
      initialSearch: `?v=1&scene=place&id=${place.placeId}&snap=peek`,
    });

    await screen.findByRole("heading", { name: place.name });
    const canonicalSearch = window.location.search;
    map
      .getContainer()
      .dispatchEvent(new Event("pointerdown", { bubbles: true }));
    document.dispatchEvent(new Event("pointerup", { bubbles: true }));
    await runtime.flushAnimationFrames();
    await act(async () => {
      map.emit("hotspotclick", {
        programmatic: true,
        id: "provider-east-wing",
        name: "科学馆东座",
        lnglat: { lng: 114.2084, lat: 22.4198 },
      });
    });

    expect(screen.getByRole("heading", { name: place.name })).not.toBeNull();
    expect(screen.queryByRole("heading", { name: "科学馆东座" })).toBeNull();
    expect(window.location.search).toBe(canonicalSearch);
  });

  it("requests one browser position only after the user asks", async () => {
    await renderWithRuntime();

    expect(getCurrentPosition).not.toHaveBeenCalled();
    fireEvent.change(screen.getByPlaceholderText("搜索建筑或地点…"), {
      target: { value: "科学馆" },
    });
    expect(getCurrentPosition).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "饮水点" }));
    expect(getCurrentPosition).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "使用我的位置" }));

    expect(getCurrentPosition).toHaveBeenCalledTimes(1);
    expect(getCurrentPosition.mock.calls[0]?.[2]).toEqual({
      enableHighAccuracy: true,
      maximumAge: 0,
      timeout: 10_000,
    });
    expect(screen.getByRole("button", { name: "正在定位…" })).toHaveProperty(
      "disabled",
      true,
    );
  });

  it("shows one icon-only location control", async () => {
    await renderWithRuntime();

    const locationButton = screen.getByRole("button", {
      name: "使用我的位置",
    });
    expect(locationButton.textContent).toBe("");
    expect(screen.queryByRole("button", { name: "回到中大校园" })).toBeNull();
  });

  it("shows the current position and sorts category Places by approximate straight-line distance", async () => {
    const projection = createNullablePlaceFixture();
    const { runtime } = await renderWithRuntime({ projection });
    fireEvent.click(screen.getByRole("button", { name: "饮水点" }));
    expect(screen.queryByText(/约.*米/u)).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "使用我的位置" }));
    await act(async () => {
      positionCallbacks[0]!.success(
        geolocationPosition(114.20781, 22.41881, 24),
      );
    });
    await runtime.flushAnimationFrames();

    expect(screen.getByRole("status").textContent).toContain(
      "定位精度约 20 米",
    );
    expect(
      screen.getAllByText(/约 \d+ 米（直线距离）/u).length,
    ).toBeGreaterThan(0);
    const buildingOnlyResult = document.querySelector<HTMLElement>(
      '[data-return-result="building-only-water"]',
    );
    const outdoorResult = document.querySelector<HTMLElement>(
      '[data-return-result="outdoor-water"]',
    );
    expect(buildingOnlyResult?.textContent).toMatch(/约距所在建筑 \d+ 米/u);
    expect(buildingOnlyResult?.textContent).not.toContain("直线距离");
    expect(outdoorResult?.textContent).toMatch(/约 \d+ 米（直线距离）/u);
    expect(screen.queryByText(/步行/u)).toBeNull();
    const resultIds = Array.from(
      document.querySelectorAll<HTMLElement>("[data-return-result]"),
    ).map((element) => element.dataset.returnResult);
    expect(resultIds[0]).toBe("outdoor-water");
    expect(
      runtime.markers.some((marker) =>
        marker.content.includes("data-campus-map-user-location"),
      ),
    ).toBe(true);
  });

  it("warns when browser location accuracy is low", async () => {
    await renderWithRuntime();
    fireEvent.click(screen.getByRole("button", { name: "使用我的位置" }));
    await act(async () => {
      positionCallbacks[0]!.success(
        geolocationPosition(114.2072, 22.4191, 240),
      );
    });

    expect(screen.getByRole("status").textContent).toContain(
      "定位精度较低（约 240 米）",
    );
  });

  it.each([
    [1, "未获定位权限"],
    [2, "暂时无法取得位置"],
    [3, "定位超时"],
  ])(
    "keeps browse controls usable after geolocation error %s",
    async (code, message) => {
      await renderWithRuntime();
      fireEvent.click(screen.getByRole("button", { name: "使用我的位置" }));
      await act(async () => {
        positionCallbacks[0]!.error(geolocationError(code));
      });

      expect(screen.getByRole("alert").textContent).toContain(message);
      expect(screen.getByRole("button", { name: "重试定位" })).not.toBeNull();
      expect(
        screen.getByPlaceholderText("搜索建筑或地点…").hasAttribute("disabled"),
      ).toBe(false);
    },
  );

  it("reports unsupported geolocation without making a request", async () => {
    Reflect.deleteProperty(window.navigator, "geolocation");
    await renderWithRuntime();

    fireEvent.click(screen.getByRole("button", { name: "使用我的位置" }));

    expect(screen.getByRole("alert").textContent).toContain(
      "此浏览器不支持定位",
    );
    expect(getCurrentPosition).not.toHaveBeenCalled();
  });

  it("ignores stale callbacks and clears the in-memory position", async () => {
    const projection = createNullablePlaceFixture();
    const { runtime } = await renderWithRuntime({ projection });
    fireEvent.click(screen.getByRole("button", { name: "饮水点" }));
    fireEvent.click(screen.getByRole("button", { name: "使用我的位置" }));
    await act(async () => {
      positionCallbacks[0]!.error(geolocationError(3));
    });
    fireEvent.click(screen.getByRole("button", { name: "重试定位" }));

    await act(async () => {
      positionCallbacks[0]!.success(geolocationPosition(114.20781, 22.41881));
    });
    expect(screen.getByText(/正在读取你这一次的位置/u)).not.toBeNull();

    await act(async () => {
      positionCallbacks[1]!.success(geolocationPosition(114.20781, 22.41881));
    });
    await runtime.flushAnimationFrames();
    expect(screen.getByText(/定位精度约/u)).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "清除位置" }));

    expect(screen.queryByText(/直线距离/u)).toBeNull();
    expect(screen.getByRole("button", { name: "使用我的位置" })).not.toBeNull();
  });

  it("cancels a queued location camera move when the user clears location", async () => {
    const { runtime, map } = await renderWithRuntime();
    map.panTo.mockClear();
    map.setZoomAndCenter.mockClear();
    fireEvent.click(screen.getByRole("button", { name: "使用我的位置" }));
    await act(async () => {
      positionCallbacks[0]!.success(geolocationPosition(114.2072, 22.4191));
    });

    fireEvent.click(screen.getByRole("button", { name: "清除位置" }));
    await runtime.flushAnimationFrames();

    expect(map.panTo).not.toHaveBeenCalled();
    expect(map.setZoomAndCenter).not.toHaveBeenCalled();
  });

  it.each(["panel close", "browser history"])(
    "cancels a queued location camera move after %s",
    async (dismissal) => {
      const { runtime, map } = await renderWithRuntime({
        projectedPoint: { x: 700, y: 800 },
      });
      map.panTo.mockClear();
      map.setZoomAndCenter.mockClear();
      fireEvent.click(screen.getByRole("button", { name: "饮水点" }));
      fireEvent.click(screen.getByRole("button", { name: "使用我的位置" }));
      await act(async () => {
        positionCallbacks[0]!.success(geolocationPosition(114.2072, 22.4191));
      });

      if (dismissal === "panel close") {
        fireEvent.click(screen.getByRole("button", { name: "关闭饮水点列表" }));
      } else {
        await act(async () => {
          window.dispatchEvent(
            new PopStateEvent("popstate", { state: window.history.state }),
          );
        });
      }
      await runtime.flushAnimationFrames();

      expect(map.panTo).not.toHaveBeenCalled();
      expect(map.setZoomAndCenter).not.toHaveBeenCalled();
    },
  );

  it("does not cancel a newer canonical camera when clearing location", async () => {
    const projection = createNullablePlaceFixture();
    const { runtime, map } = await renderWithRuntime({
      projection,
      projectedPoint: { x: 700, y: 800 },
    });
    map.panTo.mockClear();
    fireEvent.click(screen.getByRole("button", { name: "饮水点" }));
    fireEvent.click(screen.getByRole("button", { name: "使用我的位置" }));
    await act(async () => {
      positionCallbacks[0]!.success(geolocationPosition(114.20781, 22.41881));
    });
    fireEvent.click(screen.getByRole("button", { name: /^林荫饮水点/u }));
    fireEvent.click(screen.getByRole("button", { name: "清除位置" }));

    await runtime.flushAnimationFrames();

    expect(screen.getByRole("heading", { name: "林荫饮水点" })).not.toBeNull();
    expect(map.panTo).toHaveBeenCalledTimes(1);
  });

  it("does not restore a pending location after closing the panel, Back, or unmount", async () => {
    await renderWithRuntime();
    fireEvent.click(screen.getByRole("button", { name: "饮水点" }));
    fireEvent.click(screen.getByRole("button", { name: "使用我的位置" }));
    fireEvent.click(screen.getByRole("button", { name: "关闭饮水点列表" }));
    await act(async () => {
      positionCallbacks[0]!.success(geolocationPosition(114.2072, 22.4191));
    });
    expect(screen.queryByText(/定位精度约/u)).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "使用我的位置" }));
    await act(async () => {
      window.dispatchEvent(
        new PopStateEvent("popstate", { state: window.history.state }),
      );
      positionCallbacks[1]!.success(geolocationPosition(114.2072, 22.4191));
    });
    expect(screen.queryByText(/定位精度约/u)).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "使用我的位置" }));
    cleanup();
    await act(async () => {
      positionCallbacks[2]!.success(geolocationPosition(114.2072, 22.4191));
    });
    expect(document.body.textContent).not.toContain("定位精度约");
  });

  it("keeps an unlinked provider POI transient in the shared card shell", async () => {
    const { runtime, map } = await renderWithRuntime();

    await act(async () => {
      map.emit("hotspotclick", {
        id: "provider-east-wing",
        name: "科学馆东座",
        lnglat: { lng: 114.2084, lat: 22.4198 },
      });
    });

    expect(window.location.search).toBe("?v=1");
    await screen.findByRole("heading", {
      name: "科学馆东座",
    });
    expect(screen.getByText("高德地图地点")).not.toBeNull();
    const providerCard = screen.getByRole("region", { name: "科学馆东座" });
    expect(
      within(providerCard).queryByRole("button", { name: "新增设施" }),
    ).toBeNull();
    expect(screen.queryByRole("button", { name: "新增设施" })).toBeNull();
    expect(screen.queryByRole("button", { name: "建议修改" })).toBeNull();
    expect(screen.queryByRole("link", { name: "查看完整详情" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "科学馆" })).toBeNull();

    await runtime.flushAnimationFrames();
    await act(async () => {
      map
        .getContainer()
        .dispatchEvent(new Event("pointerdown", { bubbles: true }));
      map.emit("click", { lnglat: { lng: 114.2084, lat: 22.4198 } });
    });
    await runtime.flushAnimationFrames();
    expect(screen.queryByRole("heading", { name: "科学馆东座" })).toBeNull();
  });

  it("starts Add from a confirmed AMap Building mapping with the Building selected", async () => {
    const { map } = await renderWithRuntime();

    await act(async () => {
      map.emit("hotspotclick", {
        id: "B0J2RXUQB6",
        name: "ScienceCentre科学馆",
        lnglat: { lng: 114.20801, lat: 22.41966 },
      });
    });

    await screen.findByRole("heading", { name: "科学馆" });
    expect(screen.queryByText("高德地图地点")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "在科学馆新增设施" }));

    expect(
      await screen.findByRole("heading", { name: "新增设施" }),
    ).not.toBeNull();
    const location = screen.getByRole("group", { name: "所属建筑" });
    expect(location.textContent).toContain("科学馆");
    expect(screen.queryByRole("combobox", { name: "建筑" })).toBeNull();
  });

  it("keeps global Add building-required when no canonical Buildings exist", async () => {
    const baseProjection = createCampusMapBrowseFixture();
    const emptyProjection: CampusMapBrowseProjection = {
      ...baseProjection,
      buildings: [],
      places: [],
      markers: [],
    };
    mockLoadBrowseProjection.mockResolvedValue(emptyProjection);
    const { runtime } = await renderWithRuntime({
      projection: emptyProjection,
      convertFromOffset: { longitude: 0.01, latitude: 0.01 },
    });

    fireEvent.click(screen.getByLabelText("新增设施"));

    expect(
      await screen.findByRole("heading", { name: "新增设施" }),
    ).not.toBeNull();
    expect(
      screen.getByText("目前没有可选建筑，暂时无法新增设施。"),
    ).not.toBeNull();
    expect(screen.queryByRole("heading", { name: "选择设施位置" })).toBeNull();
    expect(screen.getByRole("combobox", { name: "建筑" })).toHaveProperty(
      "disabled",
      true,
    );
    expect(screen.getByRole("button", { name: "发布设施" })).toHaveProperty(
      "disabled",
      true,
    );
    expect(screen.queryByText(/高德地图地点：/)).toBeNull();
    expect(runtime.geocodeRequests).toHaveLength(0);
  });

  it("does not bind an exact provider name without an explicit POI mapping", async () => {
    const { map } = await renderWithRuntime();

    await act(async () => {
      map.emit("hotspotclick", {
        id: "unmapped-science-name",
        name: "科学馆",
        lnglat: { lng: 114.20801, lat: 22.41966 },
      });
    });

    expect(
      await screen.findByRole("heading", { name: "科学馆" }),
    ).not.toBeNull();
    expect(screen.getByText("高德地图地点")).not.toBeNull();
    expect(screen.queryByRole("button", { name: "建议修改" })).toBeNull();
    expect(window.location.search).toBe("?v=1");
  });

  it("keeps an unlinked provider card open through its companion map click", async () => {
    const { runtime, map } = await renderWithRuntime();

    await act(async () => {
      map
        .getContainer()
        .dispatchEvent(new Event("pointerdown", { bubbles: true }));
      map.emit("hotspotclick", {
        id: "provider-east-wing",
        name: "科学馆东座",
        lnglat: { lng: 114.2084, lat: 22.4198 },
      });
      map.emit("click", { lnglat: { lng: 114.2084, lat: 22.4198 } });
    });
    await runtime.flushAnimationFrames();

    expect(screen.getByRole("heading", { name: "科学馆东座" })).not.toBeNull();
    expect(window.location.search).toBe("?v=1");
  });

  it("dismisses and reopens an external scene from the shared card X", async () => {
    const { map } = await renderWithRuntime();
    const hotspot = {
      id: "provider-east-wing",
      name: "科学馆东座",
      lnglat: { lng: 114.2084, lat: 22.4198 },
    };

    await act(async () => {
      map
        .getContainer()
        .dispatchEvent(new Event("pointerdown", { bubbles: true }));
      map.emit("hotspotclick", hotspot);
    });
    expect(
      await screen.findByRole("heading", { name: "科学馆东座" }),
    ).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "关闭地点详情" }));
    expect(screen.queryByRole("heading", { name: "科学馆东座" })).toBeNull();
    await act(async () => {
      map
        .getContainer()
        .dispatchEvent(new Event("pointerdown", { bubbles: true }));
      map.emit("hotspotclick", hotspot);
    });

    expect(
      await screen.findByRole("heading", { name: "科学馆东座" }),
    ).not.toBeNull();
    expect(window.location.search).toBe("?v=1");
  });

  it("keeps a mapped card after a queued provider-card focus transition", async () => {
    const { runtime, map } = await renderWithRuntime();

    await act(async () => {
      map
        .getContainer()
        .dispatchEvent(new Event("pointerdown", { bubbles: true }));
      map.emit("hotspotclick", {
        id: "provider-east-wing",
        name: "科学馆东座",
        lnglat: { lng: 114.2084, lat: 22.4198 },
      });
    });
    await act(async () => {
      map
        .getContainer()
        .dispatchEvent(new Event("pointerdown", { bubbles: true }));
      map.emit("hotspotclick", {
        id: "B0J2RXUQB6",
        name: "ScienceCentre 科学馆",
        lnglat: { lng: 114.20801, lat: 22.41966 },
      });
    });
    await screen.findByRole("heading", { name: "科学馆" });

    await runtime.flushAnimationFrames();

    expect(screen.getByRole("heading", { name: "科学馆" })).not.toBeNull();
    expect(window.location.search).toContain(
      "scene=building&id=science-centre",
    );
  });

  it("keeps the newest provider card through rapid target switches", async () => {
    const { runtime, map } = await renderWithRuntime();

    await act(async () => {
      map
        .getContainer()
        .dispatchEvent(new Event("pointerdown", { bubbles: true }));
      map.emit("hotspotclick", {
        id: "provider-east-wing",
        name: "科学馆东座",
        lnglat: { lng: 114.2084, lat: 22.4198 },
      });
    });
    await act(async () => {
      map
        .getContainer()
        .dispatchEvent(new Event("pointerdown", { bubbles: true }));
      map.emit("hotspotclick", {
        id: "B0J2RXUQB6",
        name: "ScienceCentre 科学馆",
        lnglat: { lng: 114.20801, lat: 22.41966 },
      });
    });
    await screen.findByRole("heading", { name: "科学馆" });
    await act(async () => {
      map
        .getContainer()
        .dispatchEvent(new Event("pointerdown", { bubbles: true }));
      map.emit("hotspotclick", {
        id: "provider-garden",
        name: "中药园",
        lnglat: { lng: 114.2069, lat: 22.4178 },
      });
    });
    expect(
      await screen.findByRole("heading", { name: "中药园" }),
    ).not.toBeNull();

    await runtime.flushAnimationFrames();

    expect(screen.getByRole("heading", { name: "中药园" })).not.toBeNull();
    expect(screen.queryByRole("heading", { name: "科学馆" })).toBeNull();
  });

  it("closes a transient provider card when browser history restores", async () => {
    const { map } = await renderWithRuntime();

    await act(async () => {
      map.emit("hotspotclick", {
        id: "provider-east-wing",
        name: "科学馆东座",
        lnglat: { lng: 114.2084, lat: 22.4198 },
      });
    });
    expect(
      await screen.findByRole("heading", { name: "科学馆东座" }),
    ).not.toBeNull();

    await act(async () => {
      window.dispatchEvent(
        new PopStateEvent("popstate", { state: window.history.state }),
      );
    });

    expect(screen.queryByRole("heading", { name: "科学馆东座" })).toBeNull();
  });

  it("fits a search selection but preserves zoom for a building facility", async () => {
    const { runtime, map } = await renderWithRuntime();
    map.zoom = 15;
    map.setZoomAndCenter.mockClear();
    map.panTo.mockClear();

    fireEvent.input(screen.getByPlaceholderText("搜索建筑或地点…"), {
      target: { value: "科学馆" },
    });
    fireEvent.click(await screen.findByRole("button", { name: /科学馆/ }));
    await screen.findByRole("heading", { name: "科学馆" });
    await runtime.flushAnimationFrames();

    expect(map.setZoomAndCenter).toHaveBeenCalledTimes(1);
    expect(map.setZoomAndCenter).toHaveBeenCalledWith(
      17.2,
      expect.anything(),
      true,
      0,
    );

    fireEvent.click(screen.getByRole("button", { name: "展开地点卡片" }));
    map.setZoomAndCenter.mockClear();
    map.panTo.mockClear();
    fireEvent.click(screen.getByRole("button", { name: /洗手间.*公众可达/ }));
    await screen.findByRole("heading", { name: "洗手间" });
    await runtime.flushAnimationFrames();

    expect(map.setZoomAndCenter).not.toHaveBeenCalled();
    expect(map.panTo).not.toHaveBeenCalled();
  });

  it("changes a building floor without moving the camera", async () => {
    const { runtime, map } = await renderWithRuntime();
    await act(async () => {
      map.emit("hotspotclick", {
        id: "B0J2RXUQB6",
        name: "ScienceCentre 科学馆",
        lnglat: { lng: 114.20801, lat: 22.41966 },
      });
    });
    await screen.findByRole("heading", { name: "科学馆" });
    await runtime.flushAnimationFrames();
    fireEvent.click(screen.getByRole("button", { name: "展开地点卡片" }));
    map.setZoomAndCenter.mockClear();
    map.panTo.mockClear();

    fireEvent.click(screen.getByRole("button", { name: "LG/F" }));

    expect(window.location.search).toContain("floor=LG");
    expect(map.setZoomAndCenter).not.toHaveBeenCalled();
    expect(map.panTo).not.toHaveBeenCalled();
  });

  it("repositions once per sheet snap without cumulative drift", async () => {
    const { runtime, map } = await renderWithRuntime();
    await act(async () => {
      map.emit("hotspotclick", {
        id: "B0J2RXUQB6",
        name: "ScienceCentre 科学馆",
        lnglat: { lng: 114.20801, lat: 22.41966 },
      });
    });
    await screen.findByRole("heading", { name: "科学馆" });
    await runtime.flushAnimationFrames();
    await runtime.triggerResize();
    map.setZoomAndCenter.mockClear();
    map.panTo.mockClear();

    for (let round = 0; round < 3; round += 1) {
      runtime.panelRect = { top: 236, right: 720, bottom: 844, left: 0 };
      fireEvent.click(screen.getByRole("button", { name: "展开地点卡片" }));
      await runtime.triggerResize();
      await runtime.flushAnimationFrames();

      runtime.panelRect = { top: 596, right: 720, bottom: 844, left: 0 };
      fireEvent.click(screen.getByRole("button", { name: "收起地点卡片" }));
      await runtime.triggerResize();
      await runtime.flushAnimationFrames();
    }

    expect(map.setZoomAndCenter).not.toHaveBeenCalled();
    expect(map.panTo).toHaveBeenCalledTimes(3);
    const fullTargets = map.panTo.mock.calls.map((call) => call[0]);
    expect(
      new Set(fullTargets.map((target) => `${target.lng},${target.lat}`)).size,
    ).toBe(1);
  });

  it("cancels a pending programmatic camera after a user wheel gesture", async () => {
    const { runtime, map } = await renderWithRuntime();
    map.panTo.mockClear();

    await act(async () => {
      map.emit("hotspotclick", {
        id: "B0J2RXUQB6",
        name: "ScienceCentre 科学馆",
        lnglat: { lng: 114.20801, lat: 22.41966 },
      });
      map.getContainer().dispatchEvent(new WheelEvent("wheel"));
    });
    await runtime.flushAnimationFrames();

    expect(map.panTo).not.toHaveBeenCalled();
  });

  it("cancels a pending programmatic camera when map dragging starts", async () => {
    const { runtime, map } = await renderWithRuntime();
    map.panTo.mockClear();

    await act(async () => {
      map.emit("hotspotclick", {
        id: "B0J2RXUQB6",
        name: "ScienceCentre 科学馆",
        lnglat: { lng: 114.20801, lat: 22.41966 },
      });
      map.emit("dragstart", {});
    });
    await runtime.flushAnimationFrames();

    expect(map.panTo).not.toHaveBeenCalled();
  });

  it("keeps Current facts search and cards usable when the proxy-backed conversion fails", async () => {
    await renderWithRuntime({ convertFromFails: true });

    const status = await screen.findByRole("status");
    expect(status.textContent).toContain("地图暂时不可用");
    expect(status.textContent).not.toContain("高德");

    const search = screen.getByPlaceholderText("搜索建筑或地点…");
    expect(search.hasAttribute("disabled")).toBe(false);
    fireEvent.change(search, { target: { value: "科学馆" } });
    fireEvent.click(await screen.findByRole("button", { name: /科学馆/ }));

    expect(
      await screen.findByRole("heading", { name: "科学馆" }),
    ).not.toBeNull();
  });
});
