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
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AmapCampusPrototype } from "@/components/campus-map/amap-campus-prototype";
import { AMAP_PROTOTYPE_FACILITIES } from "@/lib/campus-map/amap-prototype-catalog";
import {
  encodeCampusMapEditSnapshot,
  transitionCampusMapEdit,
} from "@/lib/campus-map/edit-session";
import { installAmapRuntime } from "../helpers/amap-runtime";

const mutableFacilityFixtures = AMAP_PROTOTYPE_FACILITIES as unknown as Array<
  (typeof AMAP_PROTOTYPE_FACILITIES)[number]
>;
const originalFacilityFixtures = [...AMAP_PROTOTYPE_FACILITIES];
const scrollIntoView = vi.fn();

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
  window.history.replaceState(null, "", "/prototype/campus-map");
  restoreFacilityFixtures();
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        configured: true,
        key: "test-key",
        securityCode: "test-code",
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
  const runtime = installAmapRuntime(options);
  render(<AmapCampusPrototype />);
  await waitFor(() => expect(runtime.maps).toHaveLength(1));
  return { runtime, map: runtime.maps[0]! };
}

describe("AmapCampusPrototype runtime effects", () => {
  it("uses the visible centre pin rather than the occluded map centre for mobile Add", async () => {
    const { runtime } = await renderWithRuntime({
      convertFromOffset: { longitude: 0.01, latitude: 0.01 },
      mapRect: { top: 0, right: 390, bottom: 720, left: 0 },
      placementAnchorPosition: { longitude: 114.22, latitude: 22.43 },
    });

    fireEvent.click(screen.getByRole("button", { name: "添加地点" }));

    await waitFor(() => expect(runtime.geocodeRequests).toHaveLength(1));
    expect(runtime.containerToLngLatRequests.at(-1)).toEqual({
      x: 195,
      y: expect.closeTo(187.2, 10),
    });
    expect(runtime.geocodeRequests[0]?.position).toEqual([
      expect.closeTo(114.22, 10),
      expect.closeTo(22.43, 10),
    ]);
    expect(screen.getByText(/114\.210000, 22\.420000/)).not.toBeNull();
  });

  it("initializes when the AMap SDK is already present", async () => {
    const { runtime } = await renderWithRuntime();

    expect(runtime.maps).toHaveLength(1);
    expect(document.querySelector("script[data-amap-campus]")).toBeNull();
  });

  it("uses the latest AMap center context while keeping provider data transient", async () => {
    const { runtime, map } = await renderWithRuntime();
    fireEvent.click(screen.getByRole("button", { name: "添加地点" }));

    await waitFor(() => expect(runtime.geocoders).toHaveLength(1));
    await waitFor(() => expect(runtime.geocodeRequests).toHaveLength(1));
    expect(runtime.geocoders[0]?.geocoderOptions).toEqual({
      radius: 150,
      extensions: "all",
    });

    await act(async () => {
      map.center = { lng: 114.211, lat: 22.421 };
      map.emit("moveend", {});
    });
    await waitFor(() => expect(runtime.geocodeRequests).toHaveLength(2));
    await act(async () => {
      map.center = { lng: 114.212, lat: 22.422 };
      map.emit("moveend", {});
    });
    await waitFor(() => expect(runtime.geocodeRequests).toHaveLength(3));

    await runtime.resolveGeocode(2, "complete", {
      regeocode: {
        formattedAddress: "香港中文大学新位置",
        pois: [{ id: "new-poi", name: "新位置", distance: "8" }],
      },
    });
    expect(await screen.findByText("新位置")).not.toBeNull();
    await runtime.resolveGeocode(0, "complete", {
      regeocode: {
        formattedAddress: "旧位置一",
        pois: [{ id: "old-poi-1", name: "旧位置一" }],
      },
    });
    await runtime.resolveGeocode(1, "complete", {
      regeocode: {
        formattedAddress: "旧位置二",
        pois: [{ id: "old-poi-2", name: "旧位置二" }],
      },
    });
    expect(screen.getByText("新位置")).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "使用此位置" }));
    expect(await screen.findByText("新位置")).not.toBeNull();
    expect(screen.getByText(/114\.212000, 22\.422000/)).not.toBeNull();
    expect(screen.queryByText(/高德参考.*香港中文大学新位置/)).toBeNull();
    const restored = JSON.parse(
      window.sessionStorage.getItem("cupedia:campus-map:edit-session:v1")!,
    );
    expect(restored.session).toMatchObject({
      status: "editing",
      draft: {
        placementCandidate: null,
        fact: {
          location: {
            kind: "outdoor-point",
            longitude: 114.212,
            latitude: 22.422,
            crs: "wgs84",
          },
        },
      },
    });
    expect(JSON.stringify(restored)).not.toContain("new-poi");
  });

  it("describes a generic AMap result with the nearby campus building and coordinates", async () => {
    const { runtime, map } = await renderWithRuntime();
    fireEvent.click(screen.getByRole("button", { name: "添加地点" }));
    await waitFor(() => expect(runtime.geocodeRequests).toHaveLength(1));

    await act(async () => {
      map.center = { lng: 114.20801, lat: 22.41966 };
      map.emit("moveend", {});
    });
    await waitFor(() => expect(runtime.geocodeRequests).toHaveLength(2));
    await runtime.resolveGeocode(1, "complete", {
      regeocode: {
        formattedAddress: "香港特别行政区沙田区中央道香港中文大学",
        pois: [{ id: "far-away", name: "远处地点", distance: "90" }],
      },
    });

    expect(await screen.findByText("科学馆附近")).not.toBeNull();
    expect(screen.getByText(/114\.208010, 22\.419660/)).not.toBeNull();
    expect(
      screen.getByText(/高德参考.*香港特别行政区沙田区中央道香港中文大学/),
    ).not.toBeNull();
  });

  it("keeps the location context and schema default name after confirmation", async () => {
    const { runtime, map } = await renderWithRuntime();
    fireEvent.click(screen.getByRole("button", { name: "添加地点" }));
    await waitFor(() => expect(runtime.geocodeRequests).toHaveLength(1));

    await act(async () => {
      map.center = { lng: 114.20801, lat: 22.41966 };
      map.emit("moveend", {});
    });
    await waitFor(() => expect(runtime.geocodeRequests).toHaveLength(2));
    await runtime.resolveGeocode(1, "complete", {
      regeocode: {
        formattedAddress: "香港特别行政区沙田区中央道香港中文大学",
      },
    });

    expect(screen.getByText(/轻点地图名称直接选择/)).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "使用此位置" }));

    expect(await screen.findByText("科学馆附近")).not.toBeNull();
    expect(screen.getByText(/114\.208010, 22\.419660/)).not.toBeNull();
    expect(screen.queryByText(/高德参考/)).toBeNull();
    expect(screen.getByRole("radio", { name: "饮水点" })).not.toBeNull();
    expect(
      screen.queryByRole("textbox", { name: "设施名称或编号" }),
    ).toBeNull();
  });

  it("lets Add select an exact AMap label without publishing provider identity", async () => {
    const { runtime, map } = await renderWithRuntime({
      convertFromOffset: { longitude: 0.01, latitude: 0.01 },
    });
    fireEvent.click(screen.getByRole("button", { name: "添加地点" }));
    await waitFor(() =>
      expect(
        (
          screen.getByRole("button", {
            name: "使用此位置",
          }) as HTMLButtonElement
        ).disabled,
      ).toBe(false),
    );
    map.setZoomAndCenter.mockClear();

    await act(async () => {
      map.emit("hotspotclick", {
        id: "provider-shaw-hall",
        name: "邵逸夫堂",
        lnglat: { lng: 114.217113, lat: 22.430126 },
      });
    });
    await runtime.flushAnimationFrames();

    expect(screen.getByText("邵逸夫堂")).not.toBeNull();
    expect(screen.getByText("高德参考 · 已选中地图标签")).not.toBeNull();
    expect(runtime.infoWindows).toHaveLength(0);
    expect(map.setZoomAndCenter).toHaveBeenCalledWith(
      map.getZoom(),
      expect.objectContaining({
        lng: expect.closeTo(114.217113, 10),
        lat: expect.closeTo(22.430126, 10),
      }),
      true,
      0,
    );
    expect(map.panBy).toHaveBeenCalledWith(0, 844 * 0.26 - 844 / 2, 0);

    await act(async () => map.emit("moveend", {}));
    expect(screen.getByText("邵逸夫堂")).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "使用此位置" }));

    expect(await screen.findByText("邵逸夫堂")).not.toBeNull();
    expect(screen.queryByText("高德地图参考")).toBeNull();
    expect(screen.getByRole("radio", { name: "饮水点" })).not.toBeNull();

    const restored = JSON.parse(
      window.sessionStorage.getItem("cupedia:campus-map:edit-session:v1")!,
    );
    expect(restored.session.draft.fact.location).toMatchObject({
      longitude: expect.closeTo(114.207113, 10),
      latitude: expect.closeTo(22.420126, 10),
      crs: "wgs84",
    });
    expect(JSON.stringify(restored)).not.toContain("provider-shaw-hall");
    expect(JSON.stringify(restored)).not.toContain("邵逸夫堂");
  });

  it("invalidates an exact AMap label when a map drag starts", async () => {
    const { runtime, map } = await renderWithRuntime();
    fireEvent.click(screen.getByRole("button", { name: "添加地点" }));
    await waitFor(() => expect(runtime.geocodeRequests).toHaveLength(1));

    await act(async () => {
      map.emit("hotspotclick", {
        id: "provider-shaw-hall",
        name: "邵逸夫堂",
        lnglat: { lng: map.center.lng, lat: map.center.lat },
      });
    });
    expect(screen.getByText("邵逸夫堂")).not.toBeNull();

    await act(async () => {
      map.emit("dragstart", {});
      map.emit("movestart", {});
      map.emit("dragend", {});
      map.emit("moveend", {});
    });
    await runtime.resolveGeocode(0, "complete", {
      regeocode: {
        formattedAddress: "香港中文大学中央道",
        pois: [{ id: "far-museum", name: "文物馆", distance: "147" }],
      },
    });

    expect(await screen.findByText("地图坐标")).not.toBeNull();
    expect(screen.queryByText("邵逸夫堂")).toBeNull();
  });

  it("routes keyboard placement through the existing camera and focus owner", async () => {
    const { runtime, map } = await renderWithRuntime({
      convertFromOffset: { longitude: 0.01, latitude: 0.01 },
    });
    fireEvent.click(screen.getByRole("button", { name: "添加地点" }));
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
      screen.getByRole("heading", { name: "添加校内设施" }),
    );
  });

  it("keeps the WGS84 conversion baseline when the real AMap API mutates its input", async () => {
    const { map } = await renderWithRuntime({
      convertFromMutatesInput: true,
      convertFromOffset: { longitude: 0.01, latitude: 0.01 },
    });
    fireEvent.click(screen.getByRole("button", { name: "添加地点" }));
    fireEvent.click(screen.getByRole("button", { name: "输入坐标" }));
    fireEvent.change(screen.getByRole("textbox", { name: "经度（WGS84）" }), {
      target: { value: "114.21" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: "纬度（WGS84）" }), {
      target: { value: "22.42" },
    });
    map.setZoomAndCenter.mockClear();

    fireEvent.click(screen.getByRole("button", { name: "使用输入坐标" }));

    expect(map.setZoomAndCenter).toHaveBeenCalledWith(
      map.getZoom(),
      expect.objectContaining({
        lng: expect.closeTo(114.22, 10),
        lat: expect.closeTo(22.43, 10),
      }),
      true,
      0,
    );
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
    await screen.findByRole("heading", { name: "添加校内设施" });
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

  it("recenters on the locked point before a reposition can follow map movement", async () => {
    const { map } = await renderWithRuntime({
      convertFromOffset: { longitude: 0.01, latitude: 0.01 },
    });
    fireEvent.click(screen.getByRole("button", { name: "添加地点" }));
    await act(async () => {
      map.center = { lng: 114.22, lat: 22.43 };
      map.emit("moveend", {});
    });
    await waitFor(() =>
      expect(screen.getByText(/114\.210000, 22\.420000/)).not.toBeNull(),
    );
    fireEvent.click(screen.getByRole("button", { name: "使用此位置" }));

    map.setZoomAndCenter.mockClear();
    await act(async () => {
      map.center = { lng: 114.25, lat: 22.46 };
      map.emit("moveend", {});
    });
    fireEvent.click(screen.getByRole("button", { name: "修改位置" }));

    expect(map.setZoomAndCenter).toHaveBeenCalledWith(
      map.getZoom(),
      expect.objectContaining({
        lng: expect.closeTo(114.22, 10),
        lat: expect.closeTo(22.43, 10),
      }),
      true,
      0,
    );
    await act(async () => map.emit("moveend", {}));
    const persisted = JSON.parse(
      window.sessionStorage.getItem("cupedia:campus-map:edit-session:v1")!,
    );
    expect(persisted.session.draft.placementCandidate).toMatchObject({
      longitude: expect.closeTo(114.21, 10),
      latitude: expect.closeTo(22.42, 10),
    });
  });

  it("ignores an older camera moveend until the latest placement target settles", async () => {
    const { map } = await renderWithRuntime();
    fireEvent.click(screen.getByRole("button", { name: "添加地点" }));
    await waitFor(() =>
      expect(
        (
          screen.getByRole("button", {
            name: "使用此位置",
          }) as HTMLButtonElement
        ).disabled,
      ).toBe(false),
    );
    fireEvent.click(screen.getByRole("button", { name: "使用此位置" }));
    fireEvent.click(screen.getByRole("button", { name: "修改位置" }));

    await act(async () => {
      map.emit("hotspotclick", {
        id: "science-centre",
        name: "ScienceCentre 科学馆",
        lnglat: { lng: 114.20801, lat: 22.41966 },
      });
    });

    await act(async () => {
      map.center = { lng: 114.2072, lat: 22.4191 };
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

    const persisted = JSON.parse(
      window.sessionStorage.getItem("cupedia:campus-map:edit-session:v1")!,
    );
    expect(persisted.session.draft.placementCandidate).toMatchObject({
      longitude: expect.closeTo(114.20801, 10),
      latitude: expect.closeTo(22.41966, 10),
    });

    await act(async () => {
      map.center = { lng: 114.2072, lat: 22.4191 };
      map.emit("moveend", {});
    });
    expect(
      JSON.parse(
        window.sessionStorage.getItem("cupedia:campus-map:edit-session:v1")!,
      ).session.draft.placementCandidate,
    ).toMatchObject({
      longitude: expect.closeTo(114.20801, 10),
      latitude: expect.closeTo(22.41966, 10),
    });

    fireEvent.click(screen.getByRole("button", { name: "使用此位置" }));
    fireEvent.click(screen.getByRole("button", { name: "修改位置" }));
    await act(async () => {
      map.emit("dragstart", {});
      map.emit("movestart", {});
      map.center = { lng: 114.209, lat: 22.421 };
      map.emit("dragend", {});
      map.emit("moveend", {});
    });
    await act(async () => {
      map.center = { lng: 114.20801, lat: 22.41966 };
      map.emit("moveend", {});
    });
    expect(
      JSON.parse(
        window.sessionStorage.getItem("cupedia:campus-map:edit-session:v1")!,
      ).session.draft.placementCandidate,
    ).toMatchObject({
      longitude: expect.closeTo(114.209, 10),
      latitude: expect.closeTo(22.421, 10),
    });

    await act(async () => {
      map.emit("dragstart", {});
      map.emit("movestart", {});
      map.center = { lng: 114.20801, lat: 22.41966 };
      map.emit("dragend", {});
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
  });

  it("lifts the center pin while the map is moving", async () => {
    const { runtime, map } = await renderWithRuntime();
    fireEvent.click(screen.getByRole("button", { name: "添加地点" }));
    await waitFor(() => expect(runtime.geocodeRequests).toHaveLength(1));
    await runtime.resolveGeocode(0, "complete", {
      regeocode: {
        formattedAddress: "香港中文大学中央校园",
        pois: [{ id: "central-campus", name: "中央校园" }],
      },
    });
    const pin = document.querySelector("[data-campus-map-center-pin]");
    expect(pin?.getAttribute("data-moving")).toBe("false");
    expect(screen.getByText("地图坐标")).not.toBeNull();
    expect(screen.getByText("高德参考 · 香港中文大学中央校园")).not.toBeNull();

    await act(async () => map.emit("movestart", {}));
    expect(pin?.getAttribute("data-moving")).toBe("true");
    const pending = screen.getByRole("button", { name: "正在确定位置…" });
    expect((pending as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(pending);
    expect(screen.getByText(/轻点地图名称直接选择/)).not.toBeNull();

    await act(async () => {
      map.center = { lng: 114.211, lat: 22.421 };
      map.emit("moveend", {});
    });
    expect(pin?.getAttribute("data-moving")).toBe("false");
    await waitFor(() =>
      expect(
        (
          screen.getByRole("button", {
            name: "使用此位置",
          }) as HTMLButtonElement
        ).disabled,
      ).toBe(false),
    );
  });

  it("refreshes a placing candidate after closing during a map gesture", async () => {
    const { map } = await renderWithRuntime();
    fireEvent.click(screen.getByRole("button", { name: "添加地点" }));
    await waitFor(() =>
      expect(
        (
          screen.getByRole("button", {
            name: "使用此位置",
          }) as HTMLButtonElement
        ).disabled,
      ).toBe(false),
    );
    fireEvent.click(screen.getByRole("button", { name: "使用此位置" }));
    fireEvent.click(screen.getByRole("button", { name: "修改位置" }));
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

  it("publishes without exposing a source-entry step", async () => {
    await renderWithRuntime();
    fireEvent.click(screen.getByRole("button", { name: "添加地点" }));
    await waitFor(() =>
      expect(
        (
          screen.getByRole("button", {
            name: "使用此位置",
          }) as HTMLButtonElement
        ).disabled,
      ).toBe(false),
    );
    fireEvent.click(screen.getByRole("button", { name: "使用此位置" }));
    expect(screen.queryByLabelText("现场观察时间（香港时间）")).toBeNull();
    expect(screen.queryByText("资料依据")).toBeNull();
    expect(screen.getByRole("button", { name: "发布设施" })).not.toBeNull();
  });

  it("opens Add once from a map long-press", async () => {
    const push = vi.spyOn(window.history, "pushState");
    const { map } = await renderWithRuntime();
    push.mockClear();

    await act(async () => map.emit("longpress", {}));

    expect(
      await screen.findByRole("heading", { name: "选择设施位置" }),
    ).not.toBeNull();
    expect(push).toHaveBeenCalledTimes(1);
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
    fireEvent.click(screen.getByRole("button", { name: "打印机" }));
    expect(await screen.findByText("当前没有已收录地点")).not.toBeNull();
    push.mockClear();

    fireEvent.click(screen.getByRole("button", { name: "添加这个类别的地点" }));

    expect(
      await screen.findByRole("heading", { name: "选择设施位置" }),
    ).not.toBeNull();
    expect(push).toHaveBeenCalledTimes(1);
  });

  it("merges rapid moveend address lookups but keeps the latest candidate", async () => {
    const { runtime, map } = await renderWithRuntime();
    fireEvent.click(screen.getByRole("button", { name: "添加地点" }));
    await waitFor(() => expect(runtime.geocodeRequests).toHaveLength(1));

    await act(async () => {
      map.center = { lng: 114.211, lat: 22.421 };
      map.emit("moveend", {});
    });
    await act(async () => {
      map.center = { lng: 114.212, lat: 22.422 };
      map.emit("moveend", {});
    });
    await act(
      () => new Promise((resolve) => globalThis.setTimeout(resolve, 250)),
    );

    expect(runtime.geocodeRequests).toHaveLength(2);
    expect(runtime.geocodeRequests[1]?.position).toEqual([114.212, 22.422]);
    fireEvent.click(screen.getByRole("button", { name: "使用此位置" }));
    const persisted = JSON.parse(
      window.sessionStorage.getItem("cupedia:campus-map:edit-session:v1")!,
    );
    expect(persisted.session.draft.fact.location).toMatchObject({
      longitude: 114.212,
      latitude: 22.422,
    });
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

  it("does not dismiss an active edit task when the map background is clicked", async () => {
    const { runtime, map } = await renderWithRuntime();
    fireEvent.click(screen.getByRole("button", { name: "添加地点" }));
    await waitFor(() =>
      expect(
        (
          screen.getByRole("button", {
            name: "使用此位置",
          }) as HTMLButtonElement
        ).disabled,
      ).toBe(false),
    );
    fireEvent.click(screen.getByRole("button", { name: "使用此位置" }));
    expect(window.location.search).toContain("task=create");

    await act(async () => {
      map
        .getContainer()
        .dispatchEvent(new Event("pointerdown", { bubbles: true }));
      map.emit("click", { lnglat: { lng: 114.20801, lat: 22.41966 } });
      await Promise.resolve();
    });
    await runtime.flushAnimationFrames();

    expect(window.location.search).toContain("task=create");
    expect(
      screen.getByRole("heading", { name: "添加校内设施" }),
    ).not.toBeNull();
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
        name: "ScienceCentre 科学馆",
        lnglat: { lng: 114.20801, lat: 22.41966 },
      });
      map
        .getContainer()
        .dispatchEvent(new Event("pointerdown", { bubbles: true }));
      map.emit("hotspotclick", {
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
    fireEvent.click(screen.getByRole("button", { name: "饮水机" }));
    await screen.findByRole("heading", { name: "2 栋建筑有饮水机" });
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
    expect(
      screen.getByRole("heading", { name: "2 栋建筑有饮水机" }),
    ).not.toBeNull();
    expect(window.location.search).not.toContain("scene=facility");
  });

  it("projects the University Library water fixture at the library building anchor", async () => {
    const { runtime } = await renderWithRuntime({
      convertFromOffset: { longitude: 0.01, latitude: 0.01 },
    });
    fireEvent.click(screen.getByRole("button", { name: "饮水机" }));
    await screen.findByRole("heading", { name: "2 栋建筑有饮水机" });
    await waitFor(() => {
      expect(
        runtime.clusters.some((cluster) =>
          cluster.data.some(
            (item) =>
              item.facilityId === "71000000-0000-4000-8000-000000000005",
          ),
        ),
      ).toBe(true);
    });

    const libraryWater = runtime.clusters
      .flatMap((cluster) => [...cluster.data])
      .find(
        (item) => item.facilityId === "71000000-0000-4000-8000-000000000005",
      );

    expect(libraryWater?.lnglat).toEqual([
      expect.closeTo(114.21491129159927, 12),
      expect.closeTo(22.429498675716076, 12),
    ]);
  });

  it("keeps one facility selection when a marker emits a companion map click", async () => {
    const push = vi.spyOn(window.history, "pushState");
    const { runtime, map } = await renderWithRuntime();
    fireEvent.click(screen.getByRole("button", { name: "饮水机" }));
    await waitFor(() => {
      expect(
        runtime.markers.some(
          (marker) =>
            marker.getExtData()?.facilityId ===
            "71000000-0000-4000-8000-000000000002",
        ),
      ).toBe(true);
    });
    const marker = runtime.markers.findLast(
      (candidate) =>
        candidate.getExtData()?.facilityId ===
        "71000000-0000-4000-8000-000000000002",
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
      "scene=facility&id=71000000-0000-4000-8000-000000000002",
    );
    expect(push).toHaveBeenCalledTimes(1);
  });

  it("keeps category results honest while the marker plugin is pending", async () => {
    await renderWithRuntime({ markerClusterStatus: "pending" });

    fireEvent.click(screen.getByRole("button", { name: "饮水机" }));

    expect(
      await screen.findByRole("heading", { name: "2 栋建筑有饮水机" }),
    ).not.toBeNull();
    expect(screen.getByRole("status").textContent).toContain(
      "地图标记正在加载",
    );
  });

  it("keeps the result list usable when the marker plugin fails", async () => {
    await renderWithRuntime({ markerClusterStatus: "plugin-error" });

    fireEvent.click(screen.getByRole("button", { name: "饮水机" }));

    expect(
      await screen.findByRole("heading", { name: "2 栋建筑有饮水机" }),
    ).not.toBeNull();
    expect(screen.getByRole("status").textContent).toContain(
      "地图标记加载失败，列表仍可使用",
    );
  });

  it("keeps the result list usable when MarkerCluster construction fails", async () => {
    await renderWithRuntime({ markerClusterStatus: "constructor-error" });

    fireEvent.click(screen.getByRole("button", { name: "饮水机" }));

    expect(
      await screen.findByRole("heading", { name: "2 栋建筑有饮水机" }),
    ).not.toBeNull();
    expect(screen.getByRole("status").textContent).toContain(
      "地图标记加载失败，列表仍可使用",
    );
  });

  it("changes category results without moving the camera", async () => {
    const { map } = await renderWithRuntime();
    map.setZoomAndCenter.mockClear();
    map.panTo.mockClear();
    map.setBounds.mockClear();

    fireEvent.click(screen.getByRole("button", { name: "洗手间" }));
    await screen.findByRole("heading", { name: "2 栋建筑有洗手间" });
    fireEvent.click(screen.getByRole("button", { name: "饮水机" }));
    await screen.findByRole("heading", { name: "2 栋建筑有饮水机" });

    expect(map.setZoomAndCenter).not.toHaveBeenCalled();
    expect(map.panTo).not.toHaveBeenCalled();
    expect(map.setBounds).not.toHaveBeenCalled();
  });

  it("keeps an unlinked provider POI transient in one InfoWindow", async () => {
    const { runtime, map } = await renderWithRuntime();

    await act(async () => {
      map.emit("hotspotclick", {
        id: "provider-east-wing",
        name: "科学馆东座",
        lnglat: { lng: 114.2084, lat: 22.4198 },
      });
    });

    expect(runtime.infoWindows).toHaveLength(1);
    expect(runtime.infoWindows[0]!.setContent).toHaveBeenCalledTimes(1);
    expect(runtime.infoWindows[0]!.open).toHaveBeenCalledTimes(1);
    expect(window.location.search).toBe("?v=1");
    expect(screen.queryByRole("heading", { name: "科学馆" })).toBeNull();

    await runtime.flushAnimationFrames();
    await act(async () => {
      map
        .getContainer()
        .dispatchEvent(new Event("pointerdown", { bubbles: true }));
      map.emit("click", { lnglat: { lng: 114.2084, lat: 22.4198 } });
    });
    await runtime.flushAnimationFrames();
    expect(runtime.infoWindows[0]!.close).toHaveBeenCalledTimes(1);
  });

  it("keeps an unlinked provider InfoWindow open through its companion map click", async () => {
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

    expect(runtime.infoWindows).toHaveLength(1);
    expect(runtime.infoWindows[0]!.open).toHaveBeenCalledTimes(1);
    expect(runtime.infoWindows[0]!.close).not.toHaveBeenCalled();
    expect(window.location.search).toBe("?v=1");
  });

  it("dismisses an external scene when the provider InfoWindow X closes", async () => {
    const { runtime, map } = await renderWithRuntime();
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
    expect(runtime.infoWindows[0]!.open).toHaveBeenCalledTimes(1);

    await act(async () => {
      runtime.infoWindows[0]!.emit("close");
    });
    await act(async () => {
      map
        .getContainer()
        .dispatchEvent(new Event("pointerdown", { bubbles: true }));
      map.emit("hotspotclick", hotspot);
    });

    expect(runtime.infoWindows).toHaveLength(2);
    expect(runtime.infoWindows[1]!.open).toHaveBeenCalledTimes(1);
    expect(window.location.search).toBe("?v=1");
  });

  it("ignores a delayed close event from a driver-owned overlay transition", async () => {
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
        name: "ScienceCentre 科学馆",
        lnglat: { lng: 114.20801, lat: 22.41966 },
      });
    });
    await screen.findByRole("heading", { name: "科学馆" });

    await runtime.flushInfoWindowCloseEvents();

    expect(screen.getByRole("heading", { name: "科学馆" })).not.toBeNull();
    expect(window.location.search).toContain(
      "scene=building&id=science-centre",
    );
  });

  it("does not let an old delayed close dismiss a newer provider POI", async () => {
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
    expect(runtime.infoWindows.at(-1)!.getIsOpen()).toBe(true);

    await runtime.flushInfoWindowCloseEvents();

    expect(runtime.infoWindows.at(-1)!.getIsOpen()).toBe(true);
  });

  it("closes a transient provider InfoWindow when browser history restores", async () => {
    const { runtime, map } = await renderWithRuntime();

    await act(async () => {
      map.emit("hotspotclick", {
        id: "provider-east-wing",
        name: "科学馆东座",
        lnglat: { lng: 114.2084, lat: 22.4198 },
      });
    });
    expect(runtime.infoWindows).toHaveLength(1);

    await act(async () => {
      window.dispatchEvent(
        new PopStateEvent("popstate", { state: window.history.state }),
      );
    });

    expect(runtime.infoWindows[0]!.close).toHaveBeenCalledTimes(1);
  });

  it("fits a search selection but preserves zoom for a building facility", async () => {
    const { runtime, map } = await renderWithRuntime();
    map.zoom = 15;
    map.setZoomAndCenter.mockClear();
    map.panTo.mockClear();

    fireEvent.input(screen.getByPlaceholderText("搜索建筑"), {
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
    fireEvent.click(screen.getByRole("button", { name: "洗手间公众可达" }));
    await screen.findByRole("heading", { name: "洗手间" });
    await runtime.flushAnimationFrames();

    expect(map.setZoomAndCenter).not.toHaveBeenCalled();
    expect(map.panTo).not.toHaveBeenCalled();
  });

  it("changes a building floor without moving the camera", async () => {
    const { runtime, map } = await renderWithRuntime();
    await act(async () => {
      map.emit("hotspotclick", {
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
        name: "ScienceCentre 科学馆",
        lnglat: { lng: 114.20801, lat: 22.41966 },
      });
      map.emit("dragstart", {});
    });
    await runtime.flushAnimationFrames();

    expect(map.panTo).not.toHaveBeenCalled();
  });

  it("fails closed when coordinate conversion fails", async () => {
    await renderWithRuntime({ convertFromFails: true });

    expect(
      await screen.findByRole("heading", { name: "高德地图加载失败" }),
    ).not.toBeNull();
  });
});
