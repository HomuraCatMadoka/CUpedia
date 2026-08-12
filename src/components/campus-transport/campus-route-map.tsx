"use client";

import { useEffect, useRef, useState } from "react";
import { LocateFixedIcon, LoaderCircleIcon } from "lucide-react";
import maplibregl, { type Marker } from "maplibre-gl";
import { toast } from "sonner";

import {
  type CampusBusRoute,
  type CampusBusStop,
  type LngLat,
} from "@/lib/campus-transport/campus-bus";
import { cn } from "@/lib/utils";

import styles from "./campus-route-map.module.css";

const LANDSD_BASEMAP_URL =
  "https://mapapi.geodata.gov.hk/gs/api/v1.0.0/xyz/basemap/WGS84/{z}/{x}/{y}.png";
const LANDSD_LABEL_URL =
  "https://mapapi.geodata.gov.hk/gs/api/v1.0.0/xyz/label/hk/tc/WGS84/{z}/{x}/{y}.png";
const LANDSD_TERMS_URL = "https://api.portal.hkmapservice.gov.hk/tc";

type CampusRouteMapProps = {
  onSelectStop: (stopId: string) => void;
  onUserLocated: (coordinates: LngLat) => void;
  route: CampusBusRoute;
  selectedStopId: string;
  stops: CampusBusStop[];
};

function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function CampusRouteMap({
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

    const map = new maplibregl.Map({
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
            attribution: `© <a href="${LANDSD_TERMS_URL}" target="_blank">Map from Lands Department</a> · route data <a href="${route.map.sourceUrl}" target="_blank">${route.map.attribution}</a>`,
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

    const onMapError = () => setMapUnavailable(true);
    map.on("error", onMapError);

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
      markerElements.clear();
      resizeObserver.disconnect();
      map.off("error", onMapError);
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
