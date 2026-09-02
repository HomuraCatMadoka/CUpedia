"use client";

import { useEffect, useRef, useState } from "react";
import { LocateFixedIcon, LoaderCircleIcon } from "lucide-react";
import maplibregl, { type Marker } from "maplibre-gl";
import { toast } from "sonner";

import {
  type CampusBusPassengerRoute,
  type CampusBusRouteMap,
  type CampusBusStop,
  type LngLat,
} from "@/lib/campus-transport/campus-bus";
import type { BusPosition } from "@/lib/campus-transport/bus-positions";
import { cn } from "@/lib/utils";

import styles from "./campus-route-map.module.css";

const LANDSD_BASEMAP_URL =
  "https://mapapi.geodata.gov.hk/gs/api/v1.0.0/xyz/basemap/WGS84/{z}/{x}/{y}.png";
const LANDSD_LABEL_URL =
  "https://mapapi.geodata.gov.hk/gs/api/v1.0.0/xyz/label/hk/tc/WGS84/{z}/{x}/{y}.png";
const LANDSD_TERMS_URL = "https://api.portal.hkmapservice.gov.hk/tc";

/** 车辆图标：Material Design Icons `bus`（侧视图实心），校徽金黄 + 白色外描边。
 *  双层绘制：白层先画（fill+stroke 整体外扩），金层盖住白层内部，白边仅留在外轮廓。
 *  以 DOM marker 渲染，z-index 高于站点 marker，巴士盖在站点数字之上。 */
const BUS_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill-rule="evenodd">
  <path d="M18,11H6V6H18M16.5,17A1.5,1.5 0 0,1 15,15.5A1.5,1.5 0 0,1 16.5,14A1.5,1.5 0 0,1 18,15.5A1.5,1.5 0 0,1 16.5,17M7.5,17A1.5,1.5 0 0,1 6,15.5A1.5,1.5 0 0,1 7.5,14A1.5,1.5 0 0,1 9,15.5A1.5,1.5 0 0,1 7.5,17M4,16C4,16.88 4.39,17.67 5,18.22V20A1,1 0 0,0 6,21H7A1,1 0 0,0 8,20V19H16V20A1,1 0 0,0 17,21H18A1,1 0 0,0 19,20V18.22C19.61,17.67 20,16.88 20,16V6C20,2.5 16.42,2 12,2C7.58,2 4,2.5 4,6V16Z" fill="#ffffff" stroke="#ffffff" stroke-width="4" stroke-linejoin="round"/>
  <path d="M18,11H6V6H18M16.5,17A1.5,1.5 0 0,1 15,15.5A1.5,1.5 0 0,1 16.5,14A1.5,1.5 0 0,1 18,15.5A1.5,1.5 0 0,1 16.5,17M7.5,17A1.5,1.5 0 0,1 6,15.5A1.5,1.5 0 0,1 7.5,14A1.5,1.5 0 0,1 9,15.5A1.5,1.5 0 0,1 7.5,17M4,16C4,16.88 4.39,17.67 5,18.22V20A1,1 0 0,0 6,21H7A1,1 0 0,0 8,20V19H16V20A1,1 0 0,0 17,21H18A1,1 0 0,0 19,20V18.22C19.61,17.67 20,16.88 20,16V6C20,2.5 16.42,2 12,2C7.58,2 4,2.5 4,6V16Z" fill="#d4a538"/>
