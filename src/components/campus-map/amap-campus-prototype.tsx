"use client";

import {
  type CSSProperties,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import {
  ArrowLeftIcon,
  DropletsIcon,
  LocateFixedIcon,
  MapPinIcon,
  MinusIcon,
  PlusIcon,
  PrinterIcon,
  SearchIcon,
  ToiletIcon,
  XIcon,
} from "lucide-react";

import { CampusMapEditSheet } from "./edit-sheet";
import { useCampusMapEditSessionOwner } from "./use-campus-map-edit-session-owner";

import {
  CameraRequestGate,
  MOBILE_PLACEMENT_ANCHOR_RATIO,
  cameraPolicyFor,
  deriveCameraPadding,
  nearestVisibleCameraPoint,
  placementAnchorPoint,
  type CameraReason,
  type ScreenRect,
} from "@/lib/campus-map/camera-policy";
import {
  AmapInteractionAdapter,
  resolveAmapHotspotTarget,
} from "@/lib/campus-map/amap-interaction-adapter";
import {
  createAmapGeocoderAdapter,
  createAmapPlaceContextResolver,
  type AmapGeocoderService,
  type AmapPlaceContextResolver,
  type AmapPlaceContextResult,
  type AmapResolvedPlaceContext,
} from "@/lib/campus-map/amap-place-context";
import {
  parseCampusMapState,
  type CampusMapCatalog,
  type CampusMapState,
} from "@/lib/campus-map/map-state";
import {
  facilityMarkerContent,
  type CampusMapAmenity,
} from "@/lib/campus-map/facility-marker";
import {
  AMAP_PROTOTYPE_BUILDINGS as BUILDINGS,
  AMAP_PROTOTYPE_CAMPUS_CENTER as CAMPUS_CENTER,
  AMAP_PROTOTYPE_FACILITIES as FACILITIES,
  type AmapPrototypeBuilding as Building,
  type AmapPrototypeFacility as Facility,
  type AmapPrototypePosition as Position,
} from "@/lib/campus-map/amap-prototype-catalog";
import {
  CampusMapSceneDriver,
  type CampusMapDriverCameraCommand,
  type CampusMapDriverEffectContext,
  type CampusMapDriverIntent,
  type CampusMapSceneDriverPorts,
} from "@/lib/campus-map/scene-driver";
import {
  decodeCampusMapUrl,
  encodeCampusMapUrl,
} from "@/lib/campus-map/scene-codec";
import {
  EMPTY_CAMPUS_MAP_SCENE_SESSION,
  type CampusMapSceneCatalog,
  type CampusMapSession,
} from "@/lib/campus-map/scene-kernel";
import type { CampusMapFactSchema } from "@/lib/campus-map/fact-store";
import { cn } from "@/lib/utils";

type Amenity = CampusMapAmenity;

interface AMapLngLat {
  lng: number;
  lat: number;
}

interface AMapPixel {
  x: number;
  y: number;
}

interface AMapEvent {
  id?: string;
  name?: string;
  lnglat: AMapLngLat;
  clusterData?: ReadonlyArray<{
    lnglat: AMapLngLat | Position;
  }>;
  originEvent?: { target?: Element | null };
}

interface AMapMarker {
  on(event: string, handler: () => void): void;
  getExtData(): { facilityId?: string } | undefined;
  setContent(content: string): void;
  setzIndex(zIndex: number): void;
}

interface AMapMarkerCluster {
  on(event: string, handler: (event: AMapEvent) => void): void;
  setData(data: readonly Record<string, unknown>[]): void;
  setMap(map: AMapMap | null): void;
}

interface AMapInfoWindow {
  close(): void;
  on(event: "close", handler: () => void): void;
  open(map: AMapMap, position: AMapLngLat): void;
  setContent(content: HTMLElement): void;
}

interface AMapMap {
  add(overlays: readonly AMapMarker[] | AMapMarker): void;
  remove(overlays: readonly AMapMarker[]): void;
  on(event: string, handler: (event: AMapEvent) => void): void;
  plugin(plugins: readonly string[], callback: () => void): void;
  getZoom(): number;
  getContainer(): HTMLElement;
  getCenter(): AMapLngLat;
  lngLatToContainer(position: AMapLngLat): AMapPixel;
  containerToLngLat(position: AMapPixel): AMapLngLat;
  setZoomAndCenter(
    zoom: number,
    center: AMapLngLat | Position,
    immediately?: boolean,
    duration?: number,
  ): void;
  panBy(x: number, y: number, duration?: number): void;
  panTo(position: AMapLngLat, duration?: number): void;
  setBounds(
    bounds: unknown,
    immediately?: boolean,
    avoid?: readonly [top: number, bottom: number, left: number, right: number],
    maxZoom?: number,
  ): void;
  zoomIn(): void;
  zoomOut(): void;
  destroy(): void;
}

interface AMapNamespace {
  Map: new (container: string, options: Record<string, unknown>) => AMapMap;
  Marker: new (options: Record<string, unknown>) => AMapMarker;
  MarkerCluster: new (
    map: AMapMap,
    data: readonly Record<string, unknown>[],
    options: Record<string, unknown>,
  ) => AMapMarkerCluster;
  InfoWindow: new (options: Record<string, unknown>) => AMapInfoWindow;
  Geocoder: new (options: {
    radius: number;
    extensions: "all";
  }) => AmapGeocoderService;
  LngLat: new (longitude: number, latitude: number) => AMapLngLat;
  Pixel: new (x: number, y: number) => AMapPixel;
  Bounds: new (southWest: AMapLngLat, northEast: AMapLngLat) => unknown;
  plugin(plugins: readonly string[], callback: () => void): void;
  convertFrom(
    positions: readonly Position[],
    source: "gps",
    callback: (
      status: "complete" | "error",
      result: { locations?: readonly AMapLngLat[] },
    ) => void,
  ): void;
}

declare global {
  interface Window {
    AMap?: AMapNamespace;
    _AMapSecurityConfig?: { securityJsCode: string };
  }
}

const CATEGORIES: ReadonlyArray<{
  id: Amenity;
  label: string;
  icon: typeof ToiletIcon;
  color: string;
}> = [
  { id: "toilet", label: "洗手间", icon: ToiletIcon, color: "#1b6f55" },
  { id: "water", label: "饮水机", icon: DropletsIcon, color: "#227a9b" },
  { id: "printer", label: "打印机", icon: PrinterIcon, color: "#675aa7" },
];

const LEGACY_CATALOG: CampusMapCatalog = {
  categories: CATEGORIES.map((category) => category.id),
  buildings: Object.fromEntries(
    BUILDINGS.map((building) => [building.id, { floorIds: building.floorIds }]),
  ),
  facilities: Object.fromEntries(
    FACILITIES.map((facility) => [
      facility.id,
      {
        buildingId: facility.buildingId,
        floorId: facility.floorId,
        category: facility.category,
      },
    ]),
  ),
};

const CATALOG: CampusMapSceneCatalog = {
  categories: CATEGORIES.map((category) => category.id),
  buildings: Object.fromEntries(
    BUILDINGS.map((building) => [building.id, { floorIds: building.floorIds }]),
  ),
  facilities: Object.fromEntries(
    FACILITIES.map((facility) => [
      facility.id,
      {
        buildingId: facility.buildingId,
        floorId: facility.floorId,
        category: facility.category,
      },
    ]),
  ),
  contents: {},
};

function canonicalSessionFromLegacySearch(search: string): CampusMapSession {
  const params = new URLSearchParams(search);
  if (params.get("v") === "1") return EMPTY_CAMPUS_MAP_SCENE_SESSION;
  if (params.get("building") === "building:15") {
    params.set("building", "science-centre");
  }
  const state = parseCampusMapState(params, LEGACY_CATALOG);
  const snap = state.sheet.snap === "full" ? "full" : "peek";
  if (state.selection.kind === "facility") {
    return {
      mode: "browse",
      scene: { kind: "facility", facilityId: state.selection.facilityId, snap },
    };
  }
  if (state.selection.kind === "content") {
    return {
      mode: "browse",
      scene: { kind: "content", contentId: state.selection.contentId, snap },
    };
  }
  if (state.selection.kind === "building") {
    return {
      mode: "browse",
      scene: {
        kind: "building",
        buildingId: state.selection.buildingId,
        floorId: state.buildingContext.floorId,
        snap,
      },
    };
  }
  if (state.mapFilter.category) {
    return {
      mode: "browse",
      scene: {
        kind: "category-results",
        category: state.mapFilter.category,
        snap,
      },
    };
  }
  if (state.mapFilter.query) {
    return {
      mode: "browse",
      scene: { kind: "search-results", query: state.mapFilter.query, snap },
    };
  }
  return EMPTY_CAMPUS_MAP_SCENE_SESSION;
}

function canonicalInitialSearch(search: string) {
  const params = new URLSearchParams(search);
  if (params.get("v") === "1") return search;
  return `?${encodeCampusMapUrl(canonicalSessionFromLegacySearch(search), CATALOG)}`;
}

function projectedState(
  session: CampusMapSession,
  returnTo: CampusMapSession | null,
): CampusMapState {
  if (session.mode !== "browse") {
    return {
      selection: { kind: "none" },
      mapFilter: { category: null, query: "" },
      buildingContext: { floorId: null, amenity: null, query: "" },
      sheet: { snap: "hidden" },
    };
  }
  const scene = session.scene;
  const returnScene = returnTo?.mode === "browse" ? returnTo.scene : null;
  const facility =
    scene.kind === "facility" ? CATALOG.facilities[scene.facilityId] : null;
  const selection: CampusMapState["selection"] =
    scene.kind === "building"
      ? { kind: "building", buildingId: scene.buildingId }
      : scene.kind === "facility" && facility
        ? {
            kind: "facility",
            facilityId: scene.facilityId,
            buildingId: facility.buildingId,
          }
        : scene.kind === "provider-poi"
          ? {
              kind: "external",
              externalId: scene.providerPoiId,
              position: scene.position,
            }
          : { kind: "none" };
  const category =
    scene.kind === "category-results"
      ? scene.category
      : returnScene?.kind === "category-results"
        ? returnScene.category
        : null;
  const query =
    scene.kind === "search-results"
      ? scene.query
      : returnScene?.kind === "search-results"
        ? returnScene.query
        : "";
  return {
    selection,
    mapFilter: { category, query },
    buildingContext: {
      floorId:
        scene.kind === "building"
          ? scene.floorId
          : scene.kind === "facility" && facility
            ? facility.floorId
            : null,
      amenity: null,
      query: "",
    },
    sheet: {
      snap: "snap" in scene ? scene.snap : "hidden",
    },
  };
}

function rect(element: Element): ScreenRect {
  const value = element.getBoundingClientRect();
  return {
    top: value.top,
    right: value.right,
    bottom: value.bottom,
    left: value.left,
  };
}

function placementAnchorLngLat(
  map: AMapMap,
  mapElement: Element,
  AMap: AMapNamespace,
): AMapLngLat {
  const mapRect = rect(mapElement);
  const anchor = placementAnchorPoint({
    width: mapRect.right - mapRect.left,
    height: mapRect.bottom - mapRect.top,
  });
  return map.containerToLngLat(new AMap.Pixel(anchor.x, anchor.y));
}

function alignPositionToPlacementAnchor(map: AMapMap, mapElement: Element) {
  const mapRect = rect(mapElement);
  const width = mapRect.right - mapRect.left;
  const height = mapRect.bottom - mapRect.top;
  const anchor = placementAnchorPoint({ width, height });
  const x = anchor.x - width / 2;
  const y = anchor.y - height / 2;
  if (x !== 0 || y !== 0) map.panBy(x, y, 0);
}

function normalized(value = "") {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

function buildingFor(selection: CampusMapState["selection"]) {
  const buildingId =
    selection.kind === "building" ||
    selection.kind === "facility" ||
    selection.kind === "content"
      ? selection.buildingId
      : null;
  return BUILDINGS.find((building) => building.id === buildingId) ?? null;
}

function facilityFor(selection: CampusMapState["selection"]) {
  return selection.kind === "facility"
    ? (FACILITIES.find((facility) => facility.id === selection.facilityId) ??
        null)
    : null;
}

function amenityStyle(category: Amenity) {
  return CATEGORIES.find((item) => item.id === category) ?? CATEGORIES[0];
}

function knownAmenity(value: string | null) {
  return CATEGORIES.find((item) => item.id === value)?.id ?? null;
}

function facilityMarkerView(facility: Facility) {
  const building = BUILDINGS.find((item) => item.id === facility.buildingId)!;
  return {
    id: facility.id,
    name: facility.name,
    buildingName: building.name,
    floorLabel: floorLabel(facility.floorId),
    category: facility.category,
    color: amenityStyle(facility.category).color,
  };
}

function floorLabel(floorId: string) {
  return floorId.endsWith("/F") ? floorId : `${floorId}/F`;
}

export function AmapCampusPrototype({
  initialSearch = "",
  factSchema = null,
}: {
  initialSearch?: string;
  factSchema?: CampusMapFactSchema | null;
}) {
  const driverInitialSearch = useMemo(
    () => canonicalInitialSearch(initialSearch),
    [initialSearch],
  );
  const [queryDraft, setQueryDraft] = useState(
    () =>
      projectedState(
        decodeCampusMapUrl(driverInitialSearch, CATALOG).session,
        null,
      ).mapFilter.query,
  );
  const startAddRef = useRef<() => void>(() => {});
  const editSessionActiveRef = useRef(false);
  const editSessionPlacingRef = useRef(false);
  const exactProviderPlaceRef = useRef<AmapResolvedPlaceContext | null>(null);
  const [centerPosition, setCenterPosition] = useState<Position>(CAMPUS_CENTER);
  const [providerCenterPosition, setProviderCenterPosition] =
    useState<Position | null>(null);
  const [placeContext, setPlaceContext] = useState<
    AmapPlaceContextResult | { status: "loading" } | null
  >(null);
  const amapOffsetRef = useRef<Position>([0, 0]);
  const [amapOffset, setAmapOffset] = useState<Position>([0, 0]);
  const [config, setConfig] = useState<
    | { status: "loading" }
    | { status: "missing" }
    | { status: "ready"; key: string; securityCode: string }
  >({ status: "loading" });
  const [mapLoadError, setMapLoadError] = useState<
    "sdk" | "coordinates" | null
  >(null);
  const [mapLoadAttempt, setMapLoadAttempt] = useState(0);
  const [mapReady, setMapReady] = useState(false);
  const [mapMoving, setMapMoving] = useState(false);
  const [mapCenterRevision, setMapCenterRevision] = useState(0);
  const [coordinateVersion, setCoordinateVersion] = useState(0);
  const [clusterStatus, setClusterStatus] = useState<
    "loading" | "ready" | "error"
  >("loading");
  const mapRef = useRef<AMapMap | null>(null);
  const mapElementRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLElement | null>(null);
  const clusterRef = useRef<AMapMarkerCluster | null>(null);
  const clusterCategoryRef = useRef<Amenity | null>(null);
  const facilityMarkersRef = useRef(new Map<string, AMapMarker>());
  const infoWindowRef = useRef<AMapInfoWindow | null>(null);
  const cameraGateRef = useRef(new CameraRequestGate());
  const pendingDriverCameraRef = useRef<{
    command: CampusMapDriverCameraCommand;
    context: CampusMapDriverEffectContext;
  } | null>(null);
  const pendingSelectionTokenRef = useRef<number | null>(null);
  const amapPositionsRef = useRef<Readonly<Record<string, Position>>>({});
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const panelTitleRef = useRef<HTMLHeadingElement | null>(null);
  const interactionAdapterRef = useRef(new AmapInteractionAdapter());
  const pointerGestureCleanupRef = useRef<(() => void) | null>(null);
  const placeContextResolverRef = useRef<AmapPlaceContextResolver | null>(null);
  const placementTrackingRef = useRef<{
    idempotencyKey: string;
    mapCenterRevision: number;
  } | null>(null);
  const [placeContextResolverVersion, setPlaceContextResolverVersion] =
    useState(0);

  const positionFor = useCallback(
    (building: Building) =>
      amapPositionsRef.current[building.id] ?? building.position,
    [],
  );

  const resetMapRuntime = useCallback(() => {
    pointerGestureCleanupRef.current?.();
    pointerGestureCleanupRef.current = null;
    clusterRef.current?.setMap(null);
    clusterRef.current = null;
    clusterCategoryRef.current = null;
    facilityMarkersRef.current.clear();
    const infoWindow = infoWindowRef.current;
    infoWindowRef.current = null;
    infoWindow?.close();
    mapRef.current?.destroy();
    mapRef.current = null;
    placeContextResolverRef.current?.invalidate();
    placeContextResolverRef.current = null;
    amapPositionsRef.current = {};
    cameraGateRef.current.invalidate();
    pendingDriverCameraRef.current = null;
    pendingSelectionTokenRef.current = null;
    setMapReady(false);
    setMapMoving(false);
    setMapCenterRevision(0);
    setProviderCenterPosition(null);
    setPlaceContext(null);
    setAmapOffset([0, 0]);
    setCoordinateVersion(0);
    setClusterStatus("loading");
  }, []);

  const retryMapLoad = useCallback(() => {
    resetMapRuntime();
    setMapLoadError(null);
    if (!window.AMap) {
      document
        .querySelector<HTMLScriptElement>("script[data-amap-campus]")
        ?.remove();
    }
    setMapLoadAttempt((attempt) => attempt + 1);
  }, [resetMapRuntime]);

  const requestCamera = useCallback(
    (
      position: Position,
      reason: CameraReason,
      driverContext?: CampusMapDriverEffectContext,
    ) => {
      const map = mapRef.current;
      const mapElement = mapElementRef.current;
      if (!map || !mapElement) return;
      const request = cameraGateRef.current.begin();
      if (reason !== "sheet-layout")
        pendingSelectionTokenRef.current = request.token;
      window.requestAnimationFrame(() =>
        window.requestAnimationFrame(() => {
          if (
            !request.isCurrent() ||
            (driverContext && !driverContext.isCurrent()) ||
            !mapRef.current ||
            !mapElementRef.current
          ) {
            if (pendingSelectionTokenRef.current === request.token) {
              pendingSelectionTokenRef.current = null;
            }
            return;
          }
          const mapRect = rect(mapElementRef.current);
          const panelRect =
            panelRef.current && !panelRef.current.hidden
              ? rect(panelRef.current)
              : null;
          const policy = cameraPolicyFor(reason, mapRect, panelRect);
          if (!policy) {
            if (pendingSelectionTokenRef.current === request.token) {
              pendingSelectionTokenRef.current = null;
            }
            return;
          }

          const AMap = window.AMap;
          if (!AMap) {
            if (pendingSelectionTokenRef.current === request.token) {
              pendingSelectionTokenRef.current = null;
            }
            return;
          }
          const zoom =
            policy.zoom.kind === "preserve"
              ? map.getZoom()
              : Math.min(
                  map.getZoom() < policy.zoom.maxZoom
                    ? policy.zoom.maxZoom
                    : map.getZoom(),
                  policy.zoom.maxZoom,
                );
          const lngLat = new AMap.LngLat(position[0], position[1]);
          if (policy.zoom.kind === "fit" && map.getZoom() !== zoom) {
            map.setZoomAndCenter(zoom, lngLat, true, 0);
          }
          window.requestAnimationFrame(() => {
            if (
              !request.isCurrent() ||
              (driverContext && !driverContext.isCurrent()) ||
              !mapRef.current
            ) {
              if (pendingSelectionTokenRef.current === request.token) {
                pendingSelectionTokenRef.current = null;
              }
              return;
            }
            const point = map.lngLatToContainer(lngLat);
            const width = mapRect.right - mapRect.left;
            const height = mapRect.bottom - mapRect.top;
            const nearestVisiblePoint = nearestVisibleCameraPoint(
              point,
              { width, height },
              policy.padding,
            );
            if (!nearestVisiblePoint) {
              if (pendingSelectionTokenRef.current === request.token) {
                pendingSelectionTokenRef.current = null;
              }
              return;
            }
            const targetCenter = map.containerToLngLat(
              new AMap.Pixel(
                point.x + width / 2 - nearestVisiblePoint.x,
                point.y + height / 2 - nearestVisiblePoint.y,
              ),
            );
            map.panTo(
              targetCenter,
              reason === "sheet-layout" ? 0 : policy.animate ? 320 : 0,
            );
            if (pendingSelectionTokenRef.current === request.token) {
              pendingSelectionTokenRef.current = null;
            }
          });
        }),
      );
    },
    [],
  );

  const executeDriverCamera = useCallback(
    (
      camera: CampusMapDriverCameraCommand,
      context: CampusMapDriverEffectContext,
    ) => {
      if (camera.kind === "cancel") {
        pendingDriverCameraRef.current = null;
        cameraGateRef.current.invalidate();
        pendingSelectionTokenRef.current = null;
        return;
      }
      const map = mapRef.current;
      const mapElement = mapElementRef.current;
      const AMap = typeof window === "undefined" ? undefined : window.AMap;
      if (!map || !mapElement || !AMap) {
        pendingDriverCameraRef.current = { command: camera, context };
        return;
      }
      pendingDriverCameraRef.current = null;
      if (!context.isCurrent()) return;
      if (camera.kind === "edit-position") {
        if (camera.reason !== "provider-placement") {
          exactProviderPlaceRef.current = null;
        }
        const offset = amapOffsetRef.current;
        const providerPosition: Position = [
          camera.position[0] + offset[0],
          camera.position[1] + offset[1],
        ];
        setCenterPosition([camera.position[0], camera.position[1]]);
        setProviderCenterPosition(providerPosition);
        map.setZoomAndCenter(
          map.getZoom(),
          new AMap.LngLat(providerPosition[0], providerPosition[1]),
          true,
          0,
        );
        alignPositionToPlacementAnchor(map, mapElement);
        return;
      }
      if (camera.kind === "fit") {
        cameraGateRef.current.invalidate();
        const longitudes = camera.positions.map((position) => position[0]);
        const latitudes = camera.positions.map((position) => position[1]);
        const bounds = new AMap.Bounds(
          new AMap.LngLat(Math.min(...longitudes), Math.min(...latitudes)),
          new AMap.LngLat(Math.max(...longitudes), Math.max(...latitudes)),
        );
        const padding = deriveCameraPadding(
          rect(mapElement),
          panelRef.current && !panelRef.current.hidden
            ? rect(panelRef.current)
            : null,
        );
        map.setBounds(
          bounds,
          false,
          [padding.top, padding.bottom, padding.left, padding.right],
          18,
        );
        return;
      }
      const building = BUILDINGS.find((item) => item.id === camera.buildingId);
      if (building) {
        requestCamera(positionFor(building), camera.reason, context);
      }
    },
    [positionFor, requestCamera],
  );

  const [driver] = useState(() => {
    const browserWindow = typeof window === "undefined" ? null : window;
    const measureSheetGeometry = (context?: CampusMapDriverEffectContext) => {
      queueMicrotask(() => {
        browserWindow?.requestAnimationFrame(() => {
          if (context && !context.isCurrent()) return;
          const panel = panelRef.current;
          if (!panel || panel.hidden || !mapElementRef.current) {
            sceneDriver.updateSheetGeometry(null);
            return;
          }
          sceneDriver.updateSheetGeometry(rect(panel));
        });
      });
    };
    const ports: CampusMapSceneDriverPorts = {
      history: browserWindow?.history ?? {
        state: null,
        back: () => {},
        pushState: () => {},
        replaceState: () => {},
      },
      location: {
        pathname: () =>
          browserWindow?.location.pathname ?? "/prototype/campus-map",
        search: () => browserWindow?.location.search ?? driverInitialSearch,
      },
      camera: executeDriverCamera,
      focus: (focus, context) => {
        queueMicrotask(() => {
          window.requestAnimationFrame(() => {
            if (!context.isCurrent()) return;
            if (focus.kind === "contribution-form") {
              document
                .querySelector<HTMLElement>("#campus-map-panel-title")
                ?.focus({ preventScroll: true });
            } else if (focus.kind === "heading") {
              panelTitleRef.current?.focus({ preventScroll: true });
            } else if (focus.kind === "results") {
              if (document.activeElement?.tagName !== "BUTTON") {
                panelTitleRef.current?.focus({ preventScroll: true });
              }
            } else if (focus.kind === "search-input") {
              searchInputRef.current?.focus({ preventScroll: true });
            } else if (focus.kind === "result") {
              document
                .querySelector<HTMLElement>(
                  `[data-search-result="${focus.resultId}"], [data-return-result="${focus.resultId}"]`,
                )
                ?.focus({ preventScroll: true });
            } else if (focus.kind === "map") {
              mapElementRef.current?.focus({ preventScroll: true });
            } else if (focus.kind === "edit-field") {
              const target = Array.from(
                document.querySelectorAll<HTMLElement>("[data-edit-field]"),
              ).find((element) => element.dataset.editField === focus.field);
              target?.focus({ preventScroll: true });
              target?.scrollIntoView?.({ block: "center", inline: "nearest" });
            }
          });
        });
      },
      overlay: (overlay) => {
        if (overlay.kind === "close-external") {
          const infoWindow = infoWindowRef.current;
          infoWindowRef.current = null;
          infoWindow?.close();
          return;
        }
        const AMap = window.AMap;
        const map = mapRef.current;
        if (!AMap || !map) return;
        const content = document.createElement("div");
        content.className = "min-w-36 px-1 py-0.5 text-[#17211c]";
        const title = document.createElement("strong");
        title.className = "block text-sm font-semibold";
        title.textContent = overlay.name;
        const source = document.createElement("span");
        source.className = "mt-1 block text-xs text-neutral-500";
        source.textContent = "高德地图地点";
        content.append(title, source);
        const previousInfoWindow = infoWindowRef.current;
        infoWindowRef.current = null;
        previousInfoWindow?.close();
        const infoWindow = new AMap.InfoWindow({
          anchor: "bottom-center",
          autoMove: true,
          closeWhenClickMap: false,
          offset: [0, -10],
        });
        infoWindow.on("close", () => {
          if (infoWindowRef.current !== infoWindow) return;
          infoWindowRef.current = null;
          const currentSession = sceneDriver.getSnapshot().session;
          if (
            currentSession.mode === "browse" &&
            currentSession.scene.kind === "provider-poi"
          ) {
            sceneDriver.dispatch({ type: "DISMISS" });
          }
        });
        infoWindowRef.current = infoWindow;
        infoWindow.setContent(content);
        infoWindow.open(
          map,
          new AMap.LngLat(overlay.position[0], overlay.position[1]),
        );
      },
      sheet: (sheet, context) => {
        if (sheet.kind === "hide") {
          sceneDriver.updateSheetGeometry(null);
          return;
        }
        measureSheetGeometry(context);
      },
    };
    const sceneDriver = new CampusMapSceneDriver(
      CATALOG,
      ports,
      driverInitialSearch,
    );
    return sceneDriver;
  });
  const driverSnapshot = useSyncExternalStore(
    driver.subscribe,
    driver.getSnapshot,
    driver.getSnapshot,
  );
  const session = driverSnapshot.session;
  const state = projectedState(session, driverSnapshot.returnTo);
  const selectedBuilding = buildingFor(state.selection);
  const selectedFacility = facilityFor(state.selection);
  const activeAmenity = knownAmenity(state.mapFilter.category);
  const facilityOrigin =
    driverSnapshot.returnTo?.mode === "browse" &&
    driverSnapshot.returnTo.scene.kind === "category-results"
      ? "category"
      : "map";

  const dispatch = useCallback(
    (intent: CampusMapDriverIntent) => driver.dispatch(intent),
    [driver],
  );

  const {
    session: editSession,
    dispatchEvent: dispatchEditEvent,
    startAdd,
    startEdit: startCanonicalEdit,
    announcement: editAnnouncement,
    restoreNotice: editRestoreNotice,
  } = useCampusMapEditSessionOwner({ driver, dispatch });
  const startAddAtPlacementAnchor = useCallback(() => {
    const map = mapRef.current;
    const mapElement = mapElementRef.current;
    const AMap = typeof window === "undefined" ? undefined : window.AMap;
    if (map && mapElement && AMap) {
      const providerPosition = placementAnchorLngLat(map, mapElement, AMap);
      const offset = amapOffsetRef.current;
      setCenterPosition([
        providerPosition.lng - offset[0],
        providerPosition.lat - offset[1],
      ]);
      setProviderCenterPosition([providerPosition.lng, providerPosition.lat]);
    }
    startAdd();
  }, [startAdd]);
  const editSessionStatus = editSession?.status ?? null;
  const editSessionIdempotencyKey = editSession?.draft.idempotencyKey ?? null;
  const placementCandidate =
    editSession?.status === "placing"
      ? editSession.draft.placementCandidate
      : null;
  const placementPending = Boolean(
    editSession?.status === "placing" &&
    (mapMoving ||
      !placementCandidate ||
      Math.abs(placementCandidate.longitude - centerPosition[0]) > 0.00001 ||
      Math.abs(placementCandidate.latitude - centerPosition[1]) > 0.00001),
  );
  const lockedOutdoorLocation =
    editSession?.status !== "placing" &&
    editSession?.draft.fact.location?.kind === "outdoor-point"
      ? editSession.draft.fact.location
      : null;
  const contextProviderLongitude =
    editSessionStatus === "placing"
      ? (providerCenterPosition?.[0] ?? null)
      : lockedOutdoorLocation && coordinateVersion > 0
        ? lockedOutdoorLocation.longitude + amapOffset[0]
        : null;
  const contextProviderLatitude =
    editSessionStatus === "placing"
      ? (providerCenterPosition?.[1] ?? null)
      : lockedOutdoorLocation && coordinateVersion > 0
        ? lockedOutdoorLocation.latitude + amapOffset[1]
        : null;
  const placeContextMapRevision =
    editSessionStatus === "placing" ? mapCenterRevision : 0;
  useEffect(() => {
    startAddRef.current = startAddAtPlacementAnchor;
  }, [startAddAtPlacementAnchor]);
  useEffect(() => {
    editSessionActiveRef.current = Boolean(editSession);
    editSessionPlacingRef.current = editSession?.status === "placing";
    if (!editSession) {
      exactProviderPlaceRef.current = null;
    }
  }, [editSession]);

  useEffect(() => {
    if (editSession?.status !== "placing") {
      placementTrackingRef.current = null;
      return;
    }
    const tracked = placementTrackingRef.current;
    const isNewPlacement =
      tracked?.idempotencyKey !== editSession.draft.idempotencyKey;
    const centerMoved =
      !isNewPlacement && tracked.mapCenterRevision !== mapCenterRevision;
    placementTrackingRef.current = {
      idempotencyKey: editSession.draft.idempotencyKey,
      mapCenterRevision,
    };
    if (!editSession.draft.placementCandidate || centerMoved) {
      dispatchEditEvent({
        type: "UPDATE_PLACEMENT_CANDIDATE",
        position: {
          longitude: centerPosition[0],
          latitude: centerPosition[1],
          crs: "wgs84",
          precision: "approximate",
          method: "pointer",
        },
      });
    }
  }, [centerPosition, dispatchEditEvent, editSession, mapCenterRevision]);

  useEffect(() => {
    if (
      !editSessionStatus ||
      editSessionStatus === "published" ||
      contextProviderLongitude === null ||
      contextProviderLatitude === null
    ) {
      placeContextResolverRef.current?.invalidate();
      queueMicrotask(() => setPlaceContext(null));
      return;
    }
    const contextProviderPosition = {
      longitude: contextProviderLongitude,
      latitude: contextProviderLatitude,
      crs: "gcj02" as const,
    };
    const exactProviderPlace = exactProviderPlaceRef.current;
    if (
      exactProviderPlace &&
      Math.abs(
        exactProviderPlace.providerPosition.longitude -
          contextProviderPosition.longitude,
      ) <= 0.00001 &&
      Math.abs(
        exactProviderPlace.providerPosition.latitude -
          contextProviderPosition.latitude,
      ) <= 0.00001
    ) {
      placeContextResolverRef.current?.invalidate();
      queueMicrotask(() =>
        setPlaceContext({ status: "resolved", context: exactProviderPlace }),
      );
      return;
    }
    exactProviderPlaceRef.current = null;
    const resolver = placeContextResolverRef.current;
    if (!resolver) return;
    let current = true;
    queueMicrotask(() => {
      if (current) setPlaceContext({ status: "loading" });
    });
    const timeout = window.setTimeout(
      () => {
        void resolver.resolveLatest(contextProviderPosition).then((result) => {
          if (current && result.status !== "superseded")
            setPlaceContext(result);
        });
      },
      placeContextMapRevision === 0 ? 0 : 200,
    );
    return () => {
      current = false;
      window.clearTimeout(timeout);
    };
  }, [
    contextProviderLatitude,
    contextProviderLongitude,
    editSessionIdempotencyKey,
    editSessionStatus,
    placeContextMapRevision,
    placeContextResolverVersion,
  ]);

  const startEdit = useCallback(
    (facility: Facility) => void startCanonicalEdit(facility.id),
    [startCanonicalEdit],
  );

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) {
        const query = state.mapFilter.query;
        setQueryDraft((current) =>
          current.trim() === query ? current : query,
        );
      }
    });
    return () => {
      cancelled = true;
    };
  }, [state.mapFilter.query]);

  const selectBuilding = useCallback(
    (building: Building, source: "map" | "search" = "map") => {
      dispatch({
        type: "OPEN_BUILDING",
        buildingId: building.id,
        source,
      });
    },
    [dispatch],
  );

  const selectFacility = useCallback(
    (facility: Facility, source: "category" | "building" | "search") => {
      dispatch({
        type: "OPEN_FACILITY",
        facilityId: facility.id,
        source:
          source === "category"
            ? "map"
            : source === "search"
              ? "search"
              : "building",
      });
    },
    [dispatch],
  );

  useEffect(() => {
    let cancelled = false;
    fetch("/api/campus-map/config", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("missing config");
        return (await response.json()) as {
          configured: boolean;
          key: string;
          securityCode: string;
        };
      })
      .then((value) => {
        if (cancelled) return;
        if (value.configured) {
          window._AMapSecurityConfig = { securityJsCode: value.securityCode };
          setConfig({
            status: "ready",
            key: value.key,
            securityCode: value.securityCode,
          });
        } else {
          setConfig({ status: "missing" });
        }
      })
      .catch(() => {
        if (!cancelled) setConfig({ status: "missing" });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const handlePopState = (event: PopStateEvent) => {
      driver.restore(window.location.search, event.state);
      if (editSession) {
        dispatchEditEvent({ type: "REQUEST_CLOSE" });
      }
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [dispatchEditEvent, driver, editSession]);

  const closeSelection = useCallback(() => {
    dispatch({ type: "DISMISS" });
  }, [dispatch]);

  const navigateEntityBack = useCallback(() => {
    dispatch({ type: "NAVIGATE_BACK" });
  }, [dispatch]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (editSession) {
        event.preventDefault();
        dispatchEditEvent({ type: "REQUEST_CLOSE" });
        return;
      }
      const current = driver.getSnapshot().session;
      if (current.mode === "browse" && current.scene.kind !== "map") {
        dispatch({ type: "DISMISS" });
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [dispatch, dispatchEditEvent, driver, editSession]);

  const initialiseMap = useCallback(() => {
    if (!window.AMap || mapRef.current) return;
    setMapLoadError(null);
    const AMap = window.AMap;
    const map = new AMap.Map("amap-campus-canvas", {
      center: CAMPUS_CENTER,
      zoom: 17.2,
      zooms: [14, 20],
      viewMode: "2D",
      mapStyle: "amap://styles/normal",
      showLabel: true,
      isHotspot: true,
      features: ["bg", "road", "building", "point"],
      resizeEnable: true,
    });
    mapRef.current = map;
    setMapReady(true);
    setClusterStatus("loading");
    try {
      map.plugin(["AMap.MarkerCluster"], () => setClusterStatus("ready"));
    } catch {
      setClusterStatus("error");
    }
    try {
      AMap.plugin(["AMap.Geocoder"], () => {
        if (mapRef.current !== map) return;
        const geocoder = new AMap.Geocoder({
          radius: 150,
          extensions: "all",
        });
        placeContextResolverRef.current?.invalidate();
        placeContextResolverRef.current = createAmapPlaceContextResolver(
          createAmapGeocoderAdapter(geocoder),
        );
        setPlaceContextResolverVersion((version) => version + 1);
      });
    } catch {
      setPlaceContext({ status: "permanent-error" });
    }

    const conversionPositions = [
      [CAMPUS_CENTER[0], CAMPUS_CENTER[1]] as const,
      ...BUILDINGS.map(
        (building) => [building.position[0], building.position[1]] as const,
      ),
    ];
    AMap.convertFrom(conversionPositions, "gps", (status, result) => {
      if (mapRef.current !== map) return;
      const locations = status === "complete" ? result.locations : undefined;
      if (!locations || locations.length !== BUILDINGS.length + 1) {
        setMapLoadError("coordinates");
        return;
      }
      const converted = Object.fromEntries(
        BUILDINGS.map((building, index) => {
          const location = locations[index + 1];
          return [
            building.id,
            location
              ? ([location.lng, location.lat] as Position)
              : building.position,
          ];
        }),
      );
      const convertedCenter = locations[0];
      if (convertedCenter) {
        converted.__campus = [convertedCenter.lng, convertedCenter.lat];
        const convertedOffset: Position = [
          convertedCenter.lng - CAMPUS_CENTER[0],
          convertedCenter.lat - CAMPUS_CENTER[1],
        ];
        amapOffsetRef.current = convertedOffset;
        setAmapOffset(convertedOffset);
        setCenterPosition(CAMPUS_CENTER);
        setProviderCenterPosition([convertedCenter.lng, convertedCenter.lat]);
      }
      amapPositionsRef.current = converted;
      setCoordinateVersion((version) => version + 1);
      const pendingCamera = pendingDriverCameraRef.current;
      if (pendingCamera) {
        executeDriverCamera(pendingCamera.command, pendingCamera.context);
      } else {
        const center = locations[0];
        if (center) map.setZoomAndCenter(17.2, center, true, 0);
      }
    });

    map.on("hotspotclick", (event) => {
      interactionAdapterRef.current.dispatchProviderTarget(() => {
        if (editSessionPlacingRef.current) {
          const providerPoiId =
            event.id ?? `${event.lnglat.lng},${event.lnglat.lat}`;
          const context: AmapResolvedPlaceContext = {
            providerPosition: {
              longitude: event.lnglat.lng,
              latitude: event.lnglat.lat,
              crs: "gcj02",
            },
            label: event.name?.trim() || "高德地图地点",
            address: null,
            providerPoiId,
            distanceMeters: 0,
          };
          exactProviderPlaceRef.current = context;
          setPlaceContext({ status: "resolved", context });
          const offset = amapOffsetRef.current;
          driver.recenterEditPosition(
            [event.lnglat.lng - offset[0], event.lnglat.lat - offset[1]],
            "provider-placement",
          );
          return;
        }
        const target = resolveAmapHotspotTarget(
          event,
          BUILDINGS.map((building) => ({
            buildingId: building.id,
            providerPoiIds: building.amapPoiIds,
            providerNames: building.amapHotspotNames,
          })),
        );
        if (target.kind === "building") {
          const building = BUILDINGS.find(
            (item) => item.id === target.buildingId,
          );
          if (!building) return;
          selectBuilding(building);
          return;
        }
        dispatch({
          type: "OPEN_PROVIDER_POI",
          providerPoiId: target.providerId,
          name: target.name,
          position: target.position,
        });
      });
    });
    map.on("click", (event) => {
      interactionAdapterRef.current.dispatchMapClick(() => {
        if (event.originEvent?.target?.closest?.("[data-cupedia-marker]"))
          return;
        if (editSessionActiveRef.current) return;
        dispatch({ type: "DISMISS" });
      });
    });
    map.on("dragstart", () => {
      exactProviderPlaceRef.current = null;
      driver.interruptCamera();
    });
    map.on("movestart", () => setMapMoving(true));
    map.on("moveend", () => {
      const center = editSessionPlacingRef.current
        ? placementAnchorLngLat(map, map.getContainer(), AMap)
        : map.getCenter();
      const offset = amapOffsetRef.current;
      setMapMoving(false);
      setCenterPosition([center.lng - offset[0], center.lat - offset[1]]);
      setProviderCenterPosition([center.lng, center.lat]);
      setMapCenterRevision((revision) => revision + 1);
    });
    map.on("longpress", () => startAddRef.current());
    map.on("rightclick", () => startAddRef.current());
    const cancelForUserZoom = () => {
      driver.interruptCamera();
    };
    const container = map.getContainer();
    const beginPointerGesture = () => {
      interactionAdapterRef.current.beginPointerGesture();
    };
    container.addEventListener("pointerdown", beginPointerGesture, {
      capture: true,
    });
    container.addEventListener("wheel", cancelForUserZoom, { passive: true });
    container.addEventListener("touchstart", cancelForUserZoom, {
      passive: true,
    });
    pointerGestureCleanupRef.current = () => {
      container.removeEventListener("pointerdown", beginPointerGesture, {
        capture: true,
      });
      container.removeEventListener("wheel", cancelForUserZoom);
      container.removeEventListener("touchstart", cancelForUserZoom);
      interactionAdapterRef.current.reset();
    };
  }, [dispatch, driver, executeDriverCamera, selectBuilding]);

  useEffect(() => {
    if (config.status !== "ready" || mapRef.current) return;
    if (window.AMap) {
      let cancelled = false;
      queueMicrotask(() => {
        if (!cancelled) initialiseMap();
      });
      return () => {
        cancelled = true;
      };
    }
    let cancelled = false;
    const existing = document.querySelector<HTMLScriptElement>(
      "script[data-amap-campus]",
    );
    const script = existing ?? document.createElement("script");
    const handleLoad = () => {
      if (!cancelled) initialiseMap();
    };
    const handleError = () => {
      if (!cancelled) setMapLoadError("sdk");
    };

    script.addEventListener("load", handleLoad, { once: true });
    script.addEventListener("error", handleError, { once: true });
    if (!existing) {
      script.dataset.amapCampus = "true";
      script.src = `https://webapi.amap.com/maps?v=2.0&key=${encodeURIComponent(config.key)}`;
      script.async = true;
      document.head.append(script);
    }

    return () => {
      cancelled = true;
      script.removeEventListener("load", handleLoad);
      script.removeEventListener("error", handleError);
    };
  }, [config, initialiseMap, mapLoadAttempt]);

  useEffect(() => {
    if (
      !mapReady ||
      clusterStatus !== "ready" ||
      coordinateVersion === 0 ||
      !window.AMap ||
      !mapRef.current
    )
      return;
    const map = mapRef.current;
    if (!activeAmenity) {
      clusterRef.current?.setMap(null);
      clusterRef.current = null;
      clusterCategoryRef.current = null;
      facilityMarkersRef.current.clear();
      return;
    }
    const data = FACILITIES.filter(
      (facility) => facility.category === activeAmenity,
    ).map((facility) => {
      const building = BUILDINGS.find(
        (item) => item.id === facility.buildingId,
      )!;
      return {
        lnglat: positionFor(building),
        facilityId: facility.id,
        extData: { facilityId: facility.id },
      };
    });

    if (clusterRef.current && clusterCategoryRef.current !== activeAmenity) {
      clusterRef.current.setMap(null);
      clusterRef.current = null;
      clusterCategoryRef.current = null;
      facilityMarkersRef.current.clear();
    }

    try {
      if (!clusterRef.current) {
        const style = amenityStyle(activeAmenity);
        const cluster = new window.AMap.MarkerCluster(map, data, {
          gridSize: 90,
          maxZoom: 18,
          averageCenter: true,
          renderMarker: ({ marker }: { marker: AMapMarker }) => {
            const markerPosition = marker.getExtData()?.facilityId
              ? null
              : (
                  marker as unknown as { getPosition?: () => AMapLngLat }
                ).getPosition?.();
            const facility =
              FACILITIES.find(
                (item) => item.id === marker.getExtData()?.facilityId,
              ) ??
              (markerPosition
                ? FACILITIES.find((item) => {
                    if (item.category !== activeAmenity) return false;
                    const building = BUILDINGS.find(
                      (candidate) => candidate.id === item.buildingId,
                    );
                    if (!building) return false;
                    const position = positionFor(building);
                    return (
                      Math.abs(position[0] - markerPosition.lng) < 0.000001 &&
                      Math.abs(position[1] - markerPosition.lat) < 0.000001
                    );
                  })
                : undefined);
            if (!facility) return;
            facilityMarkersRef.current.set(facility.id, marker);
            marker.setContent(
              facilityMarkerContent({
                ...facilityMarkerView(facility),
                selected: false,
              }),
            );
            marker.on("click", () => {
              interactionAdapterRef.current.dispatchProviderTarget(() => {
                selectFacility(facility, "category");
              });
            });
          },
          renderClusterMarker: ({
            count,
            marker,
          }: {
            count: number;
            marker: AMapMarker;
          }) => {
            marker.setContent(
              `<button type="button" data-cupedia-marker="true" aria-label="${count} 项${style.label}建筑记录" style="display:grid;min-width:46px;height:46px;place-items:center;border:3px solid white;border-radius:999px;background:${style.color};color:white;font:700 14px system-ui;box-shadow:0 3px 12px rgba(0,0,0,.22);padding:0 12px">${count}</button>`,
            );
          },
        });
        cluster.on("click", (event) => {
          interactionAdapterRef.current.dispatchProviderTarget(() => {
            const positions = event.clusterData?.map(({ lnglat }) =>
              "lng" in lnglat ? ([lnglat.lng, lnglat.lat] as Position) : lnglat,
            );
            if (positions?.length) {
              dispatch({ type: "FIT_CLUSTER", positions });
            }
          });
        });
        clusterRef.current = cluster;
        clusterCategoryRef.current = activeAmenity;
      } else {
        clusterRef.current.setData(data);
      }
    } catch {
      clusterRef.current = null;
      clusterCategoryRef.current = null;
      facilityMarkersRef.current.clear();
      queueMicrotask(() => setClusterStatus("error"));
    }
  }, [
    activeAmenity,
    clusterStatus,
    coordinateVersion,
    dispatch,
    mapReady,
    positionFor,
    selectFacility,
  ]);

  useEffect(() => {
    const syncSelectedMarker = () => {
      document
        .querySelectorAll<HTMLElement>("[data-facility-id]")
        .forEach((element) => {
          element.setAttribute(
            "aria-pressed",
            String(element.dataset.facilityId === selectedFacility?.id),
          );
        });
    };
    syncSelectedMarker();
    const observer = new MutationObserver(syncSelectedMarker);
    if (mapElementRef.current) {
      observer.observe(mapElementRef.current, {
        childList: true,
        subtree: true,
      });
    }
    for (const facility of FACILITIES) {
      const marker = facilityMarkersRef.current.get(facility.id);
      if (!marker) continue;
      const selected = selectedFacility?.id === facility.id;
      marker.setzIndex(selected ? 220 : 160);
      marker.setContent(
        facilityMarkerContent({
          ...facilityMarkerView(facility),
          selected,
        }),
      );
    }
    return () => observer.disconnect();
  }, [selectedFacility]);

  useEffect(() => {
    const mapElement = mapElementRef.current;
    const panel = panelRef.current;
    if (!mapElement || !panel || (!selectedBuilding && !editSession)) return;
    const observer = new ResizeObserver(() => {
      driver.updateSheetGeometry(panel.hidden ? null : rect(panel));
    });
    observer.observe(mapElement);
    observer.observe(panel);
    return () => observer.disconnect();
  }, [driver, editSession, selectedBuilding]);

  useEffect(
    () => () => {
      pointerGestureCleanupRef.current?.();
      pointerGestureCleanupRef.current = null;
      clusterRef.current?.setMap(null);
      const infoWindow = infoWindowRef.current;
      infoWindowRef.current = null;
      infoWindow?.close();
      mapRef.current?.destroy();
      mapRef.current = null;
    },
    [],
  );

  const searchResults = useMemo(() => {
    const query = normalized(state.mapFilter.query);
    if (!query) return [];
    const queryParts = state.mapFilter.query
      .trim()
      .split(/\s+/u)
      .map(normalized)
      .filter(Boolean);
    const buildings = BUILDINGS.filter((building) =>
      [
        building.name,
        building.englishName,
        building.code,
        ...building.aliases,
      ].some((value) => normalized(value).includes(query)),
    ).map((building) => ({ kind: "building" as const, building }));
    const facilities = FACILITIES.flatMap((facility) => {
      const building = BUILDINGS.find(
        (item) => item.id === facility.buildingId,
      );
      if (!building) return [];
      const searchable = [
        building.name,
        building.englishName,
        ...building.aliases,
        facility.name,
        floorLabel(facility.floorId),
      ].map(normalized);
      const facilityTerms = [
        facility.name,
        amenityStyle(facility.category).label,
        floorLabel(facility.floorId),
      ].map(normalized);
      const hasFacilityTerm = queryParts.some((part) =>
        facilityTerms.some((value) => value.includes(part)),
      );
      return hasFacilityTerm &&
        queryParts.every((part) =>
          searchable.some((value) => value.includes(part)),
        )
        ? [{ kind: "facility" as const, facility, building }]
        : [];
    });
    return [...buildings, ...facilities];
  }, [state.mapFilter.query]);

  const buildingFacilities = selectedBuilding
    ? FACILITIES.filter(
        (facility) =>
          facility.buildingId === selectedBuilding.id &&
          (!state.buildingContext.floorId ||
            facility.floorId === state.buildingContext.floorId) &&
          (!state.buildingContext.amenity ||
            facility.category === state.buildingContext.amenity),
      )
    : [];
  const categoryFacilities = activeAmenity
    ? FACILITIES.filter((facility) => facility.category === activeAmenity)
    : [];
  const categoryBuildingCount = new Set(
    categoryFacilities.map((facility) => facility.buildingId),
  ).size;
  const activeCategoryStyle = activeAmenity
    ? amenityStyle(activeAmenity)
    : null;
  const chromeHidden = Boolean(editSession) || state.sheet.snap === "full";

  return (
    <main
      className="relative h-dvh min-h-0 w-full min-w-0 flex-1 overflow-hidden bg-[#dce7e9] text-[#17211c]"
      style={
        {
          "--campus-map-placement-anchor-y": `${MOBILE_PLACEMENT_ANCHOR_RATIO * 100}dvh`,
        } as CSSProperties
      }
    >
      <p className="sr-only" aria-live="polite">
        {editAnnouncement || editRestoreNotice}
      </p>
      <style>{`@media(max-width:767px){.amap-controls,.amap-controlbar{display:none!important}.amap-logo,.amap-copyright{bottom:${editSession?.status === "placing" ? "calc(48dvh + 4px)" : editSession ? "calc(64dvh + 4px)" : state.selection.kind === "none" && !activeAmenity ? "4px" : state.sheet.snap === "full" ? "calc(72dvh + 4px)" : "252px"}!important}}`}</style>
      <div className="absolute inset-0">
        <div
          id="amap-campus-canvas"
          ref={mapElementRef}
          tabIndex={-1}
          className="h-full w-full"
        />
      </div>

      {editSession?.status === "placing" ? (
        <div
          aria-hidden="true"
          data-campus-map-center-pin
          data-moving={mapMoving}
          className={cn(
            "pointer-events-none absolute top-[var(--campus-map-placement-anchor-y)] left-1/2 z-20 -translate-x-1/2 transition-transform duration-150 md:top-1/2 motion-reduce:transition-none",
            mapMoving ? "-translate-y-[calc(100%+8px)]" : "-translate-y-full",
          )}
        >
          <MapPinIcon
            className="size-12 fill-[#176346] text-white drop-shadow-[0_4px_7px_rgba(23,33,28,.35)]"
            strokeWidth={1.8}
          />
          <div className="mx-auto -mt-1 size-2 rounded-full bg-black/25" />
        </div>
      ) : null}

      {config.status === "missing" || mapLoadError ? (
        <div className="absolute inset-0 z-50 grid place-items-center bg-white/94 p-6">
          <div className="max-w-md rounded-2xl border border-black/10 bg-white p-6 shadow-xl">
            <h1 className="text-lg font-semibold">
              {mapLoadError ? "高德地图加载失败" : "高德地图配置缺失"}
            </h1>
            <p className="mt-2 text-sm leading-6 text-neutral-600">
              {mapLoadError === "sdk"
                ? "高德 SDK 请求未完成，可能是短暂网络故障。可以直接重新加载。"
                : mapLoadError === "coordinates"
                  ? "底图已连接，但校园坐标转换失败。请稍后重新加载。"
                  : "请在 .env.local 配置 AMAP_WEB_KEY 和 AMAP_SECURITY_JS_CODE，然后重新启动开发服务器。"}
            </p>
            {mapLoadError ? (
              <button
                type="button"
                className="mt-4 min-h-11 rounded-xl bg-[#174b38] px-4 text-sm font-semibold text-white"
                onClick={retryMapLoad}
              >
                重新加载高德地图
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      <header
        aria-hidden={editSession ? true : undefined}
        inert={editSession ? true : undefined}
        className={cn(
          "pointer-events-none absolute inset-x-0 top-0 z-30 flex items-start gap-2 p-3 transition-opacity md:p-4",
          chromeHidden && "invisible pointer-events-none opacity-0",
          !editSession &&
            state.selection.kind !== "none" &&
            state.sheet.snap === "full" &&
            "md:visible md:opacity-100",
        )}
      >
        <form
          className="pointer-events-auto mx-auto w-full max-w-[560px]"
          onSubmit={(event) => {
            event.preventDefault();
            dispatch({ type: "SEARCH", query: queryDraft });
          }}
        >
          <label className="flex h-12 items-center gap-3 rounded-xl bg-white px-4 shadow-[0_3px_14px_rgba(23,33,28,.18)] focus-within:ring-2 focus-within:ring-[#176346] focus-within:ring-offset-2">
            <SearchIcon
              aria-hidden="true"
              className="size-5 text-neutral-500"
            />
            <span className="sr-only">搜索建筑</span>
            <input
              ref={searchInputRef}
              value={queryDraft}
              onChange={(event) => {
                const query = event.currentTarget.value;
                setQueryDraft(query);
                dispatch({ type: "SEARCH", query });
              }}
              className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-neutral-500"
              placeholder="搜索建筑"
            />
            {queryDraft ? (
              <button
                type="button"
                aria-label="清除搜索"
                className="grid size-9 place-items-center rounded-full hover:bg-neutral-100"
                onClick={() => {
                  setQueryDraft("");
                  dispatch({ type: "SEARCH", query: "" });
                }}
              >
                <XIcon className="size-4" />
              </button>
            ) : null}
          </label>
          {state.mapFilter.query && state.selection.kind === "none" ? (
            <div className="mt-2 overflow-hidden rounded-xl bg-white py-1 shadow-[0_8px_28px_rgba(23,33,28,.22)]">
              {searchResults.length ? (
                searchResults.map((result) => (
                  <button
                    key={
                      result.kind === "building"
                        ? result.building.id
                        : result.facility.id
                    }
                    data-search-result={
                      result.kind === "building"
                        ? result.building.id
                        : result.facility.id
                    }
                    type="button"
                    className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-neutral-50 focus-visible:bg-neutral-50 focus-visible:outline-none"
                    onClick={() => {
                      if (result.kind === "building") {
                        selectBuilding(result.building, "search");
                      } else {
                        selectFacility(result.facility, "search");
                      }
                    }}
                  >
                    <span className="grid size-9 place-items-center rounded-lg bg-[#e4f1eb] text-xs font-bold text-[#176346]">
                      {result.building.code}
                    </span>
                    <span className="min-w-0">
                      <strong className="block truncate text-sm">
                        {result.kind === "building"
                          ? result.building.name
                          : `${result.building.name} · ${result.facility.name}`}
                      </strong>
                      <span className="block truncate text-xs text-neutral-500">
                        {result.kind === "building"
                          ? result.building.englishName
                          : `${floorLabel(result.facility.floorId)} · ${result.facility.access}`}
                      </span>
                    </span>
                  </button>
                ))
              ) : (
                <p className="px-4 py-4 text-sm text-neutral-600">
                  没有匹配的建筑
                </p>
              )}
            </div>
          ) : null}
        </form>
      </header>

      <div
        aria-hidden={editSession ? true : undefined}
        inert={editSession ? true : undefined}
        className={cn(
          "pointer-events-none absolute inset-x-0 top-[68px] z-20 overflow-hidden px-3 transition-opacity md:top-[76px] md:flex md:justify-center",
          chromeHidden && "invisible pointer-events-none opacity-0",
          !editSession &&
            state.selection.kind !== "none" &&
            state.sheet.snap === "full" &&
            "md:visible md:opacity-100",
        )}
      >
        <nav
          aria-label="设施筛选"
          className="pointer-events-auto flex w-full gap-1.5 overflow-x-auto py-1 pr-5 [scrollbar-width:none] md:w-auto md:max-w-[calc(100%-32px)] md:gap-2 md:pr-1 [&::-webkit-scrollbar]:hidden"
        >
          {CATEGORIES.map((category) => {
            const Icon = category.icon;
            const active = state.mapFilter.category === category.id;
            return (
              <button
                key={category.id}
                type="button"
                aria-pressed={active}
                className={cn(
                  "flex h-11 shrink-0 items-center gap-1.5 rounded-full border px-2.5 text-[13px] font-medium shadow-sm transition-colors md:gap-2 md:px-3 md:text-sm",
                  active
                    ? "border-[#176346] bg-[#176346] text-white"
                    : "border-black/10 bg-white text-neutral-700 hover:bg-neutral-50",
                )}
                onClick={() => {
                  dispatch(
                    session.mode === "browse" &&
                      session.scene.kind === "category-results" &&
                      session.scene.category === category.id
                      ? { type: "DISMISS" }
                      : { type: "OPEN_CATEGORY", category: category.id },
                  );
                }}
              >
                <Icon className="size-4" /> {category.label}
              </button>
            );
          })}
        </nav>
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-[#dce7e9] to-transparent md:hidden"
        />
      </div>

      <div
        aria-hidden={editSession ? true : undefined}
        inert={editSession ? true : undefined}
        className={cn(
          "absolute top-[124px] right-3 z-20 flex flex-col overflow-hidden rounded-xl border border-black/10 bg-white shadow-lg md:top-auto md:right-auto md:bottom-6 md:left-4",
          editSession && "invisible pointer-events-none opacity-0",
        )}
      >
        <button
          type="button"
          aria-label="添加地点"
          className="flex min-h-11 items-center gap-2 border-b border-black/10 px-3 text-sm font-semibold hover:bg-neutral-50"
          onClick={startAddAtPlacementAnchor}
        >
          <PlusIcon className="size-5" /> 添加地点
        </button>
        <button
          type="button"
          aria-label="回到中大校园"
          className="grid size-11 place-items-center border-b border-black/10 hover:bg-neutral-50"
          onClick={() => {
            cameraGateRef.current.invalidate();
            mapRef.current?.setZoomAndCenter(
              17.2,
              amapPositionsRef.current.__campus ?? CAMPUS_CENTER,
              false,
              320,
            );
          }}
        >
          <LocateFixedIcon className="size-5" />
        </button>
        <button
          type="button"
          aria-label="放大"
          className="hidden size-11 place-items-center border-b border-black/10 hover:bg-neutral-50 md:grid"
          onClick={() => mapRef.current?.zoomIn()}
        >
          <PlusIcon className="size-5" />
        </button>
        <button
          type="button"
          aria-label="缩小"
          className="hidden size-11 place-items-center hover:bg-neutral-50 md:grid"
          onClick={() => mapRef.current?.zoomOut()}
        >
          <MinusIcon className="size-5" />
        </button>
      </div>

      <section
        ref={panelRef}
        hidden={
          !editSession &&
          (state.selection.kind === "external" ||
            (state.selection.kind === "none" && !state.mapFilter.category))
        }
        aria-labelledby="campus-map-panel-title"
        className={cn(
          "absolute z-30 overflow-hidden overscroll-contain border-black/10 bg-white shadow-[0_12px_40px_rgba(23,33,28,.24)]",
          "inset-x-0 bottom-0 rounded-t-2xl border-t md:inset-y-4 md:right-4 md:left-auto md:w-[390px] md:rounded-2xl md:border",
          editSession?.status === "placing"
            ? "h-[48dvh] max-h-[65dvh] md:inset-y-4 md:h-auto md:max-h-[calc(100dvh-32px)]"
            : editSession
              ? "h-[65dvh] md:h-auto"
              : state.sheet.snap === "full"
                ? "h-[72dvh] md:h-auto"
                : "h-[min(248px,36dvh)] md:h-auto md:max-h-[calc(100%-32px)]",
        )}
      >
        {!editSession ? (
          <button
            type="button"
            aria-label={
              state.sheet.snap === "full" ? "收起地点卡片" : "展开地点卡片"
            }
            aria-expanded={state.sheet.snap === "full"}
            aria-controls="campus-map-panel-content"
            className="mx-auto grid h-11 w-20 place-items-center rounded-b-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#176346] md:hidden"
            onClick={() => {
              dispatch({
                type: "SET_SNAP",
                snap: state.sheet.snap === "full" ? "peek" : "full",
              });
            }}
          >
            <span className="h-1 w-10 rounded-full bg-neutral-300" />
          </button>
        ) : (
          <button
            type="button"
            aria-label="关闭地图编辑"
            disabled={editSession.status === "publishing"}
            className="absolute top-2 right-3 z-10 grid size-11 place-items-center rounded-full bg-white hover:bg-neutral-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#176346]"
            onClick={() => dispatchEditEvent({ type: "REQUEST_CLOSE" })}
          >
            <XIcon aria-hidden="true" className="size-5" />
          </button>
        )}
        {editSession ? (
          <CampusMapEditSheet
            session={editSession}
            centerPosition={centerPosition}
            placementPending={placementPending}
            placeContext={
              editSession.status === "placing" && mapMoving
                ? { status: "loading" }
                : placeContext
            }
            factSchema={factSchema}
            onEvent={dispatchEditEvent}
          />
        ) : state.selection.kind === "none" &&
          state.mapFilter.category &&
          activeCategoryStyle ? (
          <div
            id="campus-map-panel-content"
            className="flex h-[calc(100%-44px)] flex-col"
          >
            <div className="flex items-center gap-3 border-b border-black/10 px-5 pb-4">
              <span
                className="grid size-11 shrink-0 place-items-center rounded-full text-white"
                style={{ background: activeCategoryStyle.color }}
              >
                <activeCategoryStyle.icon className="size-5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-xs text-neutral-500">建筑内设施</p>
                <h2
                  id="campus-map-panel-title"
                  ref={panelTitleRef}
                  className="text-xl font-semibold"
                >
                  {categoryBuildingCount} 栋建筑有{activeCategoryStyle.label}
                </h2>
              </div>
              <button
                type="button"
                aria-label={`关闭${activeCategoryStyle.label}列表`}
                className="grid size-11 place-items-center rounded-full hover:bg-neutral-100"
                onClick={() => dispatch({ type: "DISMISS" })}
              >
                <XIcon className="size-5" />
              </button>
            </div>
            {clusterStatus !== "ready" ? (
              <p
                role="status"
                className={cn(
                  "mx-5 mt-3 rounded-lg px-3 py-2 text-xs",
                  clusterStatus === "error"
                    ? "bg-amber-50 text-amber-900"
                    : "bg-neutral-100 text-neutral-600",
                )}
              >
                {clusterStatus === "error"
                  ? "地图标记加载失败，列表仍可使用"
                  : "地图标记正在加载"}
              </p>
            ) : null}
            <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5">
              {(state.sheet.snap === "full"
                ? categoryFacilities
                : categoryFacilities.slice(0, 3)
              ).map((facility) => {
                const building = BUILDINGS.find(
                  (item) => item.id === facility.buildingId,
                );
                return (
                  <button
                    key={facility.id}
                    data-return-result={facility.id}
                    type="button"
                    className="flex min-h-16 w-full items-center gap-3 border-b border-black/8 py-3 text-left"
                    onClick={() => selectFacility(facility, "category")}
                  >
                    <span
                      className="grid size-9 shrink-0 place-items-center rounded-full text-white"
                      style={{ background: activeCategoryStyle.color }}
                    >
                      <activeCategoryStyle.icon className="size-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <strong className="block text-sm">
                        {building?.name} · {floorLabel(facility.floorId)}
                      </strong>
                      <span className="mt-0.5 block text-xs text-neutral-500">
                        {facility.name} · {facility.access}
                      </span>
                    </span>
                  </button>
                );
              })}
              {categoryFacilities.length > 3 ? (
                <button
                  type="button"
                  className="mt-3 min-h-11 w-full rounded-xl bg-neutral-100 text-sm font-medium"
                  onClick={() =>
                    dispatch({
                      type: "SET_SNAP",
                      snap: state.sheet.snap === "full" ? "peek" : "full",
                    })
                  }
                >
                  {state.sheet.snap === "full"
                    ? "收起列表"
                    : `查看全部 ${categoryFacilities.length} 项设施记录`}
                </button>
              ) : null}
              {!categoryFacilities.length ? (
                <div className="py-6 text-center text-sm text-neutral-500">
                  <p>当前没有已收录地点</p>
                  <button
                    type="button"
                    className="mt-3 min-h-11 rounded-xl bg-[#174b38] px-4 font-semibold text-white"
                    onClick={startAddAtPlacementAnchor}
                  >
                    添加这个类别的地点
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        ) : selectedBuilding ? (
          <div
            id="campus-map-panel-content"
            className="flex h-[calc(100%-44px)] flex-col overscroll-contain md:h-full"
          >
            <div className="flex items-start gap-3 border-b border-black/10 p-4 md:p-5">
              {selectedFacility ? (
                <button
                  type="button"
                  aria-label={
                    facilityOrigin === "category"
                      ? `返回${amenityStyle(selectedFacility.category).label}列表`
                      : "返回建筑"
                  }
                  className="grid size-11 shrink-0 place-items-center rounded-full hover:bg-neutral-100"
                  onClick={navigateEntityBack}
                >
                  <ArrowLeftIcon className="size-5" />
                </button>
              ) : (
                <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-[#174b38] text-sm font-bold text-white">
                  {selectedBuilding.code}
                </span>
              )}
              <div className="min-w-0 flex-1">
                <h2
                  id="campus-map-panel-title"
                  ref={panelTitleRef}
                  tabIndex={-1}
                  className="truncate text-xl font-semibold tracking-[-0.02em] outline-none"
                >
                  {selectedFacility?.name ?? selectedBuilding.name}
                </h2>
                <p className="mt-1 truncate text-sm text-neutral-500">
                  {selectedFacility
                    ? `${selectedBuilding.name} · ${floorLabel(selectedFacility.floorId)}`
                    : selectedBuilding.englishName}
                </p>
              </div>
              <button
                type="button"
                aria-label="关闭地点详情"
                className="grid size-11 shrink-0 place-items-center rounded-full hover:bg-neutral-100"
                onClick={closeSelection}
              >
                <XIcon className="size-5" />
              </button>
            </div>

            {selectedFacility ? (
              <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5">
                <div className="flex flex-wrap gap-2 pt-4">
                  <span className="rounded-lg bg-[#e7f1ec] px-2.5 py-1.5 text-sm font-medium text-[#174b38]">
                    {floorLabel(selectedFacility.floorId)}
                  </span>
                  <span className="rounded-lg bg-neutral-100 px-2.5 py-1.5 text-sm text-neutral-700">
                    {selectedFacility.access}
                  </span>
                </div>
                {selectedFacility.locationPrecision === "building" ? (
                  <p className="mt-4 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900">
                    建筑内位置 · 尚无室内精确坐标
                  </p>
                ) : null}
                <button
                  type="button"
                  className="mt-3 min-h-11 w-full rounded-xl bg-[#174b38] px-4 text-sm font-semibold text-white"
                  onClick={() =>
                    dispatch({ type: "REFRAME", reason: "map-selection" })
                  }
                >
                  定位所属建筑
                </button>
                <button
                  type="button"
                  className="mt-3 min-h-11 w-full rounded-xl border border-[#174b38] px-4 text-sm font-semibold text-[#174b38]"
                  onClick={() => startEdit(selectedFacility)}
                >
                  建议修改
                </button>
                {state.sheet.snap === "full" ? (
                  <dl className="mt-5 grid gap-3 border-t border-black/8 pt-4 text-sm">
                    <div>
                      <dt className="text-neutral-500">资料来源</dt>
                      <dd className="mt-1 font-medium">
                        {selectedFacility.source}
                      </dd>
                    </div>
                  </dl>
                ) : null}
              </div>
            ) : (
              <>
                <div
                  className={cn(
                    "gap-2 overflow-x-auto border-b border-black/8 px-4 py-3 md:px-5",
                    state.sheet.snap === "full" ? "flex" : "hidden md:flex",
                  )}
                >
                  <button
                    type="button"
                    className={cn(
                      "min-h-11 shrink-0 rounded-full px-3 text-sm",
                      !state.buildingContext.floorId
                        ? "bg-[#174b38] text-white"
                        : "bg-neutral-100",
                    )}
                    onClick={() =>
                      dispatch({
                        type: "SET_BUILDING_FLOOR",
                        floorId: null,
                      })
                    }
                  >
                    全部楼层
                  </button>
                  {selectedBuilding.floorIds.map((floorId) => (
                    <button
                      key={floorId}
                      type="button"
                      aria-pressed={state.buildingContext.floorId === floorId}
                      className={cn(
                        "min-h-11 shrink-0 rounded-full px-3 text-sm",
                        state.buildingContext.floorId === floorId
                          ? "bg-[#174b38] text-white"
                          : "bg-neutral-100",
                      )}
                      onClick={() =>
                        dispatch({
                          type: "SET_BUILDING_FLOOR",
                          floorId,
                        })
                      }
                    >
                      {floorLabel(floorId)}
                    </button>
                  ))}
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto p-4 md:p-5">
                  <h3 className="text-sm font-semibold">建筑内设施</h3>
                  <div
                    className={cn(
                      "mt-3 divide-y divide-black/8",
                      state.sheet.snap !== "full" && "hidden md:block",
                    )}
                  >
                    {buildingFacilities.length ? (
                      buildingFacilities.map((facility) => {
                        const style = amenityStyle(facility.category);
                        const Icon = style.icon;
                        return (
                          <button
                            key={facility.id}
                            data-return-result={facility.id}
                            type="button"
                            className="flex w-full items-center gap-3 py-3 text-left hover:bg-neutral-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#176346]"
                            onClick={() => selectFacility(facility, "building")}
                          >
                            <span
                              className="grid size-9 shrink-0 place-items-center rounded-full text-white"
                              style={{ background: style.color }}
                            >
                              <Icon className="size-4" />
                            </span>
                            <span className="min-w-0 flex-1">
                              <strong className="block truncate text-sm">
                                {facility.name}
                              </strong>
                              <span className="text-xs text-neutral-500">
                                {facility.access}
                              </span>
                            </span>
                          </button>
                        );
                      })
                    ) : (
                      <p className="py-8 text-center text-sm text-neutral-500">
                        这个楼层暂无已收录设施
                      </p>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        ) : null}
      </section>
    </main>
  );
}
