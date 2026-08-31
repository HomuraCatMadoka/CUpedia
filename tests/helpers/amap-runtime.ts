import { act } from "@testing-library/react";
import { vi } from "vitest";

import { placementAnchorPoint } from "@/lib/campus-map/camera-policy";

type LngLat = { lng: number; lat: number };
type Handler = (event: Record<string, unknown>) => void;

export function installAmapRuntime(options?: {
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
  const rafQueue: FrameRequestCallback[] = [];
  const coordinateConversionQueue: Array<() => void> = [];
  const resizeObservers: Array<{ callback: ResizeObserverCallback }> = [];
  const beginPointerGesture = (element: Element | null) => {
    element?.dispatchEvent(new Event("pointerdown", { bubbles: true }));
  };

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
    center = new MockLngLat(114.2072, 22.4191);
    readonly setZoomAndCenter = vi.fn(
      (zoom: number, center?: LngLat | readonly [number, number]) => {
        this.zoom = zoom;
        if (center && "lng" in center) {
          this.center = new MockLngLat(center.lng, center.lat);
        } else if (center) {
          this.center = new MockLngLat(center[0], center[1]);
        }
      },
    );
    readonly panTo = vi.fn();
    readonly panBy = vi.fn();
    readonly setBounds = vi.fn();
    readonly zoomIn = vi.fn();
    readonly zoomOut = vi.fn();
    readonly destroy = vi.fn();

    constructor(
      readonly containerId: string,
      readonly mapOptions: {
        zoom?: number;
        center?: readonly [number, number];
        rotateEnable?: boolean;
        pitchEnable?: boolean;
      },
    ) {
      this.zoom = mapOptions.zoom ?? 17.2;
      if (mapOptions.center) {
        this.center = new MockLngLat(
          mapOptions.center[0],
          mapOptions.center[1],
        );
      }
      runtime.maps.push(this);
    }

    on(event: string, handler: Handler) {
      const handlers = this.handlers.get(event) ?? [];
      handlers.push(handler);
      this.handlers.set(event, handlers);
    }

    emit(event: string, payload: Record<string, unknown>) {
      if (event === "hotspotclick" && payload.programmatic !== true) {
        beginPointerGesture(this.getContainer());
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

    getCenter() {
      return this.center;
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
      runtime.containerToLngLatRequests.push({ x: pixel.x, y: pixel.y });
      const anchor = placementAnchorPoint({
        width: runtime.mapRect.right - runtime.mapRect.left,
        height: runtime.mapRect.bottom - runtime.mapRect.top,
      });
      if (
        Math.abs(pixel.x - anchor.x) < 0.0001 &&
        Math.abs(pixel.y - anchor.y) < 0.0001
      ) {
        const position = options?.placementAnchorPosition;
        return new MockLngLat(
          position?.longitude ?? this.center.lng,
          position?.latitude ?? this.center.lat,
        );
      }
      return new MockLngLat(pixel.x, pixel.y);
    }

    remove() {}
    add() {}
  }

  class MockGeocoder {
    constructor(readonly geocoderOptions: Record<string, unknown>) {
      runtime.geocoders.push(this);
    }

    getAddress(
      position: readonly [number, number],
      callback: (status: string, result: unknown) => void,
    ) {
      runtime.geocodeRequests.push({ position, callback });
    }
  }

  class MockMarker {
    readonly handlers = new Map<string, Array<() => void>>();
    content = "";
    zIndex = 0;

    constructor(private readonly markerOptions: Record<string, unknown> = {}) {
      this.content =
        typeof markerOptions.content === "string" ? markerOptions.content : "";
      runtime.markers.push(this);
    }

    on(event: string, handler: () => void) {
      const handlers = this.handlers.get(event) ?? [];
      handlers.push(handler);
      this.handlers.set(event, handlers);
    }

    emit(event: string) {
      if (event === "click") {
        beginPointerGesture(document.getElementById("amap-campus-canvas"));
      }
      for (const handler of this.handlers.get(event) ?? []) handler();
    }

    getPosition() {
      const position = this.markerOptions.position as
        | LngLat
        | readonly [number, number]
        | undefined;
      if (!position) return null;
      return "lng" in position
        ? position
        : new MockLngLat(position[0], position[1]);
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
    singleMarkers: MockMarker[] = [];
    readonly setMap = vi.fn();

    constructor(
      readonly map: MockMap,
      data: readonly Record<string, unknown>[],
      private readonly clusterOptions: {
        renderMarker?: (input: { marker: MockMarker }) => void;
        renderClusterMarker?: (input: {
          count: number;
          marker: MockMarker;
        }) => void;
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
      this.singleMarkers = [];
      for (const item of this.data) {
        const marker = new MockMarker({ position: item.lnglat });
        this.singleMarkers.push(marker);
        this.clusterOptions.renderMarker?.({ marker });
      }
    }

    on(event: string, handler: Handler) {
      const handlers = this.handlers.get(event) ?? [];
      handlers.push(handler);
      this.handlers.set(event, handlers);
    }

    emit(event: string, payload: Record<string, unknown>) {
      if (event === "click") {
        beginPointerGesture(this.map.getContainer());
      }
      for (const handler of this.handlers.get(event) ?? []) handler(payload);
    }

    renderCluster(count = this.data.length) {
      const marker = new MockMarker();
      this.clusterOptions.renderClusterMarker?.({ count, marker });
      return marker;
    }

    setData(data: readonly Record<string, unknown>[]) {
      this.data = data;
      this.renderSingles();
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
    geocoders: [] as MockGeocoder[],
    geocodeRequests: [] as Array<{
      position: readonly [number, number];
      callback: (status: string, result: unknown) => void;
    }>,
    containerToLngLatRequests: [] as Array<{ x: number; y: number }>,
    coordinateConversionRequests: [] as Array<
      readonly (readonly [number, number])[]
    >,
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
      Geocoder: MockGeocoder,
      LngLat: MockLngLat,
      Pixel: MockPixel,
      Bounds: class {
        constructor(
          readonly southWest: LngLat,
          readonly northEast: LngLat,
        ) {}
      },
      plugin(_plugins: readonly string[], callback: () => void) {
        callback();
      },
      convertFrom(
        positions: readonly (readonly [number, number])[],
        _source: "gps",
        callback: (
          status: "complete" | "error",
          result: { locations?: readonly LngLat[] },
        ) => void,
      ) {
        runtime.coordinateConversionRequests.push(positions);
        const respond = () => {
          if (options?.convertFromFails) {
            callback("error", {});
            return;
          }
          const originalPositions = positions.map(
            ([lng, lat]) => [lng, lat] as const,
          );
          const offset = options?.convertFromOffset ?? {
            longitude: 0,
            latitude: 0,
          };
          if (options?.convertFromMutatesInput) {
            for (const position of positions) {
              const mutable = position as unknown as {
                0?: number;
                1?: number;
                lng?: number;
                lat?: number;
              };
              mutable.lng = mutable[0];
              mutable.lat = mutable[1];
              delete mutable[0];
              delete mutable[1];
            }
          }
          callback("complete", {
            locations: originalPositions.map(
              ([lng, lat]) =>
                new MockLngLat(lng + offset.longitude, lat + offset.latitude),
            ),
          });
          if (options?.convertFromMutatesInput) {
            positions.forEach((position, index) => {
              const mutable = position as unknown as {
                0?: number;
                1?: number;
                lng?: number;
                lat?: number;
              };
              mutable[0] = originalPositions[index]![0];
              mutable[1] = originalPositions[index]![1];
              delete mutable.lng;
              delete mutable.lat;
            });
          }
        };
        if (options?.deferConvertFrom) {
          coordinateConversionQueue.push(respond);
          return;
        }
        respond();
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
    async flushCoordinateConversions() {
      await act(async () => {
        for (const respond of coordinateConversionQueue.splice(0)) respond();
        await Promise.resolve();
      });
    },
    async resolveGeocode(index: number, status: string, result: unknown) {
      await act(async () => {
        const normalizedResult =
          status === "complete" &&
          result !== null &&
          typeof result === "object" &&
          !("info" in result)
            ? { info: "OK", ...result }
            : result;
        runtime.geocodeRequests[index]?.callback(status, normalizedResult);
        await Promise.resolve();
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