</svg>`;

type CampusRouteMapProps = {
  busPositions: BusPosition[];
  onSelectStop: (stopId: string) => void;
  onUserLocated: (coordinates: LngLat) => void;
  route: CampusBusPassengerRoute;
  selectedStopId: string;
  stops: CampusBusStop[];
};

function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function escapeAttributionHtml(value: string) {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[character]!,
  );
}

function routeSourceAttribution(sources: CampusBusRouteMap["sources"]) {
  return sources
    .map((source, index) => {
      const suffix = sources.length > 1 ? ` ${index + 1}` : "";
      return `<a href="${escapeAttributionHtml(source.url)}" target="_blank" rel="noopener noreferrer">${escapeAttributionHtml(source.attribution)}${suffix}</a>`;
    })
    .join(" · ");
}

export function CampusRouteMap({
  busPositions,
  onSelectStop,
  onUserLocated,
  route,
  selectedStopId,
  stops,
}: CampusRouteMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const initialSelectedStopIdRef = useRef(selectedStopId);
  const selectedStopIdRef = useRef(selectedStopId);
  const markerElementsRef = useRef(new Map<string, HTMLButtonElement>());
  const busMarkersRef = useRef(new Map<number, Marker>());
  const userMarkerRef = useRef<Marker | null>(null);
  const onSelectStopRef = useRef(onSelectStop);
  const onUserLocatedRef = useRef(onUserLocated);
  const [locating, setLocating] = useState(false);
  const [mapUnavailable, setMapUnavailable] = useState(false);

  useEffect(() => {
    onSelectStopRef.current = onSelectStop;
    onUserLocatedRef.current = onUserLocated;
  }, [onSelectStop, onUserLocated]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const initialCenter =
      route.map.stopCoordinates[initialSelectedStopIdRef.current] ??
      route.map.stopCoordinates[stops[0]?.id];
    if (!initialCenter) return;

    let map: maplibregl.Map;
    try {
      map = new maplibregl.Map({
        attributionControl: false,
        center: [...initialCenter],
        cooperativeGestures: true,
        dragRotate: false,
        container,
        maxZoom: 19,
        minZoom: 14,
        pitchWithRotate: false,
        touchPitch: false,
        style: {
          version: 8,
          sources: {
            landsd: {
              type: "raster",
              tiles: [LANDSD_BASEMAP_URL],
              tileSize: 256,
              minzoom: 10,
              maxzoom: 20,
              attribution: `© <a href="${LANDSD_TERMS_URL}" target="_blank" rel="noopener noreferrer">Map from Lands Department</a> · route data ${routeSourceAttribution(route.map.sources)}`,
            },
            "landsd-labels": {
              type: "raster",
              tiles: [LANDSD_LABEL_URL],
              tileSize: 256,
              maxzoom: 20,
            },
          },
          layers: [
            { id: "landsd", type: "raster", source: "landsd" },
            {
              id: "landsd-labels",
              type: "raster",
              source: "landsd-labels",
            },
          ],
        },
        zoom: 16.35,
      });
    } catch {
      const fallbackTimer = window.setTimeout(() => setMapUnavailable(true), 0);
      return () => window.clearTimeout(fallbackTimer);
    }

    const handleWebGlContextLost = () => setMapUnavailable(true);
    map.on("webglcontextlost", handleWebGlContextLost);

    const resizeObserver = new ResizeObserver(() => map.resize());
    resizeObserver.observe(container);

    map.addControl(
      new maplibregl.AttributionControl({ compact: true }),
      "bottom-right",
    );

    map.on("load", () => {
      map.addSource("campus-route", {
        type: "geojson",
        data: route.map.geometry,
      });
      map.addLayer({
        id: "campus-route-casing",
        type: "line",
        source: "campus-route",
        paint: {
          "line-color": "#ffffff",
          "line-width": 9,
        },
      });
      map.addLayer({
        id: "campus-route-line",
        type: "line",
        source: "campus-route",
        paint: {
          "line-color": "#5b2a73",
          "line-opacity": 0.96,
          "line-width": 5,
        },
      });
    });

    const markerElements = markerElementsRef.current;
    const groupedStops = new Map<string, CampusBusStop[]>();
    for (const stop of stops) {
      const coordinates = route.map.stopCoordinates[stop.id];
      if (!coordinates) continue;

      const coordinateKey = coordinates.join(",");
      groupedStops.set(coordinateKey, [
        ...(groupedStops.get(coordinateKey) ?? []),
        stop,
      ]);
    }

    for (const group of groupedStops.values()) {
      const coordinates = route.map.stopCoordinates[group[0].id];
      if (!coordinates) continue;

      const marker = document.createElement("button");
      marker.type = "button";
      marker.className = styles.marker;
      marker.dataset.selected = String(
        group.some((stop) => stop.id === initialSelectedStopIdRef.current),
      );
      marker.dataset.docking = "false";
      marker.dataset.stopIds = group.map((stop) => stop.id).join(",");
      marker.setAttribute(
        "aria-pressed",
        String(
          group.some((stop) => stop.id === initialSelectedStopIdRef.current),
        ),
      );
      marker.setAttribute(
        "aria-label",
        group.map((stop) => `${stop.sequence}. ${stop.nameZhHant}`).join("；"),
      );
      marker.textContent = group.map((stop) => stop.sequence).join("/");
      marker.addEventListener("click", () => {
        const currentIndex = group.findIndex(
          (stop) => stop.id === selectedStopIdRef.current,
        );
        const target = group[(currentIndex + 1) % group.length];
        onSelectStopRef.current(target.id);
      });

      new maplibregl.Marker({ element: marker })
        .setLngLat([...coordinates])
        .addTo(map);
      for (const stop of group) markerElements.set(stop.id, marker);
    }

    mapRef.current = map;
    return () => {
      userMarkerRef.current?.remove();
      userMarkerRef.current = null;
      for (const marker of busMarkersRef.current.values()) {
        marker.remove();
      }
      busMarkersRef.current.clear();
      markerElements.clear();
      resizeObserver.disconnect();
      map.off("webglcontextlost", handleWebGlContextLost);
      map.remove();
      mapRef.current = null;
    };
  }, [route, stops]);

  useEffect(() => {
    selectedStopIdRef.current = selectedStopId;
    const updatedElements = new Set<HTMLButtonElement>();
    markerElementsRef.current.forEach((element, stopId) => {
      if (updatedElements.has(element)) return;
      updatedElements.add(element);
      const selected =
        element.dataset.stopIds?.split(",").includes(selectedStopId) ??
        stopId === selectedStopId;
      element.dataset.selected = String(selected);
      element.setAttribute("aria-pressed", String(selected));
    });

    const coordinates = route.map.stopCoordinates[selectedStopId];
    const map = mapRef.current;
    if (!coordinates || !map) return;
    map.easeTo({
      center: [...coordinates],
      duration: prefersReducedMotion() ? 0 : 450,
      zoom: Math.max(map.getZoom(), 16.35),
    });
  }, [route.map.stopCoordinates, selectedStopId]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // 车辆作为 DOM marker 渲染：创建/更新/删除，z-index 高于站点 marker
    const busMarkers = busMarkersRef.current;
    const seenDepartureAt = new Set<number>();
    for (const bus of busPositions) {
      seenDepartureAt.add(bus.departureAt);
      let marker = busMarkers.get(bus.departureAt);
      if (!marker) {
        const element = document.createElement("div");
        element.className = styles.busMarker;
        element.setAttribute("role", "img");
        element.setAttribute("aria-label", "校巴（推算位置）");
        element.innerHTML = BUS_ICON_SVG;
        marker = new maplibregl.Marker({ element })
          .setLngLat([...bus.position])
          .addTo(map);
        busMarkers.set(bus.departureAt, marker);
      } else {
        marker.setLngLat([...bus.position]);
      }
    }
    // 移除已收班的车辆
    for (const [departureAt, marker] of busMarkers) {
      if (seenDepartureAt.has(departureAt)) continue;
      marker.remove();
      busMarkers.delete(departureAt);
    }

    // 进站标记：正在停靠的站点数字底色变黄
    const dockingStopIds = new Set(
      busPositions
        .filter((bus) => bus.atStop && bus.stopId)
        .map((bus) => bus.stopId!),
    );
    const updatedMarkers = new Set<HTMLButtonElement>();
    markerElementsRef.current.forEach((element, stopId) => {
      if (updatedMarkers.has(element)) return;
      updatedMarkers.add(element);
      const stopIds = element.dataset.stopIds?.split(",") ?? [];
      const docking = stopIds.some((id) => dockingStopIds.has(id));
      element.dataset.docking = String(docking);
    });
  }, [busPositions]);

  function locateUser() {
    if (!navigator.geolocation) {
      toast.error("此裝置不支援定位");
      return;
    }

    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        const coordinates: LngLat = [coords.longitude, coords.latitude];
        const map = mapRef.current;
        if (!map) {
          setLocating(false);
          return;
        }

        if (!userMarkerRef.current) {
          const marker = document.createElement("div");
          marker.className = styles.userMarker;
          marker.setAttribute("role", "img");
          marker.setAttribute("aria-label", "我的位置");
          userMarkerRef.current = new maplibregl.Marker({ element: marker })
            .setLngLat([...coordinates])
            .addTo(map);
        } else {
          userMarkerRef.current.setLngLat([...coordinates]);
        }

        map.easeTo({
          center: [...coordinates],
          duration: prefersReducedMotion() ? 0 : 450,
          zoom: 17,
        });
        onUserLocatedRef.current(coordinates);
        setLocating(false);
      },
      () => {
        toast.error("無法取得位置，請檢查定位權限");
        setLocating(false);
      },
      { enableHighAccuracy: true, maximumAge: 30_000, timeout: 10_000 },
    );
  }

  return (
    <section
      className="relative overflow-hidden border-b"
      aria-label={`${route.code} 號線地圖`}
    >
      <div
        ref={containerRef}
        className={styles.map}
        role="region"
        aria-label={`顯示 ${route.code} 號線、沿途站點與選中站點的地圖`}
      />
      {mapUnavailable ? (
        <div
          className="absolute inset-0 z-10 grid place-items-center bg-[#f3f1ec] px-6 text-center"
          role="status"
        >
          <div>
            <p className="font-semibold text-foreground">地圖暫時無法載入</p>
            <p className="mt-1 text-sm text-muted-foreground">
              仍可在下方查看沿途站點與預計班次。
            </p>
          </div>
        </div>
      ) : (
        <a
          href={LANDSD_TERMS_URL}
          target="_blank"
          rel="noreferrer"
          className="absolute bottom-2 left-2 z-10 rounded bg-white/90 px-2 py-1 text-[10px] font-medium text-[#4b4b47] shadow-sm backdrop-blur-sm"
        >
          地政總署 · Map from Lands Department
        </a>
      )}
      <button
        type="button"
        onClick={locateUser}
        disabled={locating}
        className="absolute top-4 right-4 grid size-11 touch-manipulation place-items-center rounded-lg bg-background text-foreground shadow-md ring-1 ring-black/8 transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-[#6f3b86]/35 disabled:opacity-65"
        aria-label="我的位置"
        title="我的位置"
      >
        {locating ? (
          <LoaderCircleIcon className="size-5 animate-spin motion-reduce:animate-none" />
        ) : (
          <LocateFixedIcon className={cn("size-5", "text-[#5b2a73]")} />
        )}
      </button>
    </section>
  );
}
