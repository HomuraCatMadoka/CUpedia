import { expect, type Page } from "@playwright/test";

export type CampusMapE2eMapSnapshot = {
  zoom: number;
  center: readonly [number, number];
  panToCount: number;
  setZoomAndCenterCount: number;
};

type CampusMapE2eMap = {
  emit(event: string, payload: Record<string, unknown>): void;
  project(position: readonly [number, number]): readonly [number, number];
  snapshot(): CampusMapE2eMapSnapshot;
};

async function waitForFakeMap(page: Page) {
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          "__campusMapE2eMap" in window &&
          Boolean(
            (
              window as typeof window & {
                __campusMapE2eMap?: CampusMapE2eMap;
              }
            ).__campusMapE2eMap,
          ),
      ),
    )
    .toBe(true);
}

export async function emitAmapEvent(
  page: Page,
  event: string,
  payload: Record<string, unknown>,
) {
  await waitForFakeMap(page);
  await page.evaluate(
    ({ eventName, eventPayload }) => {
      const runtime = window as typeof window & {
        __campusMapE2eMap: CampusMapE2eMap;
      };
      runtime.__campusMapE2eMap.emit(eventName, eventPayload);
    },
    { eventName: event, eventPayload: payload },
  );
}

export async function emitAmapProviderClick(
  page: Page,
  payload: Record<string, unknown>,
) {
  await waitForFakeMap(page);
  await page.evaluate((eventPayload) => {
    const runtime = window as typeof window & {
      __campusMapE2eMap: CampusMapE2eMap;
    };
    const canvas = document.getElementById("amap-campus-canvas");
    if (!canvas) throw new Error("Campus Map canvas is unavailable");
    canvas.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    canvas.dispatchEvent(new PointerEvent("pointerup", { bubbles: true }));
    runtime.__campusMapE2eMap.emit("hotspotclick", eventPayload);
  }, payload);
}

export async function readAmapSnapshot(page: Page) {
  await waitForFakeMap(page);
  return page.evaluate(() => {
    const runtime = window as typeof window & {
      __campusMapE2eMap: CampusMapE2eMap;
    };
    return runtime.__campusMapE2eMap.snapshot();
  });
}

export async function readAmapProjectedPoint(
  page: Page,
  position: readonly [number, number],
) {
  await waitForFakeMap(page);
  return page.evaluate((target) => {
    const runtime = window as typeof window & {
      __campusMapE2eMap: CampusMapE2eMap;
    };
    return runtime.__campusMapE2eMap.project(target);
  }, position);
}

