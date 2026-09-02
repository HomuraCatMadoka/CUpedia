"use client";

import Link from "next/link";
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
  Building2Icon,
  CheckCircle2Icon,
  LocateFixedIcon,
  MapPinIcon,
  MinusIcon,
  PlusIcon,
  SearchIcon,
  XIcon,
} from "lucide-react";

import {
  CAMPUS_MAP_CATEGORIES as CATEGORIES,
  CampusMapFacilityResultButton as FacilityResultButton,
  campusMapAmenityStyle as amenityStyle,
  campusMapFeedbackSummaryLabel as feedbackSummaryLabel,
  campusMapFloorLabel as floorLabel,
  campusMapPlaceLocationLabel as placeLocationLabel,
  knownCampusMapAmenity as knownAmenity,
} from "@/components/campus-map/browse-card-presentation";
import { AmapFacilityMarkerRuntime } from "@/components/campus-map/amap-facility-marker-runtime";
import { CampusMapEditSheet } from "@/components/campus-map/edit-sheet";
import { useCampusMapEditSessionOwner } from "@/components/campus-map/use-campus-map-edit-session-owner";

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
import { AmapInteractionAdapter } from "@/lib/campus-map/amap-interaction-adapter";
import {
  providerPositionToWgs84,
  type CampusMapPosition,
} from "@/lib/campus-map/amap-position";
import {
  createAmapGeocoderAdapter,
  createAmapPlaceContextResolver,
  type AmapGeocoderService,
  type AmapPlaceContextResolver,
  type AmapPlaceContextResult,
  type AmapResolvedPlaceContext,
} from "@/lib/campus-map/amap-place-context";
import type { CampusMapAmenity } from "@/lib/campus-map/facility-marker";
import type { CampusMapPlaceFeedbackSummary } from "@/lib/campus-map/place-feedback";
import {
  loadCampusMapAmapPoiCard,
  loadCampusMapBrowseProjection,
} from "@/lib/campus-map/browse-actions";
import {
  CampusMapAmapCoordinateProjector,
  CampusMapAmapPoiCardResolver,
} from "@/lib/campus-map/amap-browse-projection";
import {
  CAMPUS_MAP_DEFAULT_VIEW_CENTER as CAMPUS_CENTER,
  EMPTY_CAMPUS_MAP_BROWSE_PROJECTION,
  queryCampusMapBrowse,
  queryCampusMapNearby,
  type CampusMapBrowseBuilding,
  type CampusMapBrowsePlace,
  type CampusMapBrowseProjection,
} from "@/lib/campus-map/browse-projection";
import {
  CampusMapBrowseProjectionStore,
  type CampusMapBrowseRefreshResult,
} from "@/lib/campus-map/browse-projection-store";
import { summarizeCampusMapAccess } from "@/lib/campus-map/access-summary";
import { projectCampusMapBuildingDirectory } from "@/lib/campus-map/building-directory";
import {
  campusMapBuildingDisplayFor,
  projectCampusMapBuildingDisplay,
} from "@/lib/campus-map/building-display";
import {
  CAMPUS_MAP_CATEGORY_PEEK_RESULT_LIMIT,
  campusMapMobilePanelHeight,
  type CampusMapMobilePanelLayout,
} from "@/lib/campus-map/card-layout";
import {
  identifyCampusMapEditPublisher,
  publishCampusMapEdit,
  reconcileCampusMapEditPublish,
} from "@/lib/campus-map/edit-actions";
import {
  CampusMapPublishReceiptConsumer,
  bindBrowserCampusMapPublishActor,
  readBrowserCampusMapPublishActor,
  readBrowserCampusMapPublishReceiptState,
  withBrowserCampusMapReceiptLock,
  writeBrowserCampusMapPublishReceiptState,
} from "@/lib/campus-map/publish-receipt-consumer";
import type { CampusMapPublishCommand } from "@/lib/campus-map/publish-contract";
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
  type CampusMapFocusTarget,
  type CampusMapSceneCatalog,
  type CampusMapSession,
} from "@/lib/campus-map/scene-kernel";
import type {
  CampusMapFactSchema,
  CampusMapSelectionTarget,
} from "@/lib/campus-map/fact-store";
import { cn } from "@/lib/utils";

type Amenity = CampusMapAmenity;
type Building = CampusMapBrowseBuilding;
type Place = CampusMapBrowsePlace;
type Position = CampusMapPosition;
type UserLocationState =
  | { status: "idle" }
  | { status: "locating" }
  | {
      status: "located";
      position: { longitude: number; latitude: number };
      accuracyMeters: number;
    }
  | {
      status: "error";
      reason: "denied" | "timeout" | "unavailable" | "unsupported";
    };
type ResolvedMappedProviderTarget =
  | { kind: "building"; building: Building }
  | { kind: "place"; facility: Place };

function findMappedProviderTarget(
  projection: CampusMapBrowseProjection,
  target: CampusMapSelectionTarget,
): ResolvedMappedProviderTarget | null {
  if (target.kind === "building") {
    const building = projection.buildings.find(
      (candidate) => candidate.buildingId === target.buildingId,
    );
    return building ? { kind: "building", building } : null;
  }
  const facility = projection.places.find(
    (candidate) => candidate.placeId === target.placeId,
  );
  return facility ? { kind: "place", facility } : null;
}

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
    markerKey?: string;
  }>;
  originEvent?: { target?: Element | null };
}

interface AMapMarker {
  on(event: string, handler: () => void): void;
  getPosition(): AMapLngLat | null;
  setContent(content: string): void;
  setzIndex(zIndex: number): void;
}

interface AMapMarkerCluster {
  on(event: string, handler: (event: AMapEvent) => void): void;
  setData(data: readonly Record<string, unknown>[]): void;
  setMap(map: AMapMap | null): void;
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
    _AMapSecurityConfig?: { serviceHost: string };
  }
}

function canonicalInitialSearch(
  search: string,
  catalog: CampusMapSceneCatalog,
) {
  const params = new URLSearchParams(search);
  if (params.get("v") === "1") return search;
  return `?${encodeCampusMapUrl(EMPTY_CAMPUS_MAP_SCENE_SESSION, catalog)}`;
}

function roundedLocationMeters(value: number) {
  return Math.max(10, Math.round(value / 10) * 10);
}

function approximateDistanceLabel(distanceMeters: number) {
  return `约 ${roundedLocationMeters(distanceMeters)} 米（直线距离）`;
}

function nearbyDistanceLabel(distance: {
  distanceMeters: number;
  distanceEvidence: "place-point" | "building-anchor";
}) {
  return distance.distanceEvidence === "place-point"
    ? approximateDistanceLabel(distance.distanceMeters)
    : `约距所在建筑 ${roundedLocationMeters(distance.distanceMeters)} 米`;
}

function userLocationStatusText(state: UserLocationState) {
  if (state.status === "locating") return "正在读取你这一次的位置…";
  if (state.status === "located") {
    const accuracy = roundedLocationMeters(state.accuracyMeters);
    return state.accuracyMeters > 100
      ? `已显示当前位置。定位精度较低（约 ${accuracy} 米），距离仅供参考。`
      : `已显示当前位置，定位精度约 ${accuracy} 米。距离为直线距离。`;
  }
  if (state.status === "error") {
    switch (state.reason) {
      case "denied":
        return "未获定位权限。搜索、分类和手动选点仍可使用。";
      case "timeout":
        return "定位超时。搜索、分类和手动选点仍可使用。";
      case "unsupported":
        return "此浏览器不支持定位。搜索、分类和手动选点仍可使用。";
      case "unavailable":
        return "暂时无法取得位置。搜索、分类和手动选点仍可使用。";
    }
  }
  return "";
}

type ProjectedCampusMapSelection =
  | { kind: "none" }
  | { kind: "building"; buildingId: string }
  | { kind: "place"; buildingId: string | null; placeId: string }
  | {
      kind: "external";
      externalId: string;
      position: readonly [longitude: number, latitude: number];
    };

type ProjectedCampusMapState = {
  selection: ProjectedCampusMapSelection;
  mapFilter: { category: string | null; query: string };
  buildingContext: { floorId: string | null };
  sheet: { snap: "hidden" | "peek" | "full" };
};

