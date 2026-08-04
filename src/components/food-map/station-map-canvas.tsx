"use client";

import { Map as MapLibreMap, Marker, NavigationControl } from "maplibre-gl";
import { useEffect, useRef, useState } from "react";

import type {
  FoodleRestaurant,
  FoodleStationMap,
} from "@/lib/food-map/restaurant-catalog";
import { getRestaurantHeat } from "@/lib/food-map/restaurant-catalog";

import styles from "./station-map-canvas.module.css";

const MAP_STYLE = "https://tiles.openfreemap.org/styles/positron";

type RestaurantMarker = {
  button: HTMLButtonElement;
  marker: Marker;
};

export function StationMapCanvas({
  station,
  restaurants,
  checkinCounts,
  selectedRestaurantId,
  highlightedRestaurantId,
  onSelectRestaurant,
  onHighlightRestaurant,
}: {
  station: FoodleStationMap;
  restaurants: readonly FoodleRestaurant[];
  checkinCounts: Readonly<Record<string, number>>;
  selectedRestaurantId: string | null;
  highlightedRestaurantId: string | null;
  onSelectRestaurant: (restaurantId: string) => void;
  onHighlightRestaurant: (restaurantId: string | null) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markersRef = useRef<Map<string, RestaurantMarker>>(new Map());
  const onSelectRef = useRef(onSelectRestaurant);
  const onHighlightRef = useRef(onHighlightRestaurant);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    onSelectRef.current = onSelectRestaurant;
    onHighlightRef.current = onHighlightRestaurant;
  }, [onHighlightRestaurant, onSelectRestaurant]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    setLoadState("loading");
    const map = new MapLibreMap({
      container,
      style: MAP_STYLE,
      center: [...station.center],
      zoom: 15.35,
      minZoom: 13,
      maxZoom: 19,
      attributionControl: { compact: true },
    });
    mapRef.current = map;
    map.dragRotate.disable();
    map.touchZoomRotate.disableRotation();
    map.addControl(
      new NavigationControl({ showCompass: false }),
      "bottom-right",
    );

    const stationElement = document.createElement("div");
    stationElement.className = styles.stationMarker;
    stationElement.textContent = station.id;
    stationElement.setAttribute("aria-label", `${station.nameZh}地铁站`);
    const stationMarker = new Marker({ element: stationElement })
      .setLngLat([...station.center])
      .addTo(map);

    const handleLoad = () => setLoadState("ready");
    map.once("load", handleLoad);
    const loadTimeout = window.setTimeout(() => {
      if (!map.isStyleLoaded()) setLoadState("error");
    }, 12_000);
    const resizeObserver = new ResizeObserver(() => map.resize());
    resizeObserver.observe(container);

    return () => {
      window.clearTimeout(loadTimeout);
      resizeObserver.disconnect();
      stationMarker.remove();
      mapRef.current = null;
      map.remove();
    };
  }, [retryKey, station]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    markersRef.current.forEach(({ marker }) => marker.remove());
    const markers = new Map<string, RestaurantMarker>();
    markersRef.current = markers;

    restaurants.forEach((restaurant) => {
      const checkinCount =
        checkinCounts[restaurant.id] ?? restaurant.foodle.totalCheckins;
      const wrapper = document.createElement("div");
      wrapper.className = styles.markerWrap;

      const button = document.createElement("button");
      button.type = "button";
      button.className = `${styles.markerButton} ${styles[getRestaurantHeat(checkinCount)]}`;
      button.textContent = String(checkinCount);
      button.setAttribute(
        "aria-label",
        `${restaurant.sourceFacts.name}，累计打卡 ${checkinCount} 次`,
      );
      button.setAttribute("aria-pressed", "false");
      button.dataset.foodleMarker = restaurant.id;
      button.dataset.selected = "false";
      button.dataset.highlighted = "false";
      button.addEventListener("click", () => {
        onSelectRef.current(restaurant.id);
      });
      button.addEventListener("pointerenter", () => {
        onHighlightRef.current(restaurant.id);
      });
      button.addEventListener("pointerleave", () => {
        onHighlightRef.current(null);
      });
      button.addEventListener("focus", () => {
        onHighlightRef.current(restaurant.id);
      });
      button.addEventListener("blur", () => {
        onHighlightRef.current(null);
      });
      wrapper.append(button);

      if (getRestaurantHeat(checkinCount) === "hot") {
        const fire = document.createElement("span");
        fire.className = styles.fire;
        fire.textContent = "🔥";
        fire.setAttribute("aria-hidden", "true");
        wrapper.append(fire);
      }

      const marker = new Marker({ element: wrapper, anchor: "bottom" })
        .setLngLat([
          restaurant.location.longitude,
          restaurant.location.latitude,
        ])
        .addTo(map);
      markers.set(restaurant.id, { button, marker });
    });

    return () => {
      markers.forEach(({ marker }) => marker.remove());
      if (markersRef.current === markers) {
        markersRef.current = new Map();
      }
    };
  }, [checkinCounts, restaurants, retryKey, station.id]);

  useEffect(() => {
    markersRef.current.forEach(({ button }, restaurantId) => {
      const selected = restaurantId === selectedRestaurantId;
      button.dataset.selected = String(selected);
      button.dataset.highlighted = String(
        restaurantId === highlightedRestaurantId,
      );
      button.setAttribute("aria-pressed", String(selected));
    });

    if (!selectedRestaurantId) return;
    const selectedRestaurant = restaurants.find(
      (restaurant) => restaurant.id === selectedRestaurantId,
    );
    const map = mapRef.current;
    if (!selectedRestaurant || !map) return;

    map.easeTo({
      center: [
        selectedRestaurant.location.longitude,
        selectedRestaurant.location.latitude,
      ],
      zoom: Math.max(map.getZoom(), 16),
      duration: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? 0
        : 280,
    });
  }, [highlightedRestaurantId, restaurants, selectedRestaurantId]);

  return (
    <>
      <div
        ref={containerRef}
        className={styles.canvas}
        data-map-state={loadState}
      />
      {loadState === "loading" ? (
        <div className={styles.mapStatus} role="status">
          正在载入地图…
        </div>
      ) : null}
      {loadState === "error" ? (
        <div className={styles.mapError} role="alert">
          <p className="font-medium">地图暂时无法载入</p>
          <p className="mt-1 text-xs text-muted-foreground">
            请检查网络后重试；餐厅列表仍可使用。
          </p>
          <button
            type="button"
            onClick={() => setRetryKey((key) => key + 1)}
            className="mt-3 min-h-11 rounded-lg border bg-background px-4 text-sm font-medium outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            重新载入
          </button>
        </div>
      ) : null}
    </>
  );
}