export async function installFakeCampusMapAmap(page: Page) {
  await page.addInitScript(() => {
    class FakeLngLat {
      constructor(
        public lng: number,
        public lat: number,
      ) {}
    }

    class FakePixel {
      constructor(
        public x: number,
        public y: number,
      ) {}
    }

    class FakeMap {
      private readonly handlers = new Map<
        string,
        Array<(payload: Record<string, unknown>) => void>
      >();
      private zoom: number;
      private center: FakeLngLat;
      private panToCount = 0;
      private setZoomAndCenterCount = 0;

      constructor(
        private readonly containerId: string,
        options: { zoom?: number; center?: readonly [number, number] },
      ) {
        this.zoom = options.zoom ?? 17.2;
        this.center = new FakeLngLat(
          options.center?.[0] ?? 114.2072,
          options.center?.[1] ?? 22.4191,
        );
        const attribution = document.createElement("div");
        attribution.className = "amap-copyright";
        attribution.textContent = "高德地图参考";
        Object.assign(attribution.style, {
          position: "absolute",
          bottom: "0",
          left: "0",
          height: "16px",
        });
        document.getElementById(containerId)?.append(attribution);
        Object.defineProperty(window, "__campusMapE2eMap", {
          configurable: true,
          value: this,
        });
      }

      private get pixelsPerDegree() {
        return 100_000 * 2 ** (this.zoom - 17.2);
      }

      private normalizeLngLat(
        position: FakeLngLat | readonly [number, number],
      ) {
        return position instanceof FakeLngLat
          ? position
          : new FakeLngLat(position[0], position[1]);
      }

      on(event: string, handler: (payload: Record<string, unknown>) => void) {
        const handlers = this.handlers.get(event) ?? [];
        handlers.push(handler);
        this.handlers.set(event, handlers);
      }

      emit(event: string, payload: Record<string, unknown>) {
        for (const handler of this.handlers.get(event) ?? []) handler(payload);
      }

      snapshot() {
        return {
          zoom: this.zoom,
          center: [this.center.lng, this.center.lat] as const,
          panToCount: this.panToCount,
          setZoomAndCenterCount: this.setZoomAndCenterCount,
        };
      }

      project(position: readonly [number, number]) {
        const pixel = this.lngLatToContainer(position);
        return [pixel.x, pixel.y] as const;
      }

      plugin(_plugins: readonly string[], callback: () => void) {
        callback();
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

      setZoomAndCenter(
        zoom: number,
        center: FakeLngLat | readonly [number, number],
      ) {
        this.setZoomAndCenterCount += 1;
        this.zoom = zoom;
        this.center = this.normalizeLngLat(center);
      }

      lngLatToContainer(position: FakeLngLat | readonly [number, number]) {
        const point = this.normalizeLngLat(position);
        const bounds = this.getContainer().getBoundingClientRect();
        return new FakePixel(
          bounds.width / 2 +
            (point.lng - this.center.lng) * this.pixelsPerDegree,
          bounds.height / 2 -
            (point.lat - this.center.lat) * this.pixelsPerDegree,
        );
      }

      containerToLngLat(pixel: FakePixel | readonly [number, number]) {
        const point =
          pixel instanceof FakePixel
            ? pixel
            : new FakePixel(pixel[0], pixel[1]);
        const bounds = this.getContainer().getBoundingClientRect();
        return new FakeLngLat(
          this.center.lng + (point.x - bounds.width / 2) / this.pixelsPerDegree,
          this.center.lat -
            (point.y - bounds.height / 2) / this.pixelsPerDegree,
        );
      }

      panTo(center: FakeLngLat | readonly [number, number]) {
        this.panToCount += 1;
        this.center = this.normalizeLngLat(center);
      }
      panBy() {}
      setBounds() {}
      zoomIn() {
        this.zoom += 1;
      }
      zoomOut() {
        this.zoom -= 1;
      }
      destroy() {}
      remove() {}
      add() {}
    }

    class FakeGeocoder {
      getAddress(
        _position: readonly [number, number],
        callback: (status: string, result: unknown) => void,
      ) {
        queueMicrotask(() =>
          callback("complete", {
            info: "OK",
            regeocode: {
              formattedAddress: "香港中文大学",
              pois: [],
            },
          }),
        );
      }
    }

    class FakeMarker {
      private readonly handlers = new Map<string, Array<() => void>>();
      private content = "";
      private element: HTMLElement | null = null;

      constructor(
        private readonly options: {
          position?: FakeLngLat | readonly [number, number];
        } = {},
      ) {}

      on(event: string, handler: () => void) {
        const handlers = this.handlers.get(event) ?? [];
        handlers.push(handler);
        this.handlers.set(event, handlers);
      }

      getPosition() {
        const position = this.options.position;
        if (!position) return null;
        return position instanceof FakeLngLat
          ? position
          : new FakeLngLat(position[0], position[1]);
      }

      setContent(content: string) {
        this.content = content;
        if (this.element) this.element.innerHTML = content;
      }

      setzIndex() {}

      mount(map: FakeMap) {
        const element = document.createElement("div");
        element.dataset.amapMarker = "true";
        element.innerHTML = this.content;
        element.addEventListener("click", () => {
          for (const handler of this.handlers.get("click") ?? []) handler();
        });
        map.getContainer().append(element);
        this.element = element;
      }

      remove() {
        this.element?.remove();
        this.element = null;
      }
    }

    class FakeMarkerCluster {
      private readonly markers: FakeMarker[] = [];

      constructor(
        private readonly map: FakeMap,
        data: readonly { lnglat: FakeLngLat | readonly [number, number] }[],
        private readonly options: {
          renderMarker?: (input: { marker: FakeMarker }) => void;
        },
      ) {
        this.setData(data);
      }

      on() {}

      setData(
        data: readonly { lnglat: FakeLngLat | readonly [number, number] }[],
      ) {
        this.setMap(null);
        for (const item of data) {
          const marker = new FakeMarker({ position: item.lnglat });
          this.options.renderMarker?.({ marker });
          marker.mount(this.map);
          this.markers.push(marker);
        }
      }

      setMap(map: FakeMap | null) {
        if (map) return;
        for (const marker of this.markers) marker.remove();
        this.markers.length = 0;
      }
    }

    Object.defineProperty(window, "AMap", {
      configurable: true,
      value: {
        Map: FakeMap,
        Marker: FakeMarker,
        MarkerCluster: FakeMarkerCluster,
        Geocoder: FakeGeocoder,
        LngLat: FakeLngLat,
        Pixel: FakePixel,
        Bounds: class {
          constructor(
            public southWest: FakeLngLat,
            public northEast: FakeLngLat,
          ) {}
        },
        plugin(_plugins: readonly string[], callback: () => void) {
          callback();
        },
        convertFrom(
          positions: readonly (readonly [number, number])[],
          _source: string,
          callback: (
            status: string,
            result: { locations: FakeLngLat[] },
          ) => void,
        ) {
          callback("complete", {
            locations: positions.map(
              ([longitude, latitude]) => new FakeLngLat(longitude, latitude),
            ),
          });
        },
      },
    });
  });
}