function projectedState(
  session: CampusMapSession,
  returnTo: CampusMapSession | null,
  catalog: CampusMapSceneCatalog,
): ProjectedCampusMapState {
  if (session.mode !== "browse") {
    return {
      selection: { kind: "none" },
      mapFilter: { category: null, query: "" },
      buildingContext: { floorId: null },
      sheet: { snap: "hidden" },
    };
  }
  const scene = session.scene;
  const returnScene = returnTo?.mode === "browse" ? returnTo.scene : null;
  const facility =
    scene.kind === "place" ? catalog.places[scene.placeId] : null;
  const selection: ProjectedCampusMapSelection =
    scene.kind === "building"
      ? { kind: "building", buildingId: scene.buildingId }
      : scene.kind === "place" && facility
        ? {
            kind: "place",
            placeId: scene.placeId,
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
          : scene.kind === "place" && facility
            ? facility.floorId
            : null,
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

function samePlacementPosition(
  left: Position,
  right: Position,
  tolerance = 0.00002,
) {
  return (
    Math.abs(left[0] - right[0]) <= tolerance &&
    Math.abs(left[1] - right[1]) <= tolerance
  );
}

function buildingFor(
  selection: ProjectedCampusMapSelection,
  buildings: readonly Building[],
) {
  const buildingId =
    selection.kind === "building" || selection.kind === "place"
      ? selection.buildingId
      : null;
  return (
    buildings.find((building) => building.buildingId === buildingId) ?? null
  );
}

function facilityFor(
  selection: ProjectedCampusMapSelection,
  places: readonly Place[],
) {
  return selection.kind === "place"
    ? (places.find((facility) => facility.placeId === selection.placeId) ??
        null)
    : null;
}

function facilityBackLabel(returnTo: CampusMapSession | null) {
  const returnScene = returnTo?.mode === "browse" ? returnTo.scene : null;
  if (returnScene?.kind === "search-results") return "返回搜索结果";
  if (returnScene?.kind === "category-results") {
    const category = knownAmenity(returnScene.category);
    return category
      ? `返回${amenityStyle(category).label}列表`
      : "返回设施列表";
  }
  if (returnScene?.kind === "building") return "返回建筑";
  if (returnScene?.kind === "map") return "返回地图";
  return "返回";
}

function metadataLabel(...parts: Array<string | null | undefined>) {
  return parts.filter(Boolean).join(" · ");
}

function facilityResultLocationLabel(
  facility: Place,
  building: CampusMapBrowseBuilding | undefined,
  buildingLabel?: string,
) {
  if (facility.location.kind === "outdoor-point") return "室外位置";
  if (!building) return placeLocationLabel(facility);
  const visibleBuildingLabel = buildingLabel ?? building.name;
  return facility.location.kind === "floor"
    ? `${visibleBuildingLabel} · ${facility.location.floor.displayLabel}`
    : `${visibleBuildingLabel} · 楼层未知`;
}

function publishedPlaceNotice(
  projection: CampusMapBrowseProjection,
  placeId: string,
  operation: CampusMapPublishCommand["changes"][number]["operation"] | null,
) {
  const place = projection.places.find(
    (candidate) => candidate.placeId === placeId,
  );
  if (!place?.buildingId) return "地点已发布";
  const building = projection.buildings.find(
    (candidate) => candidate.buildingId === place.buildingId,
  );
  if (!building) return "地点已发布";
  const display = projectCampusMapBuildingDisplay(projection.buildings);
  const buildingLabel =
    campusMapBuildingDisplayFor(display, building.buildingId)?.label ??
    building.name;
  const location = `${buildingLabel} · ${floorLabel(place.floorId, place.floorLabel)}`;
  return operation === "create"
    ? `已添加到 ${location}`
    : `地点已发布 · ${location}`;
}

function groupBuildingFacilities(building: Building, places: readonly Place[]) {
  const floorOrder = new Map(
    building.floors.map((floor, index) => [floor.floorId, index]),
  );
  const groups = new Map<
    string,
    { floorId: string | null; label: string; places: Place[] }
  >();
  for (const facility of places) {
    const key = facility.floorId ?? "__building";
    const group = groups.get(key) ?? {
      floorId: facility.floorId,
      label: floorLabel(facility.floorId, facility.floorLabel),
      places: [],
    };
    group.places.push(facility);
    groups.set(key, group);
  }
  return [...groups.values()].sort((left, right) => {
    if (left.floorId === null) return -1;
    if (right.floorId === null) return 1;
    return (
      (floorOrder.get(left.floorId) ?? Number.MAX_SAFE_INTEGER) -
      (floorOrder.get(right.floorId) ?? Number.MAX_SAFE_INTEGER)
    );
  });
}

function summarizeFacilityTypes(places: readonly Place[]) {
  const counts = new Map<Amenity, number>();
  for (const facility of places) {
    counts.set(facility.pinType, (counts.get(facility.pinType) ?? 0) + 1);
  }
  return CATEGORIES.flatMap((category) => {
    const count = counts.get(category.id) ?? 0;
    return count > 0 ? [{ ...category, count }] : [];
  });
}

export function CampusMapRuntime({
  initialSearch = "",
  factSchema = null,
  initialBrowseProjection = EMPTY_CAMPUS_MAP_BROWSE_PROJECTION,
  initialFeedbackSummaries = {},
  onPublishedProjectionRefreshed,
}: {
  initialSearch?: string;
  factSchema?: CampusMapFactSchema | null;
  initialBrowseProjection?: CampusMapBrowseProjection;
  initialFeedbackSummaries?: Record<string, CampusMapPlaceFeedbackSummary>;
  onPublishedProjectionRefreshed?(result: CampusMapBrowseRefreshResult): void;
}) {
  const [projectionStore] = useState(
    () =>
      new CampusMapBrowseProjectionStore(
        initialBrowseProjection,
        loadCampusMapBrowseProjection,
        CATEGORIES.map((category) => category.id),
      ),
  );
  const browseSnapshot = useSyncExternalStore(
    projectionStore.subscribe,
    projectionStore.getSnapshot,
    projectionStore.getSnapshot,
  );
  const browseProjection = browseSnapshot.projection;
  const sceneCatalog = projectionStore.getSceneCatalog();
  const [driverInitialSearch] = useState(() =>
    canonicalInitialSearch(initialSearch, sceneCatalog),
  );
  const [queryDraft, setQueryDraft] = useState(
    () =>
      projectedState(
        decodeCampusMapUrl(driverInitialSearch, sceneCatalog).session,
        null,
        sceneCatalog,
      ).mapFilter.query,
  );
  const buildings = browseProjection.buildings;
  const places = browseProjection.places;
  const buildingDisplay = useMemo(
    () => projectCampusMapBuildingDisplay(buildings),
    [buildings],
  );
  const buildingsRef = useRef(buildings);
  const facilitiesRef = useRef(places);
  useEffect(() => {
    buildingsRef.current = buildings;
    facilitiesRef.current = places;
  }, [buildings, places]);
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
    | { status: "ready"; key: string; serviceHost: string }
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
  const [publishNotice, setPublishNotice] = useState<{
    placeId: string;
    message: string;
  } | null>(null);
  const [userLocation, setUserLocation] = useState<UserLocationState>({
    status: "idle",
  });
  const userLocationRequestRef = useRef(0);
  const userLocationCameraCancelRef = useRef<(() => void) | null>(null);
  const mapRef = useRef<AMapMap | null>(null);
  const mapElementRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLElement | null>(null);
  const facilityMarkerRuntimeRef = useRef(new AmapFacilityMarkerRuntime());
  const cameraGateRef = useRef(new CameraRequestGate());
  const pendingDriverCameraRef = useRef<{
    command: CampusMapDriverCameraCommand;
    context: CampusMapDriverEffectContext;
  } | null>(null);
  const pendingPlacementCameraRef = useRef<{
    token: number;
    context: CampusMapDriverEffectContext;
    position: Position;
  } | null>(null);
  const placementCameraTokenRef = useRef(0);
  const retiredPlacementCameraTargetsRef = useRef<Position[]>([]);
  const lastSettledPlacementCameraTargetRef = useRef<Position | null>(null);
  const mapDraggingRef = useRef(false);
  const userGestureAwaitingMoveEndRef = useRef(false);
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
  const providerPoiCardResolverRef = useRef(
    new CampusMapAmapPoiCardResolver(loadCampusMapAmapPoiCard),
  );
  const providerTargetIntentRef = useRef(0);
  const coordinateProjectorRef = useRef(new CampusMapAmapCoordinateProjector());
  const didSetInitialCenterRef = useRef(false);

  const positionFor = useCallback(
    (building: Building) =>
      amapPositionsRef.current[`building:${building.buildingId}`] ?? null,
    [],
  );

  const resetMapRuntime = useCallback(() => {
    pointerGestureCleanupRef.current?.();
    pointerGestureCleanupRef.current = null;
    facilityMarkerRuntimeRef.current.destroy();
    mapRef.current?.destroy();
    mapRef.current = null;
    placeContextResolverRef.current?.invalidate();
    placeContextResolverRef.current = null;
    amapPositionsRef.current = {};
    cameraGateRef.current.invalidate();
    userLocationCameraCancelRef.current = null;
    pendingDriverCameraRef.current = null;
    pendingPlacementCameraRef.current = null;
    placementCameraTokenRef.current += 1;
    retiredPlacementCameraTargetsRef.current = [];
    lastSettledPlacementCameraTargetRef.current = null;
    mapDraggingRef.current = false;
    userGestureAwaitingMoveEndRef.current = false;
    pendingSelectionTokenRef.current = null;
    providerTargetIntentRef.current += 1;
    providerPoiCardResolverRef.current.invalidate();
    coordinateProjectorRef.current.invalidate();
    didSetInitialCenterRef.current = false;
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
      if (!map || !mapElement) return null;
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
      return () => {
        if (!request.isCurrent()) return;
        cameraGateRef.current.invalidate();
        if (pendingSelectionTokenRef.current === request.token) {
          pendingSelectionTokenRef.current = null;
        }
      };
    },
    [],
  );

  const invalidateUserLocationActivity = useCallback(() => {
    const requestId = ++userLocationRequestRef.current;
    userLocationCameraCancelRef.current?.();
    userLocationCameraCancelRef.current = null;
    return requestId;
  }, []);

  const clearUserLocation = useCallback(() => {
    invalidateUserLocationActivity();
    setUserLocation({ status: "idle" });
  }, [invalidateUserLocationActivity]);

  const cancelPendingUserLocation = useCallback(() => {
    invalidateUserLocationActivity();
    setUserLocation((current) =>
      current.status === "locating" ? { status: "idle" } : current,
    );
  }, [invalidateUserLocationActivity]);

  const requestUserLocation = useCallback(() => {
    const requestId = invalidateUserLocationActivity();
    if (!("geolocation" in navigator) || !navigator.geolocation) {
      setUserLocation({ status: "error", reason: "unsupported" });
      return;
    }
    setUserLocation({ status: "locating" });
    try {
      navigator.geolocation.getCurrentPosition(
        (result) => {
          if (userLocationRequestRef.current !== requestId) return;
          const longitude = result.coords.longitude;
          const latitude = result.coords.latitude;
          const accuracyMeters = result.coords.accuracy;
          if (
            !Number.isFinite(longitude) ||
            !Number.isFinite(latitude) ||
            longitude < -180 ||
            longitude > 180 ||
            latitude < -90 ||
            latitude > 90 ||
            !Number.isFinite(accuracyMeters) ||
            accuracyMeters < 0
          ) {
            setUserLocation({ status: "error", reason: "unavailable" });
            return;
          }
          setUserLocation({
            status: "located",
            position: { longitude, latitude },
            accuracyMeters,
          });
          const offset = amapOffsetRef.current;
          userLocationCameraCancelRef.current = requestCamera(
            [longitude + offset[0], latitude + offset[1]],
            "map-selection",
          );
        },
        (error) => {
          if (userLocationRequestRef.current !== requestId) return;
          setUserLocation({
            status: "error",
            reason:
              error.code === 1
                ? "denied"
                : error.code === 3
                  ? "timeout"
                  : "unavailable",
          });
        },
        { enableHighAccuracy: true, timeout: 10_000, maximumAge: 0 },
      );
    } catch {
      if (userLocationRequestRef.current === requestId) {
        setUserLocation({ status: "error", reason: "unavailable" });
      }
    }
  }, [invalidateUserLocationActivity, requestCamera]);

  const executeDriverCamera = useCallback(
    (
      camera: CampusMapDriverCameraCommand,
      context: CampusMapDriverEffectContext,
    ) => {
      if (camera.kind === "cancel") {
        const pendingPlacementCamera = pendingPlacementCameraRef.current;
        if (pendingPlacementCamera) {
          retiredPlacementCameraTargetsRef.current = [
            ...retiredPlacementCameraTargetsRef.current,
            pendingPlacementCamera.position,
          ].slice(-8);
        }
        pendingDriverCameraRef.current = null;
        pendingPlacementCameraRef.current = null;
        placementCameraTokenRef.current += 1;
        cameraGateRef.current.invalidate();
        pendingSelectionTokenRef.current = null;
        setMapMoving(false);
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
        const previousPlacementCamera = pendingPlacementCameraRef.current;
        if (previousPlacementCamera) {
          retiredPlacementCameraTargetsRef.current = [
            ...retiredPlacementCameraTargetsRef.current,
            previousPlacementCamera.position,
          ].slice(-8);
        }
        const previousSettledTarget =
          lastSettledPlacementCameraTargetRef.current;
        if (previousSettledTarget) {
          retiredPlacementCameraTargetsRef.current = [
            ...retiredPlacementCameraTargetsRef.current,
            previousSettledTarget,
          ].slice(-8);
        }
        lastSettledPlacementCameraTargetRef.current = null;
        const currentProviderPosition = placementAnchorLngLat(
          map,
          mapElement,
          AMap,
        );
        const currentPosition = providerPositionToWgs84(
          [currentProviderPosition.lng, currentProviderPosition.lat],
          offset,
        );
        if (samePlacementPosition(currentPosition, camera.position)) {
          pendingPlacementCameraRef.current = null;
          setMapMoving(false);
          setCenterPosition([camera.position[0], camera.position[1]]);
          setProviderCenterPosition(providerPosition);
          setMapCenterRevision((revision) => revision + 1);
          lastSettledPlacementCameraTargetRef.current = [
            camera.position[0],
            camera.position[1],
          ];
          return;
        }
        pendingPlacementCameraRef.current = {
          token: ++placementCameraTokenRef.current,
          context,
          position: [camera.position[0], camera.position[1]],
        };
        setMapMoving(true);
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
      const pendingPlacementCamera = pendingPlacementCameraRef.current;
      if (pendingPlacementCamera) {
        retiredPlacementCameraTargetsRef.current = [
          ...retiredPlacementCameraTargetsRef.current,
          pendingPlacementCamera.position,
        ].slice(-8);
      }
      pendingPlacementCameraRef.current = null;
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
      const building =
        camera.kind === "focus"
          ? buildingsRef.current.find(
              (item) => item.buildingId === camera.buildingId,
            )
          : null;
      const position =
        camera.kind === "focus-place"
          ? (amapPositionsRef.current[`place:${camera.placeId}`] ?? null)
          : building
            ? positionFor(building)
            : null;
      if (position) {
        requestCamera(position, camera.reason, context);
      } else {
        pendingDriverCameraRef.current = { command: camera, context };
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
        pathname: () => browserWindow?.location.pathname ?? "/campus-map",
        search: () => browserWindow?.location.search ?? driverInitialSearch,
      },
      camera: executeDriverCamera,
      focus: (focus, context) => {
        queueMicrotask(() => {
          window.requestAnimationFrame(() => {
            if (!context.isCurrent()) return;
            const focusSceneTarget = (target: CampusMapFocusTarget) => {
              if (target.kind === "contribution-form") {
                document
                  .querySelector<HTMLElement>("#campus-map-panel-title")
                  ?.focus({ preventScroll: true });
              } else if (target.kind === "heading") {
                panelTitleRef.current?.focus({ preventScroll: true });
              } else if (target.kind === "results") {
                if (document.activeElement?.tagName !== "BUTTON") {
                  panelTitleRef.current?.focus({ preventScroll: true });
                }
              } else if (target.kind === "search-input") {
                searchInputRef.current?.focus({ preventScroll: true });
              } else if (target.kind === "map") {
                mapElementRef.current?.focus({ preventScroll: true });
              }
            };

            if (focus.kind === "result") {
              const resultCandidates = Array.from(
                document.querySelectorAll<HTMLElement>(
                  "[data-search-result], [data-return-result]",
                ),
              ).filter(
                (candidate) =>
                  candidate.dataset.searchResult === focus.resultId ||
                  candidate.dataset.returnResult === focus.resultId,
              );
              const visibleResult = resultCandidates.find(
                (candidate) => candidate.getClientRects().length > 0,
              );
              const result = visibleResult ?? resultCandidates[0];
              if (result) {
                result.focus({ preventScroll: true });
              } else {
                focusSceneTarget(focus.fallback);
              }
            } else if (focus.kind === "category-filter") {
              const filter = Array.from(
                document.querySelectorAll<HTMLElement>(
                  "[data-category-filter]",
                ),
              ).find(
                (candidate) =>
                  candidate.dataset.categoryFilter === focus.category,
              );
              if (filter) {
                filter.focus({ preventScroll: true });
              } else {
                focusSceneTarget(focus.fallback);
              }
            } else if (focus.kind === "edit-field") {
              const target = Array.from(
                document.querySelectorAll<HTMLElement>("[data-edit-field]"),
              ).find((element) => element.dataset.editField === focus.field);
              target?.focus({ preventScroll: true });
              target?.scrollIntoView?.({ block: "center", inline: "nearest" });
            } else {
              focusSceneTarget(focus);
            }
          });
        });
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
      sceneCatalog,
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
  const activeProviderTargetError =
    driverSnapshot.transientPanel?.kind === "provider-target-unavailable"
      ? driverSnapshot.transientPanel
      : null;
  const session = driverSnapshot.session;
  const selectedProviderPoi =
    session.mode === "browse" && session.scene.kind === "provider-poi"
      ? session.scene
      : null;
  const visiblePublishNotice =
    publishNotice &&
    session.mode === "browse" &&
    session.scene.kind === "place" &&
    session.scene.placeId === publishNotice.placeId
      ? publishNotice
      : null;
  const state = projectedState(session, driverSnapshot.returnTo, sceneCatalog);
  const panelSnap =
    activeProviderTargetError?.snap ??
    (selectedProviderPoi ? "peek" : state.sheet.snap);
  const selectedFacility = facilityFor(state.selection, places);
  const selectedAccessLabel = selectedFacility
    ? summarizeCampusMapAccess(selectedFacility.access)
    : null;
  const selectedBuilding = selectedFacility?.buildingId
    ? (buildings.find(
        (building) => building.buildingId === selectedFacility.buildingId,
      ) ?? null)
    : buildingFor(state.selection, buildings);
  const activeAmenity = knownAmenity(state.mapFilter.category);
  const selectedMarkerPlaceId = activeAmenity
    ? null
    : (selectedFacility?.placeId ?? null);
  const visibleMarkerAmenity =
    activeAmenity ??
    (selectedMarkerPlaceId ? (selectedFacility?.pinType ?? null) : null);
  const markerScope = activeAmenity
    ? `category:${activeAmenity}`
    : selectedMarkerPlaceId
      ? `place:${selectedMarkerPlaceId}`
      : null;
  const selectedFacilityBackLabel = selectedFacility
    ? facilityBackLabel(driverSnapshot.returnTo)
    : "返回地图";

  const dispatch = useCallback(
    (intent: CampusMapDriverIntent) => {
      setPublishNotice(null);
      return driver.dispatch(intent);
    },
    [driver],
  );
  const publishReceiptConsumer = useMemo(
    () =>
      new CampusMapPublishReceiptConsumer({
        identifyActor: identifyCampusMapEditPublisher,
        readActorBinding: readBrowserCampusMapPublishActor,
        bindActor: bindBrowserCampusMapPublishActor,
        reconcile: ({ command, actorId }) =>
          reconcileCampusMapEditPublish(command, actorId),
        retry: publishCampusMapEdit,
        refresh: async ({ placeId }) => {
          const result = await projectionStore.refresh({ placeId });
          onPublishedProjectionRefreshed?.(result);
          return result;
        },
        applyProjectionAndOpen: ({ placeId, intentToken, operation }) => {
          const projection = projectionStore.getSnapshot().projection;
          if (!projection.places.some((place) => place.placeId === placeId)) {
            return { status: "missing-target" };
          }
          const result = driver.openPublishedPlace(placeId, intentToken);
          if (result.status === "applied") {
            setPublishNotice({
              placeId,
              message: publishedPlaceNotice(projection, placeId, operation),
            });
          }
          return result;
        },
        isCanonicalPlaceOpen: (placeId) => {
          const current = driver.getSnapshot().session;
          return (
            current.mode === "browse" &&
            current.scene.kind === "place" &&
            current.scene.placeId === placeId
          );
        },
        readReceiptState: readBrowserCampusMapPublishReceiptState,
        writeReceiptState: writeBrowserCampusMapPublishReceiptState,
        withLock: withBrowserCampusMapReceiptLock,
        timeoutMs: 1_500,
      }),
    [driver, onPublishedProjectionRefreshed, projectionStore],
  );
  const recoverPublish = useCallback(
    (
      command: CampusMapPublishCommand,
      transport?: (actorId: string) => ReturnType<typeof publishCampusMapEdit>,
      onIdentityVerified?: () => void,
    ) => {
      return publishReceiptConsumer.consume({
        command,
        intentToken: driver.getIntentToken(),
        transport,
        onIdentityVerified,
      });
    },
    [driver, publishReceiptConsumer],
  );

  const {
    session: editSession,
    dispatchEvent: dispatchEditEvent,
    startFacilityAdd,
    startEdit: startCanonicalEdit,
    announcement: editAnnouncement,
    restoreNotice: editRestoreNotice,
  } = useCampusMapEditSessionOwner({
    driver,
    dispatch,
    recoverPublish,
  });
  const readVisiblePlacementAnchor = useCallback((offset: Position) => {
    const map = mapRef.current;
    const mapElement = mapElementRef.current;
    const AMap = typeof window === "undefined" ? undefined : window.AMap;
    if (!map || !mapElement || !AMap) return null;
    const providerPosition = placementAnchorLngLat(map, mapElement, AMap);
    const providerPositionTuple = [
      providerPosition.lng,
      providerPosition.lat,
    ] as Position;
    return {
      providerPosition: providerPositionTuple,
      wgs84Position: providerPositionToWgs84(providerPositionTuple, offset),
    };
  }, []);
  const startGlobalFacilityAdd = useCallback(() => {
    cancelPendingUserLocation();
    startFacilityAdd({ kind: "global" });
  }, [cancelPendingUserLocation, startFacilityAdd]);
  const startFacilityForSelectedBuilding = useCallback(() => {
    if (!selectedBuilding) return;
    cancelPendingUserLocation();
    const requestedFloorId =
      selectedFacility?.floorId ?? state.buildingContext.floorId;
    const selectedFloor = selectedBuilding.floors.find(
      (floor) => floor.floorId === requestedFloorId,
    );
    startFacilityAdd({
      kind: "building",
      locationDisplay: {
        buildingId: selectedBuilding.buildingId,
        buildingName: selectedBuilding.name,
        floorId: selectedFloor?.floorId ?? null,
        floorLabel: selectedFloor?.displayLabel ?? null,
      },
    });
  }, [
    cancelPendingUserLocation,
    selectedBuilding,
    selectedFacility?.floorId,
    startFacilityAdd,
    state.buildingContext.floorId,
  ]);
  const startFacilityForActiveCategory = useCallback(() => {
    if (!activeAmenity) return;
    cancelPendingUserLocation();
    startFacilityAdd({ kind: "global", pinType: activeAmenity });
  }, [activeAmenity, cancelPendingUserLocation, startFacilityAdd]);
  useEffect(() => {
    if (!publishNotice) return;
    const timeout = window.setTimeout(() => setPublishNotice(null), 4_000);
    return () => window.clearTimeout(timeout);
  }, [publishNotice]);
  const editSessionStatus = editSession?.status ?? null;
  const editSessionIdempotencyKey = editSession?.draft.idempotencyKey ?? null;
  const placementCandidate =
    editSession?.status === "placing"
      ? editSession.draft.placementCandidate
      : null;
  const placementPending = Boolean(
    editSession?.status === "placing" &&
    (coordinateVersion === 0 ||
      mapMoving ||
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
    if (coordinateVersion === 0) return;
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
  }, [
    centerPosition,
    coordinateVersion,
    dispatchEditEvent,
    editSession,
    mapCenterRevision,
  ]);

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
    (facility: Place) => {
      cancelPendingUserLocation();
      void startCanonicalEdit(facility.placeId);
    },
    [cancelPendingUserLocation, startCanonicalEdit],
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
        buildingId: building.buildingId,
        source,
      });
    },
    [dispatch],
  );

  const selectFacility = useCallback(
    (facility: Place, source: "category" | "building" | "search") => {
      dispatch({
        type: "OPEN_PLACE",
        placeId: facility.placeId,
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
          serviceHost: string;
        };
      })
      .then((value) => {
        if (cancelled) return;
        if (value.configured) {
          window._AMapSecurityConfig = { serviceHost: value.serviceHost };
          setConfig({
            status: "ready",
            key: value.key,
            serviceHost: value.serviceHost,
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
      cancelPendingUserLocation();
      setPublishNotice(null);
      const restored = driver.restore(window.location.search, event.state);
      if (editSession && !restored.preservedReplacementTask) {
        dispatchEditEvent({ type: "REQUEST_CLOSE" });
      } else if (!editSession && restored.snapshot.session.mode === "task") {
        dispatch({ type: "CANCEL_TASK" });
      }
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [
    cancelPendingUserLocation,
    dispatch,
    dispatchEditEvent,
    driver,
    editSession,
  ]);

  const closeSelection = useCallback(() => {
    cancelPendingUserLocation();
    dispatch({ type: "DISMISS" });
  }, [cancelPendingUserLocation, dispatch]);

  const navigateEntityBack = useCallback(() => {
    cancelPendingUserLocation();
    dispatch({ type: "NAVIGATE_BACK" });
  }, [cancelPendingUserLocation, dispatch]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (editSession) {
        event.preventDefault();
        dispatchEditEvent({ type: "REQUEST_CLOSE" });
        return;
      }
      const currentSnapshot = driver.getSnapshot();
      if (currentSnapshot.transientPanel) {
        event.preventDefault();
        closeSelection();
        return;
      }
      const current = currentSnapshot.session;
      if (current.mode === "browse" && current.scene.kind !== "map") {
        closeSelection();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [closeSelection, dispatchEditEvent, driver, editSession]);

  const initialiseMap = useCallback(() => {
    if (!window.AMap || mapRef.current) return;
    setMapLoadError(null);
    const AMap = window.AMap;
    const map = new AMap.Map("amap-campus-canvas", {
      center: CAMPUS_CENTER,
      zoom: 17.2,
      zooms: [14, 20],
      viewMode: "2D",
      rotateEnable: false,
      pitchEnable: false,
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
            providerPositionToWgs84(
              [event.lnglat.lng, event.lnglat.lat],
              offset,
            ),
            "provider-placement",
          );
          return;
        }
        const input = {
          providerObjectId: event.id ?? null,
          name: event.name?.trim() || "高德地图地点",
          position: [event.lnglat.lng, event.lnglat.lat] as const,
        };
        const providerIntent = ++providerTargetIntentRef.current;
        dispatch({ type: "DISMISS_TRANSIENT_PANEL" });
        const driverToken = driver.getSnapshot().transitionToken;
        void providerPoiCardResolverRef.current
          .resolveLatest(input)
          .then(async (result) => {
            const stillOwnsIntent = () =>
              providerTargetIntentRef.current === providerIntent &&
              driver.getSnapshot().transitionToken === driverToken;
            if (
              result.status === "superseded" ||
              !result.card ||
              !stillOwnsIntent()
            )
              return;
            if (result.card.kind === "transient") {
              dispatch({
                type: "OPEN_PROVIDER_POI",
                providerPoiId: result.card.externalId,
                name: result.card.title,
                position: result.card.position,
              });
              return;
            }
            const target = result.card.selectionTarget;
            let canonicalTarget = findMappedProviderTarget(
              projectionStore.getSnapshot().projection,
              target,
            );
            if (!canonicalTarget) {
              const refresh = await projectionStore.refresh(
                target.kind === "place"
                  ? { placeId: target.placeId }
                  : undefined,
              );
              if (!stillOwnsIntent()) return;
              if (refresh.status === "applied") {
                canonicalTarget = findMappedProviderTarget(
                  projectionStore.getSnapshot().projection,
                  target,
                );
              }
            }
            if (!canonicalTarget) {
              dispatch({
                type: "REPORT_PROVIDER_TARGET_UNAVAILABLE",
                title: result.card.title,
                intentToken: driverToken,
              });
              return;
            }
            if (canonicalTarget.kind === "building") {
              selectBuilding(canonicalTarget.building);
            } else {
              selectFacility(canonicalTarget.facility, "search");
            }
          });
      });
    });
    map.on("click", (event) => {
      interactionAdapterRef.current.dispatchMapClick(() => {
        if (event.originEvent?.target?.closest?.("[data-cupedia-marker]"))
          return;
        if (editSessionActiveRef.current) return;
        closeSelection();
      });
    });
    map.on("dragstart", () => {
      interactionAdapterRef.current.reset();
      mapDraggingRef.current = true;
      userGestureAwaitingMoveEndRef.current = true;
      exactProviderPlaceRef.current = null;
      driver.interruptCamera();
    });
    map.on("dragend", () => {
      mapDraggingRef.current = false;
    });
    map.on("movestart", () => setMapMoving(true));
    map.on("moveend", () => {
      const center = editSessionPlacingRef.current
        ? placementAnchorLngLat(map, map.getContainer(), AMap)
        : map.getCenter();
      const offset = amapOffsetRef.current;
      const position = providerPositionToWgs84(
        [center.lng, center.lat],
        offset,
      );
      if (mapDraggingRef.current) return;
      if (userGestureAwaitingMoveEndRef.current) {
        userGestureAwaitingMoveEndRef.current = false;
        setMapMoving(false);
        setCenterPosition(position);
        setProviderCenterPosition([center.lng, center.lat]);
        setMapCenterRevision((revision) => revision + 1);
        return;
      }
      const pendingPlacementCamera = pendingPlacementCameraRef.current;
      if (pendingPlacementCamera) {
        if (
          pendingPlacementCamera.token !== placementCameraTokenRef.current ||
          !pendingPlacementCamera.context.isCurrent()
        ) {
          pendingPlacementCameraRef.current = null;
          setMapMoving(false);
          return;
        }
        if (samePlacementPosition(position, pendingPlacementCamera.position)) {
          pendingPlacementCameraRef.current = null;
          setMapMoving(false);
          setCenterPosition(pendingPlacementCamera.position);
          setProviderCenterPosition([
            pendingPlacementCamera.position[0] + offset[0],
            pendingPlacementCamera.position[1] + offset[1],
          ]);
          setMapCenterRevision((revision) => revision + 1);
          lastSettledPlacementCameraTargetRef.current =
            pendingPlacementCamera.position;
          return;
        }
        if (
          retiredPlacementCameraTargetsRef.current.some((target) =>
            samePlacementPosition(position, target),
          )
        ) {
          return;
        }
        return;
      }
      if (
        retiredPlacementCameraTargetsRef.current.some((target) =>
          samePlacementPosition(position, target),
        )
      ) {
        return;
      }
      setMapMoving(false);
      setCenterPosition(position);
      setProviderCenterPosition([center.lng, center.lat]);
      setMapCenterRevision((revision) => revision + 1);
    });
    const cancelForUserZoom = () => {
      driver.interruptCamera();
    };
    const container = map.getContainer();
    const beginPointerGesture = () => {
      interactionAdapterRef.current.beginPointerGesture();
    };
    const endPointerGesture = () => {
      interactionAdapterRef.current.endPointerGesture();
    };
    const cancelPointerGesture = () => {
      interactionAdapterRef.current.reset();
    };
    container.addEventListener("pointerdown", beginPointerGesture, {
      capture: true,
    });
    window.addEventListener("pointerup", endPointerGesture, {
      capture: true,
    });
    window.addEventListener("pointercancel", cancelPointerGesture, {
      capture: true,
    });
    window.addEventListener("blur", cancelPointerGesture);
    container.addEventListener("wheel", cancelForUserZoom, { passive: true });
    container.addEventListener("touchstart", cancelForUserZoom, {
      passive: true,
    });
    pointerGestureCleanupRef.current = () => {
      container.removeEventListener("pointerdown", beginPointerGesture, {
        capture: true,
      });
      window.removeEventListener("pointerup", endPointerGesture, {
        capture: true,
      });
      window.removeEventListener("pointercancel", cancelPointerGesture, {
        capture: true,
      });
      window.removeEventListener("blur", cancelPointerGesture);
      container.removeEventListener("wheel", cancelForUserZoom);
      container.removeEventListener("touchstart", cancelForUserZoom);
      interactionAdapterRef.current.reset();
    };
  }, [
    closeSelection,
    dispatch,
    driver,
    projectionStore,
    selectBuilding,
    selectFacility,
  ]);

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
    const AMap = window.AMap;
    const map = mapRef.current;
    if (!mapReady || !AMap || !map) return;
    const transitionToken = driver.getSnapshot().transitionToken;
    void coordinateProjectorRef.current
      .projectLatest(browseProjection, {
        convertFrom: (positions, source, callback) =>
          AMap.convertFrom(positions, source, callback),
      })
      .then((projection) => {
        if (projection.status === "superseded" || mapRef.current !== map) {
          return;
        }
        if (projection.status === "error") {
          amapPositionsRef.current = {};
          setCoordinateVersion(0);
          setMapLoadError("coordinates");
          return;
        }
        const converted = {
          ...projection.positions,
          __campus: projection.center,
        };
        const projectionStillOwnsScene =
          driver.getSnapshot().transitionToken === transitionToken;
        amapOffsetRef.current = projection.offset;
        amapPositionsRef.current = converted;
        setAmapOffset(projection.offset);
        if (editSessionPlacingRef.current) {
          const anchor = readVisiblePlacementAnchor(projection.offset);
          if (anchor) {
            setCenterPosition(anchor.wgs84Position);
            setProviderCenterPosition(anchor.providerPosition);
          }
        } else if (projectionStillOwnsScene) {
          setCenterPosition(CAMPUS_CENTER);
          setProviderCenterPosition(projection.center);
        }
        setCoordinateVersion((version) => version + 1);
        setMapLoadError(null);
        const shouldSetInitialCenter = !didSetInitialCenterRef.current;
        if (shouldSetInitialCenter) didSetInitialCenterRef.current = true;
        const pendingCamera = pendingDriverCameraRef.current;
        if (pendingCamera) {
          executeDriverCamera(pendingCamera.command, pendingCamera.context);
        } else if (
          shouldSetInitialCenter &&
          projectionStillOwnsScene &&
          !editSessionActiveRef.current
        ) {
          map.setZoomAndCenter(17.2, projection.center, true, 0);
        }
      });
  }, [
    browseProjection,
    driver,
    executeDriverCamera,
    mapReady,
    readVisiblePlacementAnchor,
  ]);

  useEffect(() => {
    if (userLocation.status !== "located") return;
    const map = mapRef.current;
    const AMap = window.AMap;
    if (!mapReady || !map || !AMap || coordinateVersion === 0) return;
    const offset = amapOffsetRef.current;
    const marker = new AMap.Marker({
      position: new AMap.LngLat(
        userLocation.position.longitude + offset[0],
        userLocation.position.latitude + offset[1],
      ),
      content:
        '<div data-campus-map-user-location aria-hidden="true" style="width:20px;height:20px;border:4px solid white;border-radius:9999px;background:#176346;box-shadow:0 2px 8px rgba(23,33,28,.35)"></div>',
      zIndex: 220,
    });
    marker.setzIndex(220);
    map.add(marker);
    return () => map.remove([marker]);
  }, [coordinateVersion, mapReady, userLocation]);

  useEffect(() => {
    if (
      !mapReady ||
      clusterStatus !== "ready" ||
      coordinateVersion === 0 ||
      !window.AMap ||
      !mapRef.current
    )
      return;
    const synced = facilityMarkerRuntimeRef.current.sync({
      map: mapRef.current,
      provider: window.AMap,
      projection: browseProjection,
      providerPositions: amapPositionsRef.current,
      markerScope,
      visibleAmenity: visibleMarkerAmenity,
      selectedPlaceId: selectedMarkerPlaceId,
      claimProviderTarget: (action) => {
        interactionAdapterRef.current.dispatchProviderTarget(action);
      },
      selectBuilding: (buildingId) => {
        const building = buildingsRef.current.find(
          (candidate) => candidate.buildingId === buildingId,
        );
        if (building) selectBuilding(building);
      },
      selectPlace: (placeId) => {
        const place = facilitiesRef.current.find(
          (candidate) => candidate.placeId === placeId,
        );
        if (place) selectFacility(place, "category");
      },
      fitCluster: (positions) => dispatch({ type: "FIT_CLUSTER", positions }),
    });
    if (!synced) {
      queueMicrotask(() => setClusterStatus("error"));
    }
  }, [
    browseProjection,
    buildings,
    clusterStatus,
    coordinateVersion,
    dispatch,
    mapReady,
    markerScope,
    selectedMarkerPlaceId,
    selectBuilding,
    selectFacility,
    visibleMarkerAmenity,
  ]);

  useEffect(() => {
    return facilityMarkerRuntimeRef.current.syncSelection(
      mapElementRef.current,
      browseProjection,
      selectedFacility?.placeId ?? null,
    );
  }, [browseProjection, selectedFacility]);

  useEffect(() => {
    const mapElement = mapElementRef.current;
    const panel = panelRef.current;
    if (
      !mapElement ||
      !panel ||
      (!selectedBuilding &&
        !selectedFacility &&
        !selectedProviderPoi &&
        !editSession)
    )
      return;
    const observer = new ResizeObserver(() => {
      driver.updateSheetGeometry(panel.hidden ? null : rect(panel));
    });
    observer.observe(mapElement);
    observer.observe(panel);
    return () => observer.disconnect();
  }, [
    driver,
    editSession,
    selectedBuilding,
    selectedFacility,
    selectedProviderPoi,
  ]);

  useEffect(
    () => () => {
      userLocationRequestRef.current += 1;
      pointerGestureCleanupRef.current?.();
      pointerGestureCleanupRef.current = null;
      facilityMarkerRuntimeRef.current.destroy();
      providerPoiCardResolverRef.current.invalidate();
      coordinateProjectorRef.current.invalidate();
      mapRef.current?.destroy();
      mapRef.current = null;
    },
    [],
  );

  const searchResults = useMemo(() => {
    if (!state.mapFilter.query.trim()) return [];
    const results = queryCampusMapBrowse(browseProjection, {
      query: state.mapFilter.query,
      placeMatch: "name",
    });
    return [
      ...results.buildings.map((building) => ({
        kind: "building" as const,
        building,
      })),
      ...results.places.map((facility) => ({
        kind: "place" as const,
        facility,
        building:
          buildings.find(
            (building) => building.buildingId === facility.buildingId,
          ) ?? null,
      })),
    ];
  }, [browseProjection, buildings, state.mapFilter.query]);

  const buildingOverviewDirectory = selectedBuilding
    ? projectCampusMapBuildingDirectory(
        browseSnapshot,
        selectedBuilding.buildingId,
        null,
      )
    : null;
  const buildingDirectory = selectedBuilding
    ? state.buildingContext.floorId
      ? projectCampusMapBuildingDirectory(
          browseSnapshot,
          selectedBuilding.buildingId,
          state.buildingContext.floorId,
        )
      : buildingOverviewDirectory
    : null;
  const buildingFacilitySummary = summarizeFacilityTypes(
    buildingOverviewDirectory?.places ?? [],
  );
  const buildingFacilities = buildingDirectory?.places ?? [];
  const buildingPreviewFacility =
    buildingOverviewDirectory?.status === "ready"
      ? (buildingOverviewDirectory.places[0] ?? null)
      : null;
  const buildingFacilityGroups = selectedBuilding
    ? groupBuildingFacilities(selectedBuilding, buildingFacilities)
    : [];
  const categoryResults = activeAmenity
    ? queryCampusMapBrowse(browseProjection, { pinType: activeAmenity })
    : null;
  const categoryDistanceByPlaceId = useMemo(() => {
    if (!activeAmenity || userLocation.status !== "located") {
      return new Map<
        string,
        {
          distanceMeters: number;
          distanceEvidence: "place-point" | "building-anchor";
        }
      >();
    }
    return new Map(
      queryCampusMapNearby(browseProjection, {
        ...userLocation.position,
        pinType: activeAmenity,
      }).places.map(({ place, distanceMeters, distanceEvidence }) => [
        place.placeId,
        { distanceMeters, distanceEvidence },
      ]),
    );
  }, [activeAmenity, browseProjection, userLocation]);
  const categoryFacilities = useMemo(() => {
    const places = categoryResults?.places ?? [];
    if (!categoryDistanceByPlaceId.size) return places;
    return [...places].sort((first, second) => {
      const firstDistance = categoryDistanceByPlaceId.get(first.placeId);
      const secondDistance = categoryDistanceByPlaceId.get(second.placeId);
      if (firstDistance === undefined)
        return secondDistance === undefined ? 0 : 1;
      if (secondDistance === undefined) return -1;
      return firstDistance.distanceMeters - secondDistance.distanceMeters;
    });
  }, [categoryDistanceByPlaceId, categoryResults]);
  const visibleCategoryFacilities =
    state.sheet.snap === "full"
      ? categoryFacilities
      : categoryFacilities.slice(0, CAMPUS_MAP_CATEGORY_PEEK_RESULT_LIMIT);
  const hasMoreCategoryFacilities =
    categoryFacilities.length > CAMPUS_MAP_CATEGORY_PEEK_RESULT_LIMIT;
  const activeCategoryStyle = activeAmenity
    ? amenityStyle(activeAmenity)
    : null;
  const selectedBuildingHasFacilities = Boolean(
    selectedBuilding &&
    !selectedFacility &&
    buildingOverviewDirectory?.status === "ready" &&
    buildingOverviewDirectory.places.length > 0,
  );
  const canExpandBrowseCard = Boolean(
    !selectedFacility && (selectedBuildingHasFacilities || activeCategoryStyle),
  );
  const chromeHidden =
    Boolean(editSession) ||
    (state.sheet.snap === "full" && canExpandBrowseCard);
  const selectedBuildingIsEmpty = Boolean(
    selectedBuilding &&
    !selectedFacility &&
    buildingOverviewDirectory?.status === "empty",
  );
  const selectedBuildingCardIsStatic = Boolean(
    selectedBuilding && !selectedFacility && !selectedBuildingHasFacilities,
  );
  const selectedBuildingFloor = selectedBuilding?.floors.find(
    (floor) => floor.floorId === state.buildingContext.floorId,
  );
  const selectedBuildingDisplay = selectedBuilding
    ? campusMapBuildingDisplayFor(buildingDisplay, selectedBuilding.buildingId)
    : null;
  const selectedBuildingDisplayName =
    selectedBuildingDisplay?.label ?? selectedBuilding?.name ?? null;
  const selectedBuildingQualifier = selectedBuildingDisplay?.qualifier ?? null;
  const visibleSelectedBuildingQualifier =
    selectedBuildingQualifier &&
    selectedBuildingQualifier !== selectedBuilding?.englishName?.trim()
      ? selectedBuildingQualifier
      : null;
  const buildingAddAccessibleName = selectedBuilding
    ? selectedBuildingIsEmpty
      ? `在${selectedBuildingDisplayName}新增第一处设施`
      : selectedBuildingFloor
        ? `在${selectedBuildingDisplayName}的 ${selectedBuildingFloor.displayLabel} 新增设施`
        : `在${selectedBuildingDisplayName}新增设施`
    : "新增设施";
  const panelHidden = Boolean(
    !editSession &&
    !activeProviderTargetError &&
    !selectedProviderPoi &&
    (state.selection.kind === "external" ||
      (state.selection.kind === "none" &&
        !state.mapFilter.category &&
        !selectedFacility)),
  );
  let mobilePanelLayout: CampusMapMobilePanelLayout = { kind: "default" };
  if (editSession?.status === "placing") {
    mobilePanelLayout = { kind: "placing" };
  } else if (editSession) {
    mobilePanelLayout = { kind: "edit" };
  } else if (panelSnap === "full" && canExpandBrowseCard) {
    mobilePanelLayout = activeCategoryStyle
      ? {
          kind: "expanded",
          content: "category",
          resultCount: categoryFacilities.length,
        }
      : {
          kind: "expanded",
          content: "building",
          resultCount: buildingFacilities.length,
          groupCount: buildingFacilityGroups.length,
        };
  } else if (activeProviderTargetError) {
    mobilePanelLayout = { kind: "provider-error" };
  } else if (selectedProviderPoi) {
    mobilePanelLayout = { kind: "provider-poi" };
  } else if (selectedFacility) {
    mobilePanelLayout = { kind: "place" };
  } else if (selectedBuildingIsEmpty) {
    mobilePanelLayout = { kind: "empty-building" };
  } else if (selectedBuilding) {
    mobilePanelLayout = { kind: "building" };
  } else if (activeAmenity) {
    mobilePanelLayout = {
      kind: "category",
      resultCount: categoryFacilities.length,
    };
  }
  const mobilePanelHeight = campusMapMobilePanelHeight(mobilePanelLayout);
  const mobileMapOcclusion = panelHidden
    ? "0px"
    : "var(--campus-map-panel-height)";
  const desktopSidePanelVisible = Boolean(
    editSession ||
    activeProviderTargetError ||
    selectedProviderPoi ||
    selectedBuilding ||
    selectedFacility ||
    activeAmenity,
  );

  return (
    <main
      className="relative h-dvh min-h-0 w-full min-w-0 flex-1 overflow-hidden bg-[#dce7e9] text-[#17211c]"
      style={
        {
          "--campus-map-placement-anchor-y": `${MOBILE_PLACEMENT_ANCHOR_RATIO * 100}dvh`,
          "--campus-map-peek-height": "min(248px, 36dvh)",
          "--campus-map-panel-height": mobilePanelHeight,
          "--campus-map-safe-area-bottom": "env(safe-area-inset-bottom)",
        } as CSSProperties
      }
    >
      {visiblePublishNotice ? (
        <div
          role="status"
          className="pointer-events-none absolute bottom-[calc(var(--campus-map-panel-height)+12px)] left-1/2 z-40 flex min-h-11 max-w-[calc(100%-24px)] -translate-x-1/2 items-center gap-2 rounded-xl bg-[#174b38] px-4 py-2.5 text-sm font-semibold text-white shadow-[0_8px_24px_rgba(23,75,56,.28)] motion-reduce:transition-none md:top-4 md:bottom-auto md:left-4 md:translate-x-0"
        >
          <CheckCircle2Icon aria-hidden="true" className="size-5 shrink-0" />
          <span>{visiblePublishNotice.message}</span>
        </div>
      ) : null}
      <p className="sr-only" aria-live="polite">
        {visiblePublishNotice ? null : editAnnouncement || editRestoreNotice}
      </p>
      <style>{`@media(max-width:767px){.amap-controls,.amap-controlbar{display:none!important}.amap-logo,.amap-copyright{bottom:calc(${mobileMapOcclusion} + 4px)!important}}`}</style>
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

      {(config.status === "missing" || mapLoadError) &&
      (!editSession || editSession.status === "placing") ? (
        <div className="pointer-events-none absolute inset-x-0 top-[124px] z-40 flex justify-center px-3 md:top-[132px]">
          <div
            role="status"
            className="pointer-events-auto max-w-md rounded-2xl border border-black/10 bg-white/95 p-4 shadow-xl backdrop-blur"
          >
            <h2 className="text-base font-semibold">地图暂时不可用</h2>
            <p className="mt-1 text-sm leading-6 text-neutral-600">
              仍可搜索和查看校园地点卡片。请稍后重新加载地图。
            </p>
            {mapLoadError ? (
              <button
                type="button"
                className="mt-3 min-h-11 rounded-xl bg-[#174b38] px-4 text-sm font-semibold text-white"
                onClick={retryMapLoad}
              >
                重新加载地图
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      <header
        aria-hidden={editSession ? true : undefined}
        inert={editSession ? true : undefined}
        className={cn(
          "pointer-events-none absolute inset-x-0 top-0 z-30 flex items-start gap-2 p-3 transition-opacity motion-reduce:transition-none md:p-4",
          desktopSidePanelVisible && "md:right-[422px]",
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
            <span className="sr-only">搜索建筑或地点</span>
            <input
              ref={searchInputRef}
              name="campus-map-search"
              autoComplete="off"
              value={queryDraft}
              onChange={(event) => {
                const query = event.currentTarget.value;
                setQueryDraft(query);
                dispatch({ type: "SEARCH", query });
              }}
              className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-neutral-500"
              placeholder="搜索建筑或地点…"
            />
            {queryDraft ? (
              <button
                type="button"
                aria-label="清除搜索"
                className="grid size-11 place-items-center rounded-full hover:bg-neutral-100"
                onClick={() => {
                  setQueryDraft("");
                  dispatch({ type: "SEARCH", query: "" });
                }}
              >
                <XIcon aria-hidden="true" className="size-4" />
              </button>
            ) : null}
          </label>
          {state.mapFilter.query && state.selection.kind === "none" ? (
            <div className="mt-2 overflow-hidden rounded-xl bg-white py-1 shadow-[0_8px_28px_rgba(23,33,28,.22)]">
              {searchResults.length ? (
                searchResults.map((result) => {
                  const id =
                    result.kind === "building"
                      ? result.building.buildingId
                      : result.facility.placeId;
                  const resultStyle =
                    result.kind === "place"
                      ? amenityStyle(result.facility.pinType)
                      : null;
                  const ResultIcon = resultStyle?.icon ?? Building2Icon;
                  const resultBuilding = result.building;
                  const resultBuildingDisplay = resultBuilding
                    ? campusMapBuildingDisplayFor(
                        buildingDisplay,
                        resultBuilding.buildingId,
                      )
                    : null;
                  const buildingQualifier =
                    result.kind === "building"
                      ? (resultBuildingDisplay?.qualifier ?? null)
                      : null;
                  const visibleBuildingQualifier =
                    result.kind === "building" &&
                    buildingQualifier !== result.building.englishName?.trim()
                      ? buildingQualifier
                      : null;
                  const resultBuildingLabel =
                    result.kind === "place" && resultBuilding
                      ? (resultBuildingDisplay?.label ?? resultBuilding.name)
                      : null;
                  const subtitle =
                    result.kind === "building"
                      ? result.building.englishName
                      : metadataLabel(
                          resultBuildingLabel,
                          placeLocationLabel(result.facility),
                          summarizeCampusMapAccess(result.facility.access),
                        );
                  const content = (
                    <>
                      <span
                        className="grid size-9 shrink-0 place-items-center rounded-lg bg-[#e4f1eb] text-[#176346]"
                        style={
                          resultStyle
                            ? { background: resultStyle.color, color: "white" }
                            : undefined
                        }
                      >
                        <ResultIcon aria-hidden="true" className="size-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <strong className="flex min-w-0 items-center gap-1.5 text-sm">
                          <span className="truncate">
                            {result.kind === "building"
                              ? result.building.name
                              : result.facility.name}
                          </span>
                          {visibleBuildingQualifier ? (
                            <span className="shrink-0 rounded bg-neutral-100 px-1.5 py-0.5 text-[11px] font-medium text-neutral-600">
                              {visibleBuildingQualifier}
                            </span>
                          ) : null}
                        </strong>
                        {subtitle ? (
                          <span className="block truncate text-xs text-neutral-500">
                            {subtitle}
                          </span>
                        ) : null}
                      </span>
                    </>
                  );
                  return (
                    <button
                      key={id}
                      data-search-result={id}
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
                      {content}
                    </button>
                  );
                })
              ) : (
                <p className="px-4 py-4 text-sm text-neutral-600">
                  没有找到建筑或地点
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
          "pointer-events-none absolute inset-x-0 top-[68px] z-20 overflow-hidden px-3 transition-opacity motion-reduce:transition-none md:top-[76px] md:flex md:justify-center",
          desktopSidePanelVisible && "md:right-[422px]",
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
                data-category-filter={category.id}
                aria-pressed={active}
                className={cn(
                  "flex h-11 shrink-0 items-center gap-1.5 rounded-xl border px-3 text-[13px] font-medium shadow-[0_2px_10px_rgba(23,33,28,.14)] transition-[background-color,border-color,color,transform] active:scale-[0.98] md:gap-2 md:text-sm motion-reduce:transform-none",
                  active
                    ? "border-[#176346] bg-[#176346] text-white"
                    : "border-black/10 bg-white text-neutral-700 hover:bg-neutral-50",
                )}
                onClick={() => {
                  if (
                    session.mode === "browse" &&
                    session.scene.kind === "category-results" &&
                    session.scene.category === category.id
                  ) {
                    closeSelection();
                  } else {
                    dispatch({ type: "OPEN_CATEGORY", category: category.id });
                  }
                }}
              >
                <Icon
                  aria-hidden="true"
                  className="size-4"
                  style={active ? undefined : { color: category.color }}
                />
                {category.label}
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
          "absolute top-[124px] right-3 z-20 flex flex-col items-end gap-2 md:top-auto md:right-auto md:bottom-6 md:left-4 md:items-start",
          editSession && "invisible pointer-events-none opacity-0",
        )}
      >
        {userLocation.status !== "idle" ? (
          <div
            role={userLocation.status === "error" ? "alert" : "status"}
            aria-live="polite"
            className="pointer-events-auto max-w-[min(320px,calc(100vw-24px))] rounded-xl border border-black/10 bg-white p-3 text-sm shadow-[0_4px_16px_rgba(23,33,28,.18)]"
          >
            <p>{userLocationStatusText(userLocation)}</p>
            {userLocation.status === "located" ? (
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  className="min-h-11 rounded-lg border border-[#174b38] px-3 font-semibold text-[#174b38] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#176346]"
                  onClick={requestUserLocation}
                >
                  重新定位
                </button>
                <button
                  type="button"
                  className="min-h-11 rounded-lg border border-black/15 px-3 font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#176346]"
                  onClick={clearUserLocation}
                >
                  清除位置
                </button>
              </div>
            ) : userLocation.status === "error" ? (
              <button
                type="button"
                className="mt-2 min-h-11 rounded-lg border border-[#174b38] px-3 font-semibold text-[#174b38] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#176346]"
                onClick={requestUserLocation}
              >
                重试定位
              </button>
            ) : null}
          </div>
        ) : null}
        <button
          type="button"
          aria-label={
            userLocation.status === "locating" ? "正在定位…" : "使用我的位置"
          }
          disabled={userLocation.status === "locating"}
          className="pointer-events-auto grid size-11 place-items-center rounded-xl border border-black/10 bg-white shadow-[0_4px_16px_rgba(23,33,28,.18)] hover:bg-neutral-50 disabled:cursor-wait disabled:text-neutral-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#176346] focus-visible:ring-offset-2"
          onClick={requestUserLocation}
        >
          <LocateFixedIcon aria-hidden="true" className="size-5" />
        </button>
        {!selectedBuilding && !activeAmenity && !selectedProviderPoi ? (
          <button
            type="button"
            aria-label="新增设施"
            className="flex size-16 flex-col items-center justify-center gap-0.5 rounded-xl border border-black/10 bg-white text-xs font-semibold shadow-[0_4px_16px_rgba(23,33,28,.18)] hover:bg-neutral-50 active:scale-[0.98] md:h-11 md:w-auto md:flex-row md:gap-2 md:px-3 md:text-sm motion-reduce:transform-none"
            onClick={startGlobalFacilityAdd}
          >
            <PlusIcon aria-hidden="true" className="size-6 md:size-5" />
            新增设施
          </button>
        ) : null}
        <div className="hidden overflow-hidden rounded-xl border border-black/10 bg-white shadow-[0_4px_16px_rgba(23,33,28,.18)] md:block">
          <button
            type="button"
            aria-label="放大"
            className="grid size-11 place-items-center hover:bg-neutral-50"
            onClick={() => mapRef.current?.zoomIn()}
          >
            <PlusIcon aria-hidden="true" className="size-5" />
          </button>
          <button
            type="button"
            aria-label="缩小"
            className="grid size-11 place-items-center border-t border-black/10 hover:bg-neutral-50"
            onClick={() => mapRef.current?.zoomOut()}
          >
            <MinusIcon aria-hidden="true" className="size-5" />
          </button>
        </div>
      </div>

      <section
        ref={panelRef}
        hidden={panelHidden}
        role={editSession ? "dialog" : undefined}
        aria-modal={editSession ? true : undefined}
        aria-labelledby="campus-map-panel-title"
        className={cn(
          "absolute z-30 overflow-hidden overscroll-contain border-black/10 bg-white shadow-[0_12px_40px_rgba(23,33,28,.24)]",
          "h-[var(--campus-map-panel-height)]",
          editSession && editSession.status !== "placing"
            ? "inset-0 rounded-none border-0 md:inset-y-4 md:right-4 md:left-auto md:h-auto md:w-[390px] md:rounded-2xl md:border"
            : cn(
                "inset-x-0 bottom-0 rounded-t-2xl border-t md:right-4 md:left-auto md:w-[390px] md:rounded-2xl md:border",
                editSession?.status === "placing"
                  ? "max-h-[65dvh] md:inset-y-4 md:h-auto md:max-h-[calc(100dvh-32px)]"
                  : "md:top-4 md:bottom-auto md:h-auto md:max-h-[calc(100dvh-32px)]",
              ),
        )}
      >
        {!editSession &&
        !activeProviderTargetError &&
        canExpandBrowseCard &&
        !selectedBuildingIsEmpty ? (
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
        ) : editSession ? (
          <button
            type="button"
            aria-label="关闭地图编辑"
            disabled={editSession.status === "publishing"}
            className="absolute top-[max(8px,env(safe-area-inset-top))] right-3 z-10 grid size-11 place-items-center rounded-full bg-white hover:bg-neutral-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#176346] md:top-2"
            onClick={() => dispatchEditEvent({ type: "REQUEST_CLOSE" })}
          >
            <XIcon aria-hidden="true" className="size-5" />
          </button>
        ) : null}
        {activeProviderTargetError ? (
          <div
            id="campus-map-panel-content"
            role="alert"
            className="flex h-full flex-col justify-center p-5"
          >
            <h2 id="campus-map-panel-title" className="text-xl font-semibold">
              {activeProviderTargetError.title}
            </h2>
            <p className="mt-2 text-sm text-neutral-600">
              暂时无法载入地点资料
            </p>
            <button
              type="button"
              className="mt-4 min-h-11 rounded-xl border border-black/15 px-4 text-sm font-semibold"
              onClick={() => {
                cancelPendingUserLocation();
                dispatch({ type: "DISMISS_TRANSIENT_PANEL" });
              }}
            >
              关闭
            </button>
          </div>
        ) : editSession ? (
          <CampusMapEditSheet
            session={editSession}
            centerPosition={centerPosition}
            placementPending={placementPending}
            placeContext={
              editSession.status === "placing" &&
              mapMoving &&
              !(
                placeContext?.status === "resolved" &&
                placeContext.context.distanceMeters === 0 &&
                placeContext.context.address === null
              )
                ? { status: "loading" }
                : placeContext
            }
            factSchema={factSchema}
            buildings={buildings}
            buildingDirectoryStatus={browseSnapshot.status}
            onRetryBuildings={() => {
              void projectionStore.refresh();
            }}
            onEvent={dispatchEditEvent}
          />
        ) : selectedProviderPoi ? (
          <div
            id="campus-map-panel-content"
            className="flex h-full items-start gap-3 p-4 pb-[max(1rem,var(--campus-map-safe-area-bottom))] md:h-auto md:p-5"
          >
            <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-[#e7f1ec] text-[#174b38]">
              <MapPinIcon aria-hidden="true" className="size-5" />
            </span>
            <div className="min-w-0 flex-1">
              <h2
                id="campus-map-panel-title"
                ref={panelTitleRef}
                tabIndex={-1}
                className="-ml-2 line-clamp-2 break-words pl-2 text-xl font-semibold tracking-[-0.02em] focus-visible:outline-none focus-visible:shadow-[inset_3px_0_0_#176346]"
              >
                {selectedProviderPoi.name}
              </h2>
              <p className="mt-1 text-sm text-neutral-500">高德地图地点</p>
            </div>
            <button
              type="button"
              aria-label="关闭地点详情"
              className="grid size-11 shrink-0 place-items-center rounded-full hover:bg-neutral-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#176346]"
              onClick={closeSelection}
            >
              <XIcon aria-hidden="true" className="size-5" />
            </button>
          </div>
        ) : state.selection.kind === "none" &&
          state.mapFilter.category &&
          !selectedFacility &&
          activeCategoryStyle ? (
          <div
            id="campus-map-panel-content"
            className="flex h-[calc(100%-44px)] flex-col"
          >
            <div className="flex items-center border-b border-black/10 px-5 pb-3">
              <h2
                id="campus-map-panel-title"
                ref={panelTitleRef}
                tabIndex={-1}
                aria-label={activeCategoryStyle.label}
                aria-describedby="campus-map-category-count"
                className="-ml-2 min-w-0 flex-1 truncate pl-2 text-xl font-semibold focus-visible:outline-none focus-visible:shadow-[inset_3px_0_0_#176346]"
              >
                {activeCategoryStyle.label}
                <span
                  aria-hidden="true"
                  className="font-normal text-neutral-500"
                >
                  {` · ${categoryFacilities.length} 处`}
                </span>
              </h2>
              <span id="campus-map-category-count" className="sr-only">
                {categoryFacilities.length} 处设施
              </span>
              <button
                type="button"
                aria-label={`关闭${activeCategoryStyle.label}列表`}
                className="grid size-11 place-items-center rounded-full hover:bg-neutral-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#176346]"
                onClick={closeSelection}
              >
                <XIcon aria-hidden="true" className="size-5" />
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
            <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-[max(1.25rem,var(--campus-map-safe-area-bottom))] md:pb-5">
              {visibleCategoryFacilities.map((facility) => {
                const building = buildings.find(
                  (item) => item.buildingId === facility.buildingId,
                );
                return (
                  <FacilityResultButton
                    key={facility.placeId}
                    facility={facility}
                    location={facilityResultLocationLabel(
                      facility,
                      building,
                      building
                        ? campusMapBuildingDisplayFor(
                            buildingDisplay,
                            building.buildingId,
                          )?.label
                        : undefined,
                    )}
                    summary={metadataLabel(
                      feedbackSummaryLabel(
                        initialFeedbackSummaries[facility.placeId],
                      ),
                      categoryDistanceByPlaceId.has(facility.placeId)
                        ? nearbyDistanceLabel(
                            categoryDistanceByPlaceId.get(facility.placeId)!,
                          )
                        : null,
                      summarizeCampusMapAccess(facility.access),
                    )}
                    variant="category"
                    onSelect={() => selectFacility(facility, "category")}
                  />
                );
              })}
              {hasMoreCategoryFacilities ? (
                <button
                  type="button"
                  aria-label={
                    state.sheet.snap === "full"
                      ? "收起设施列表"
                      : `查看全部 ${categoryFacilities.length} 处设施`
                  }
                  className="mt-2 min-h-11 w-full rounded-xl bg-neutral-100 text-sm font-medium hover:bg-neutral-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#176346]"
                  onClick={() =>
                    dispatch({
                      type: "SET_SNAP",
                      snap: state.sheet.snap === "full" ? "peek" : "full",
                    })
                  }
                >
                  {state.sheet.snap === "full" ? "收起" : "查看全部"}
                </button>
              ) : null}
              {categoryFacilities.length ? (
                <button
                  type="button"
                  className="mt-2 flex min-h-11 touch-manipulation items-center gap-1 rounded-lg px-2 text-sm font-medium text-[#176346] hover:bg-neutral-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#176346]"
                  onClick={startFacilityForActiveCategory}
                >
                  <PlusIcon aria-hidden="true" className="size-4" />
                  新增{activeCategoryStyle.label}
                </button>
              ) : null}
              {!categoryFacilities.length ? (
                <div className="py-6 text-center text-sm text-neutral-500">
                  <p>暂无地点</p>
                  <button
                    type="button"
                    className="mt-3 min-h-11 rounded-xl bg-[#174b38] px-4 font-semibold text-white"
                    onClick={startFacilityForActiveCategory}
                  >
                    新增{activeCategoryStyle.label}
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        ) : selectedBuilding || selectedFacility ? (
          <div
            id="campus-map-panel-content"
            className={cn(
              "flex flex-col overscroll-contain md:h-auto md:max-h-[calc(100dvh-32px)]",
              selectedFacility || selectedBuildingCardIsStatic
                ? "h-full"
                : "h-[calc(100%-44px)]",
            )}
          >
            <div
              className={cn(
                "flex items-start gap-3 border-b border-black/10 p-4 md:p-5",
                selectedBuildingIsEmpty && "items-center",
              )}
            >
              {selectedFacility ? (
                <button
                  type="button"
                  aria-label={selectedFacilityBackLabel}
                  className="grid size-11 shrink-0 place-items-center rounded-full hover:bg-neutral-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#176346]"
                  onClick={navigateEntityBack}
                >
                  <ArrowLeftIcon aria-hidden="true" className="size-5" />
                </button>
              ) : null}
              <div className="min-w-0 flex-1">
                <h2
                  id="campus-map-panel-title"
                  ref={panelTitleRef}
                  tabIndex={-1}
                  className="-ml-2 line-clamp-2 break-words pl-2 text-xl font-semibold tracking-[-0.02em] focus-visible:outline-none focus-visible:shadow-[inset_3px_0_0_#176346]"
                >
                  {selectedFacility?.name ?? selectedBuilding?.name}
                </h2>
                {selectedFacility ? (
                  <p className="mt-1 truncate text-sm text-neutral-500">
                    {metadataLabel(
                      amenityStyle(selectedFacility.pinType).label,
                      selectedBuilding
                        ? selectedBuildingDisplayName
                        : placeLocationLabel(selectedFacility),
                      selectedBuilding
                        ? floorLabel(
                            selectedFacility.floorId,
                            selectedFacility.floorLabel,
                          )
                        : null,
                    )}
                  </p>
                ) : selectedBuilding ? (
                  <>
                    {selectedBuilding.englishName ||
                    visibleSelectedBuildingQualifier ? (
                      <p className="mt-1 flex min-w-0 flex-wrap items-center gap-1.5 text-sm text-neutral-500">
                        {selectedBuilding.englishName ? (
                          <span className="min-w-0 truncate">
                            {selectedBuilding.englishName}
                          </span>
                        ) : null}
                        {visibleSelectedBuildingQualifier ? (
                          <span
                            title={visibleSelectedBuildingQualifier}
                            className="max-w-full shrink-0 truncate rounded-md bg-neutral-100 px-1.5 py-0.5 text-xs font-medium text-neutral-600"
                          >
                            {visibleSelectedBuildingQualifier}
                          </span>
                        ) : null}
                      </p>
                    ) : null}
                    {buildingOverviewDirectory?.status !== "ready" ? (
                      <p className="mt-1 text-sm font-medium text-[#174b38]">
                        {buildingOverviewDirectory?.status === "loading"
                          ? "正在读取设施"
                          : buildingOverviewDirectory?.status === "error"
                            ? "设施暂不可用"
                            : "暂未收录设施"}
                      </p>
                    ) : null}
                  </>
                ) : null}
              </div>
              <button
                type="button"
                aria-label="关闭地点详情"
                className="grid size-11 shrink-0 place-items-center rounded-full hover:bg-neutral-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#176346]"
                onClick={closeSelection}
              >
                <XIcon aria-hidden="true" className="size-5" />
              </button>
            </div>

            {!selectedFacility && selectedBuildingIsEmpty ? (
              <div className="shrink-0 border-b border-black/8 px-4 py-3 md:px-5">
                <button
                  type="button"
                  aria-label={buildingAddAccessibleName}
                  className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-[#176346]/25 bg-[#edf5f1] px-4 text-sm font-semibold text-[#174b38] hover:bg-[#e4f1eb] active:translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#176346] focus-visible:ring-offset-2 motion-reduce:transform-none"
                  onClick={startFacilityForSelectedBuilding}
                >
                  <PlusIcon aria-hidden="true" className="size-4" />
                  添加第一处设施
                </button>
              </div>
            ) : null}

            {selectedFacility ? (
              <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-[max(1.25rem,var(--campus-map-safe-area-bottom))] md:pb-5">
                {selectedAccessLabel ? (
                  <p className="pt-4 text-sm text-neutral-600">
                    {selectedAccessLabel}
                  </p>
                ) : null}
                <div
                  role="group"
                  aria-label="地点操作"
                  className={cn(
                    "grid grid-cols-2 gap-2",
                    selectedAccessLabel ? "mt-3" : "mt-4",
                  )}
                >
                  <Link
                    href={`/campus-map/places/${selectedFacility.placeId}`}
                    className="col-span-2 flex min-h-11 touch-manipulation items-center justify-center rounded-xl bg-[#174b38] px-3 text-center text-sm font-semibold text-white hover:bg-[#123d2e] active:translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#176346] focus-visible:ring-offset-2 motion-reduce:transform-none"
                  >
                    查看完整详情
                  </Link>
                  <button
                    type="button"
                    className="min-h-11 touch-manipulation rounded-xl border border-[#174b38] px-2 text-sm font-semibold text-[#174b38] hover:bg-[#edf5f1] active:translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#176346] motion-reduce:transform-none"
                    onClick={() =>
                      dispatch({ type: "REFRAME", reason: "map-selection" })
                    }
                  >
                    {selectedFacility.location.kind === "outdoor-point"
                      ? "定位地点"
                      : "定位所属建筑"}
                  </button>
                  <button
                    type="button"
                    className="min-h-11 touch-manipulation justify-self-end rounded-xl px-3 text-sm font-semibold text-neutral-700 hover:bg-neutral-100 active:translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#176346] motion-reduce:transform-none"
                    onClick={() => startEdit(selectedFacility)}
                  >
                    建议修改
                  </button>
                </div>
              </div>
            ) : selectedBuilding ? (
              <>
                {!selectedBuildingIsEmpty ? (
                  <section className="shrink-0 border-b border-black/8">
                    <div className="flex min-h-11 items-center gap-1 px-4 md:px-5">
                      <h3 className="text-sm font-semibold text-neutral-800">
                        楼内设施
                      </h3>
                      <button
                        type="button"
                        aria-label={buildingAddAccessibleName}
                        className="flex min-h-11 touch-manipulation items-center gap-1 rounded-lg px-2 text-sm font-medium text-[#176346] hover:bg-neutral-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#176346]"
                        onClick={startFacilityForSelectedBuilding}
                      >
                        <PlusIcon aria-hidden="true" className="size-4" />
                        新增
                      </button>
                    </div>
                    {buildingOverviewDirectory?.status === "ready" &&
                    buildingFacilitySummary.length > 0 ? (
                      <ul
                        aria-label="楼内设施"
                        className="flex gap-1.5 overflow-x-auto px-4 pb-2 [scrollbar-width:none] md:px-5 [&::-webkit-scrollbar]:hidden"
                      >
                        {buildingFacilitySummary.map((summary) => {
                          const Icon = summary.icon;
                          return (
                            <li
                              key={summary.id}
                              className="flex min-h-9 shrink-0 items-center gap-1.5 rounded-lg bg-neutral-100 px-2.5 text-xs"
                            >
                              <Icon
                                aria-hidden="true"
                                className="size-4"
                                style={{ color: summary.color }}
                              />
                              <span>{summary.label}</span>
                              <strong className="font-semibold text-[#174b38]">
                                {summary.count} 处
                              </strong>
                            </li>
                          );
                        })}
                      </ul>
                    ) : null}
                  </section>
                ) : null}
                {buildingOverviewDirectory?.status === "ready" ? (
                  <div
                    className={cn(
                      "gap-2 overflow-x-auto border-b border-black/8 px-4 py-3 md:px-5",
                      state.sheet.snap === "full" ? "flex" : "hidden md:flex",
                    )}
                  >
                    <button
                      type="button"
                      aria-pressed={!state.buildingContext.floorId}
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
                    {selectedBuilding.floors.map((floor) => (
                      <button
                        key={floor.floorId}
                        type="button"
                        aria-pressed={
                          state.buildingContext.floorId === floor.floorId
                        }
                        className={cn(
                          "min-h-11 shrink-0 rounded-full px-3 text-sm",
                          state.buildingContext.floorId === floor.floorId
                            ? "bg-[#174b38] text-white"
                            : "bg-neutral-100",
                        )}
                        onClick={() =>
                          dispatch({
                            type: "SET_BUILDING_FLOOR",
                            floorId: floor.floorId,
                          })
                        }
                      >
                        {floor.displayLabel}
                      </button>
                    ))}
                  </div>
                ) : null}
                {!selectedBuildingIsEmpty ? (
                  <div className="min-h-0 flex-1 overflow-y-auto px-4 pt-2 pb-[max(1rem,var(--campus-map-safe-area-bottom))] md:p-5">
                    {state.sheet.snap !== "full" &&
                    buildingOverviewDirectory?.status === "ready" ? (
                      <div className="md:hidden">
                        {buildingPreviewFacility ? (
                          <FacilityResultButton
                            facility={buildingPreviewFacility}
                            location={facilityResultLocationLabel(
                              buildingPreviewFacility,
                              selectedBuilding,
                              selectedBuildingDisplayName ?? undefined,
                            )}
                            summary={metadataLabel(
                              amenityStyle(buildingPreviewFacility.pinType)
                                .label,
                              feedbackSummaryLabel(
                                initialFeedbackSummaries[
                                  buildingPreviewFacility.placeId
                                ],
                              ),
                              summarizeCampusMapAccess(
                                buildingPreviewFacility.access,
                              ),
                            )}
                            variant="preview"
                            onSelect={() =>
                              selectFacility(
                                buildingPreviewFacility,
                                "building",
                              )
                            }
                          />
                        ) : null}
                        <button
                          type="button"
                          aria-label="查看全部楼内设施"
                          className="mt-2 flex min-h-11 w-full items-center justify-center rounded-xl bg-neutral-100 px-4 text-sm font-medium hover:bg-neutral-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#176346]"
                          onClick={() =>
                            dispatch({ type: "SET_SNAP", snap: "full" })
                          }
                        >
                          查看全部
                        </button>
                      </div>
                    ) : null}
                    <div
                      className={cn(
                        "divide-y divide-black/8",
                        state.sheet.snap !== "full" &&
                          buildingDirectory?.status === "ready" &&
                          "hidden md:block",
                      )}
                    >
                      {buildingDirectory?.status === "loading" ? (
                        <p
                          role="status"
                          className="py-8 text-center text-sm text-neutral-500"
                        >
                          正在读取楼内设施
                        </p>
                      ) : buildingDirectory?.status === "error" ? (
                        <div
                          role="alert"
                          className="py-6 text-center text-sm text-neutral-600"
                        >
                          <p>无法读取楼内设施</p>
                          <button
                            type="button"
                            className="mt-3 min-h-11 rounded-xl border border-black/15 px-4 font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#176346]"
                            onClick={() => void projectionStore.refresh()}
                          >
                            重新读取
                          </button>
                        </div>
                      ) : buildingDirectory?.status === "ready" &&
                        buildingFacilityGroups.length > 0 ? (
                        buildingFacilityGroups.map((group) => (
                          <section key={group.floorId ?? "building"}>
                            <h4 className="pt-4 text-xs font-semibold text-neutral-500 first:pt-0">
                              {group.label}
                            </h4>
                            <div className="divide-y divide-black/8">
                              {group.places.map((facility) => {
                                return (
                                  <FacilityResultButton
                                    key={facility.placeId}
                                    facility={facility}
                                    location={facilityResultLocationLabel(
                                      facility,
                                      selectedBuilding,
                                      selectedBuildingDisplayName ?? undefined,
                                    )}
                                    summary={metadataLabel(
                                      amenityStyle(facility.pinType).label,
                                      feedbackSummaryLabel(
                                        initialFeedbackSummaries[
                                          facility.placeId
                                        ],
                                      ),
                                      summarizeCampusMapAccess(facility.access),
                                    )}
                                    variant="building"
                                    onSelect={() =>
                                      selectFacility(facility, "building")
                                    }
                                  />
                                );
                              })}
                            </div>
                          </section>
                        ))
                      ) : (
                        <p className="py-8 text-center text-sm text-neutral-500">
                          这个楼层暂无设施
                        </p>
                      )}
                    </div>
                  </div>
                ) : null}
              </>
            ) : null}
          </div>
        ) : null}
      </section>
    </main>
  );
}
