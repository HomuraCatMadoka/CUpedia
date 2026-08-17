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
import { installAmapRuntime } from "../helpers/amap-runtime";

beforeEach(() => {
  vi.restoreAllMocks();
  window.history.replaceState(null, "", "/prototype/campus-map");
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
  document
    .querySelectorAll("script[data-amap-campus]")
    .forEach((script) => script.remove());
  vi.unstubAllGlobals();
});

async function renderWithRuntime(options?: {
  convertFromFails?: boolean;
  convertFromOffset?: { longitude: number; latitude: number };
  markerClusterStatus?:
    | "ready"
    | "pending"
    | "plugin-error"
    | "constructor-error";
  mapRect?: { top: number; right: number; bottom: number; left: number };
  panelRect?: { top: number; right: number; bottom: number; left: number };
  projectedPoint?: { x: number; y: number };
}) {
  const runtime = installAmapRuntime(options);
  render(<AmapCampusPrototype />);
  await waitFor(() => expect(runtime.maps).toHaveLength(1));
  return { runtime, map: runtime.maps[0]! };
}

describe("AmapCampusPrototype runtime effects", () => {
  it("initializes when the AMap SDK is already present", async () => {
    const { runtime } = await renderWithRuntime();

    expect(runtime.maps).toHaveLength(1);
    expect(document.querySelector("script[data-amap-campus]")).toBeNull();
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
          cluster.data.some((item) => item.facilityId === "library-gf-water"),
        ),
      ).toBe(true);
    });

    const libraryWater = runtime.clusters
      .flatMap((cluster) => [...cluster.data])
      .find((item) => item.facilityId === "library-gf-water");

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
          (marker) => marker.getExtData()?.facilityId === "science-1f-water",
        ),
      ).toBe(true);
    });
    const marker = runtime.markers.findLast(
      (candidate) => candidate.getExtData()?.facilityId === "science-1f-water",
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
      "scene=facility&id=science-1f-water",
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

    expect(runtime.infoWindows[0]!.open).toHaveBeenCalledTimes(2);
    expect(window.location.search).toBe("?v=1");
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
