import { act } from "@testing-library/react";
import { vi } from "vitest";

type LngLat = { lng: number; lat: number };
type Handler = (event: Record<string, unknown>) => void;

export function installAmapRuntime(options?: {
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
  const rafQueue: FrameRequestCallback[] = [];
  const infoWindowCloseQueue: Array<() => void> = [];
  const resizeObservers: Array<{ callback: ResizeObserverCallback }> = [];

  class MockLngLat implements LngLat {
    constructor(
      public lng: number,
      public lat: number,
    ) {}
  }

  class MockPixel {
    constructor(
      public x: number,
      public y: number,
    ) {}
  }

  class MockMap {
    readonly handlers = new Map<string, Handler[]>();
    zoom = 17.2;
    readonly setZoomAndCenter = vi.fn((zoom: number) => {
      this.zoom = zoom;
    });
    readonly panTo = vi.fn();
    readonly setBounds = vi.fn();
    readonly zoomIn = vi.fn();
    readonly zoomOut = vi.fn();
    readonly destroy = vi.fn();

    constructor(
      readonly containerId: string,
      mapOptions: { zoom?: number },
    ) {
      this.zoom = mapOptions.zoom ?? 17.2;
      runtime.maps.push(this);
    }

    on(event: string, handler: Handler) {
      const handlers = this.handlers.get(event) ?? [];
      handlers.push(handler);
      this.handlers.set(event, handlers);
    }

    emit(event: string, payload: Record<string, unknown>) {
      if (event === "click") {
        for (const infoWindow of runtime.infoWindows) {
          infoWindow.handleMapClick();
        }
      }
      for (const handler of this.handlers.get(event) ?? []) handler(payload);
    }

    plugin(_plugins: readonly string[], callback: () => void) {
      if (options?.markerClusterStatus === "plugin-error") {
        throw new Error("MarkerCluster unavailable");
      }
      if (options?.markerClusterStatus !== "pending") callback();
    }

    getZoom() {
      return this.zoom;
    }

    getContainer() {
      return document.getElementById(this.containerId)!;
    }

    lngLatToContainer() {
      return (
        options?.projectedPoint ?? {
          x: runtime.mapRect.right / 2,
          y: runtime.mapRect.bottom / 2,
        }
      );
    }

    containerToLngLat(pixel: MockPixel) {
      return new MockLngLat(pixel.x, pixel.y);
    }

    remove() {}
    add() {}
  }

  class MockMarker {
    readonly handlers = new Map<string, Array<() => void>>();
    content = "";
    zIndex = 0;

    constructor(private readonly markerOptions: Record<string, unknown> = {}) {
      runtime.markers.push(this);
    }

    on(event: string, handler: () => void) {
      const handlers = this.handlers.get(event) ?? [];
      handlers.push(handler);
      this.handlers.set(event, handlers);
    }

    emit(event: string) {
      for (const handler of this.handlers.get(event) ?? []) handler();
    }

    getExtData() {
      return this.markerOptions.extData as { facilityId?: string } | undefined;
    }

    setContent(content: string) {
      this.content = content;
    }

    setzIndex(zIndex: number) {
      this.zIndex = zIndex;
    }
  }

  class MockMarkerCluster {
    readonly handlers = new Map<string, Handler[]>();
    data: readonly Record<string, unknown>[];
    readonly setMap = vi.fn();

    constructor(
      readonly map: MockMap,
      data: readonly Record<string, unknown>[],
      private readonly clusterOptions: {
        renderMarker?: (input: { marker: MockMarker }) => void;
      },
    ) {
      if (options?.markerClusterStatus === "constructor-error") {
        throw new Error("MarkerCluster construction failed");
      }
      this.data = data;
      runtime.clusters.push(this);
      this.renderSingles();
    }

    private renderSingles() {
      for (const item of this.data) {
        const marker = new MockMarker({ extData: item.extData });
        this.clusterOptions.renderMarker?.({ marker });
      }
    }

    on(event: string, handler: Handler) {
      const handlers = this.handlers.get(event) ?? [];
      handlers.push(handler);
      this.handlers.set(event, handlers);
    }

    emit(event: string, payload: Record<string, unknown>) {
      for (const handler of this.handlers.get(event) ?? []) handler(payload);
    }

    setData(data: readonly Record<string, unknown>[]) {
      this.data = data;
      this.renderSingles();
    }
  }

  class MockInfoWindow {
    private readonly handlers = new Map<string, Array<() => void>>();
    private openState = false;
    readonly close = vi.fn(() => {
      this.openState = false;
      infoWindowCloseQueue.push(() => this.emit("close"));
    });
    readonly open = vi.fn(() => {
      this.openState = true;
    });
    readonly setContent = vi.fn();

    constructor(
      private readonly infoWindowOptions: { closeWhenClickMap?: boolean } = {},
    ) {
      runtime.infoWindows.push(this);
    }

    on(event: string, handler: () => void) {
      const handlers = this.handlers.get(event) ?? [];
      handlers.push(handler);
      this.handlers.set(event, handlers);
    }

    emit(event: string) {
      if (event === "close") this.openState = false;
      for (const handler of this.handlers.get(event) ?? []) handler();
    }

    handleMapClick() {
      if (this.openState && this.infoWindowOptions.closeWhenClickMap) {
        this.close();
      }
    }
  }

  class MockResizeObserver {
    constructor(callback: ResizeObserverCallback) {
      resizeObservers.push({ callback });
    }
    observe() {}
    disconnect() {}
  }

  const runtime = {
    maps: [] as MockMap[],
    markers: [] as MockMarker[],
    clusters: [] as MockMarkerCluster[],
    infoWindows: [] as MockInfoWindow[],
    mapRect: options?.mapRect ?? { top: 0, right: 720, bottom: 844, left: 0 },
    panelRect: options?.panelRect ?? {
      top: 596,
      right: 720,
      bottom: 844,
      left: 0,
    },
    namespace: {
      Map: MockMap,
      Marker: MockMarker,
      MarkerCluster: MockMarkerCluster,
      InfoWindow: MockInfoWindow,
      LngLat: MockLngLat,
      Pixel: MockPixel,
      Bounds: class {
        constructor(
          readonly southWest: LngLat,
          readonly northEast: LngLat,
        ) {}
      },
      convertFrom(
        positions: readonly (readonly [number, number])[],
        _source: "gps",
        callback: (
          status: "complete" | "error",
          result: { locations?: readonly LngLat[] },
        ) => void,
      ) {
        if (options?.convertFromFails) {
          callback("error", {});
          return;
        }
        const offset = options?.convertFromOffset ?? {
          longitude: 0,
          latitude: 0,
        };
        callback("complete", {
          locations: positions.map(
            ([lng, lat]) =>
              new MockLngLat(lng + offset.longitude, lat + offset.latitude),
          ),
        });
      },
    },
    async flushAnimationFrames() {
      await act(async () => {
        while (rafQueue.length) {
          const callbacks = rafQueue.splice(0);
          for (const callback of callbacks) callback(0);
          await Promise.resolve();
        }
      });
    },
    async flushInfoWindowCloseEvents() {
      await act(async () => {
        for (const callback of infoWindowCloseQueue.splice(0)) callback();
      });
    },
    async triggerResize() {
      await act(async () => {
        for (const observer of resizeObservers) {
          observer.callback([], observer as unknown as ResizeObserver);
        }
      });
    },
  };

  vi.stubGlobal("AMap", runtime.namespace);
  vi.stubGlobal("ResizeObserver", MockResizeObserver);
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    rafQueue.push(callback);
    return rafQueue.length;
  });
  vi.stubGlobal("cancelAnimationFrame", (frame: number) => {
    if (rafQueue[frame - 1]) rafQueue[frame - 1] = () => undefined;
  });
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
    function (this: HTMLElement) {
      const value =
        this.tagName === "SECTION" ? runtime.panelRect : runtime.mapRect;
      return {
        ...value,
        width: value.right - value.left,
        height: value.bottom - value.top,
        x: value.left,
        y: value.top,
        toJSON: () => value,
      };
    },
  );

  return runtime;
}
