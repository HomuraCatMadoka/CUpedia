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
  CheckCircle2Icon,
  DropletsIcon,
  LocateFixedIcon,
  MapPinIcon,
  MinusIcon,
  PlusIcon,
  PrinterIcon,
  SearchIcon,
  SchoolIcon,
  ToiletIcon,
  UsersRoundIcon,
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
import { AmapInteractionAdapter } from "@/lib/campus-map/amap-interaction-adapter";
import {
  createAmapGeocoderAdapter,
  createAmapPlaceContextResolver,
  type AmapGeocoderService,
  type AmapPlaceContextResolver,
  type AmapPlaceContextResult,
  type AmapResolvedPlaceContext,
} from "@/lib/campus-map/amap-place-context";
import {
  facilityMarkerContent,
  type CampusMapAmenity,
} from "@/lib/campus-map/facility-marker";
import {
  loadCampusMapAmapPoiCard,
  loadCampusMapBrowseProjection,
} from "@/lib/campus-map/browse-actions";
import {
  CampusMapAmapCoordinateProjector,
  CampusMapAmapPoiCardResolver,
  createCampusMapAmapPoiCardContent,
  createTransientCampusMapAmapPoiCard,
} from "@/lib/campus-map/amap-browse-projection";
import {
  CAMPUS_MAP_DEFAULT_VIEW_CENTER as CAMPUS_CENTER,
  EMPTY_CAMPUS_MAP_BROWSE_PROJECTION,
  queryCampusMapBrowse,
  type CampusMapBrowseBuilding,
  type CampusMapBrowseMarker,
  type CampusMapBrowsePlace,
  type CampusMapBrowseProjection,
} from "@/lib/campus-map/browse-projection";
import {
  CampusMapBrowseProjectionStore,
  type CampusMapBrowseRefreshResult,
} from "@/lib/campus-map/browse-projection-store";
import { projectCampusMapBuildingDirectory } from "@/lib/campus-map/building-directory";
import {
  identifyCampusMapEditPublisher,
  publishCampusMapEdit,
  reconcileCampusMapEditPublish,
} from "@/lib/campus-map/edit-actions";
import { CAMPUS_MAP_EDIT_SCHEMA } from "@/lib/campus-map/edit-schema";
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
type Facility = CampusMapBrowsePlace;
type Position = readonly [longitude: number, latitude: number];
type ResolvedMappedProviderTarget =
  | { kind: "building"; building: Building }
  | { kind: "place"; facility: Facility };

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

const CATEGORY_PRESENTATION = {
  toilet: { icon: ToiletIcon, color: "#1b6f55" },
  water: { icon: DropletsIcon, color: "#227a9b" },
  printer: { icon: PrinterIcon, color: "#675aa7" },
  "common-space": { icon: UsersRoundIcon, color: "#9a5b32" },
  classroom: { icon: SchoolIcon, color: "#a33f52" },
} satisfies Record<
  Amenity,
  {
    icon: typeof ToiletIcon;
    color: string;
  }
>;

const CATEGORIES = CAMPUS_MAP_EDIT_SCHEMA.presets.map((preset) => ({
  id: preset.pinType,
  label: preset.label,
  ...CATEGORY_PRESENTATION[preset.pinType],
}));

function canonicalInitialSearch(
  search: string,
  catalog: CampusMapSceneCatalog,
) {
  const params = new URLSearchParams(search);
  if (params.get("v") === "1") return search;
  return `?${encodeCampusMapUrl(EMPTY_CAMPUS_MAP_SCENE_SESSION, catalog)}`;
}

type ProjectedCampusMapSelection =
  | { kind: "none" }
  | { kind: "building"; buildingId: string }
  | { kind: "facility"; buildingId: string | null; facilityId: string }
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
    scene.kind === "facility" ? catalog.facilities[scene.facilityId] : null;
  const selection: ProjectedCampusMapSelection =
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
    selection.kind === "building" || selection.kind === "facility"
      ? selection.buildingId
      : null;
  return (
    buildings.find((building) => building.buildingId === buildingId) ?? null
  );
}

function facilityFor(
  selection: ProjectedCampusMapSelection,
  facilities: readonly Facility[],
) {
  return selection.kind === "facility"
    ? (facilities.find(
        (facility) => facility.placeId === selection.facilityId,
      ) ?? null)
    : null;
}

function amenityStyle(category: Amenity) {
  return CATEGORIES.find((item) => item.id === category) ?? CATEGORIES[0];
}

function knownAmenity(value: string | null) {
  return CATEGORIES.find((item) => item.id === value)?.id ?? null;
}

function accessLabel(facility: Facility) {
  if (facility.access.temporaryStatus === "temporarily-closed") {
    return "暂时停用";
  }
  if (
    facility.access.audience === "unknown" ||
    facility.access.credentialRequirement === "unknown" ||
    facility.access.schedule.kind === "unknown" ||
    facility.access.reservationRequirement === "unknown" ||
    facility.access.temporaryStatus === "unknown"
  ) {
    return null;
  }
  const conditions: string[] = [];
  if (facility.access.audience === "cuhk-member") {
    conditions.push("限中大成员");
  } else if (facility.access.audience === "library-member") {
    conditions.push("限图书馆成员");
  }
  if (facility.access.credentialRequirement === "campus-card") {
    conditions.push("需校园卡");
  } else if (facility.access.credentialRequirement === "library-card") {
    conditions.push("需图书证");
  } else if (facility.access.credentialRequirement === "other") {
    conditions.push("需其他凭证");
  }
  if (facility.access.schedule.kind === "weekly") {
    conditions.push("按时段开放");
  }
  if (facility.access.reservationRequirement === "required") {
    conditions.push("需要预约");
  }
  return conditions.length > 0 ? conditions.join(" · ") : "公众可达";
}

function metadataLabel(...parts: Array<string | null | undefined>) {
  return parts.filter(Boolean).join(" · ");
}

function browseMarkerKey(marker: CampusMapBrowseMarker) {
  return marker.kind === "place"
    ? `place:${marker.placeId}`
    : `building:${marker.buildingId}:${marker.pinType}`;
}

function amapPositionKey(position: AMapLngLat | Position) {
  const longitude = "lng" in position ? position.lng : position[0];
  const latitude = "lat" in position ? position.lat : position[1];
  return `${longitude.toFixed(12)}:${latitude.toFixed(12)}`;
}

function browseMarkerView(
  marker: CampusMapBrowseMarker,
  projection: CampusMapBrowseProjection,
) {
  const style = amenityStyle(marker.pinType);
  if (marker.kind === "place") {
    const place = projection.places.find(
      (candidate) => candidate.placeId === marker.placeId,
    );
    if (!place) return null;
    return {
      id: browseMarkerKey(marker),
      name: place.name,
      buildingName: "校内地点",
      floorLabel:
        marker.position.precision === "precise" ? "精确位置" : "约略位置",
      category: marker.pinType,
      color: style.color,
      markerLabel: `${place.name}，${
        marker.position.precision === "precise" ? "精确" : "约略"
      } WGS84 地点`,
    };
  }
  const building = projection.buildings.find(
    (candidate) => candidate.buildingId === marker.buildingId,
  );
  if (!building) return null;
  const markerPlaces = marker.placeIds.flatMap((placeId) => {
    const place = projection.places.find(
      (candidate) => candidate.placeId === placeId,
    );
    return place ? [place] : [];
  });
  if (markerPlaces.length === 0) return null;
  const locationLabel =
    markerPlaces.length === 1
      ? floorLabel(markerPlaces[0]!.floorId, markerPlaces[0]!.floorLabel)
      : `${markerPlaces.length} 个地点`;
  return {
    id: browseMarkerKey(marker),
    name:
      markerPlaces.length === 1
        ? markerPlaces[0]!.name
        : `${markerPlaces.length} 个${style.label}`,
    buildingName: building.name,
    floorLabel: locationLabel,
    category: marker.pinType,
    color: style.color,
    markerLabel: `${building.name}有 ${markerPlaces.length} 个${style.label}，建筑位置参考`,
  };
}

function floorLabel(floorId: string | null, displayLabel?: string | null) {
  if (displayLabel) return displayLabel;
  if (!floorId) return "建筑内";
  return floorId.endsWith("/F") ? floorId : `${floorId}/F`;
}

function placeLocationLabel(place: Facility) {
  switch (place.location.kind) {
    case "outdoor-point":
      return "室外位置";
    case "building":
      return "建筑内";
    case "floor":
      return place.location.floor.displayLabel;
  }
}

function publishedPlaceNotice(
  projection: CampusMapBrowseProjection,
  placeId: string,
) {
  const place = projection.places.find(
    (candidate) => candidate.placeId === placeId,
  );
  if (!place?.buildingId) return "地点已添加";
  const building = projection.buildings.find(
    (candidate) => candidate.buildingId === place.buildingId,
  );
  if (!building) return "地点已添加";
  return place.floorId
    ? `已添加到 ${building.name} · ${floorLabel(place.floorId, place.floorLabel)}`
    : `已添加到 ${building.name}`;
}

function groupBuildingFacilities(
  building: Building,
  facilities: readonly Facility[],
) {
  const floorOrder = new Map(
    building.floors.map((floor, index) => [floor.floorId, index]),
  );
  const groups = new Map<
    string,
    { floorId: string | null; label: string; places: Facility[] }
  >();
  for (const facility of facilities) {
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

function summarizeFacilityTypes(facilities: readonly Facility[]) {
  const counts = new Map<Amenity, number>();
  for (const facility of facilities) {
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
  onPublishedProjectionRefreshed,
}: {
  initialSearch?: string;
  factSchema?: CampusMapFactSchema | null;
  initialBrowseProjection?: CampusMapBrowseProjection;
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
  const facilities = browseProjection.places;
  const buildingsRef = useRef(buildings);
  const facilitiesRef = useRef(facilities);
  useEffect(() => {
    buildingsRef.current = buildings;
    facilitiesRef.current = facilities;
  }, [buildings, facilities]);
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
  const [publishNotice, setPublishNotice] = useState<{
    placeId: string;
    message: string;
  } | null>(null);
  const mapRef = useRef<AMapMap | null>(null);
  const mapElementRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLElement | null>(null);
  const clusterRef = useRef<AMapMarkerCluster | null>(null);
  const clusterCategoryRef = useRef<Amenity | null>(null);
  const clusterProjectionRef = useRef<CampusMapBrowseProjection | null>(null);
  const facilityMarkersRef = useRef(new Map<string, AMapMarker>());
  const infoWindowRef = useRef<AMapInfoWindow | null>(null);
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
    clusterRef.current?.setMap(null);
    clusterRef.current = null;
    clusterCategoryRef.current = null;
    clusterProjectionRef.current = null;
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
        const currentPosition: Position = [
          currentProviderPosition.lng - offset[0],
          currentProviderPosition.lat - offset[1],
        ];
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
              const currentSession = sceneDriver.getSnapshot().session;
              if (
                currentSession.mode === "browse" &&
                currentSession.scene.kind === "provider-poi"
              ) {
                return;
              }
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
        const card = createTransientCampusMapAmapPoiCard({
          providerObjectId: overlay.externalId,
          name: overlay.name,
          position: overlay.position,
        });
        if (!card || card.kind !== "transient") return;
        const content = createCampusMapAmapPoiCardContent(document, card);
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
        browserWindow?.requestAnimationFrame(() => {
          if (infoWindowRef.current !== infoWindow) return;
          content.focus({ preventScroll: true });
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
  const visiblePublishNotice =
    publishNotice &&
    session.mode === "browse" &&
    session.scene.kind === "facility" &&
    session.scene.facilityId === publishNotice.placeId
      ? publishNotice
      : null;
  const state = projectedState(session, driverSnapshot.returnTo, sceneCatalog);
  const panelSnap = activeProviderTargetError?.snap ?? state.sheet.snap;
  const selectedFacility = facilityFor(state.selection, facilities);
  const selectedBuilding = selectedFacility?.buildingId
    ? (buildings.find(
        (building) => building.buildingId === selectedFacility.buildingId,
      ) ?? null)
    : buildingFor(state.selection, buildings);
  const activeAmenity = knownAmenity(state.mapFilter.category);
  const facilityOrigin =
    driverSnapshot.returnTo?.mode === "browse" &&
    driverSnapshot.returnTo.scene.kind === "category-results"
      ? "category"
      : "map";

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
        applyProjectionAndOpen: ({ placeId, intentToken }) => {
          const projection = projectionStore.getSnapshot().projection;
          if (!projection.places.some((place) => place.placeId === placeId)) {
            return { status: "missing-target" };
          }
          const result = driver.openPublishedPlace(placeId, intentToken);
          if (result.status === "applied") {
            setPublishNotice({
              placeId,
              message: publishedPlaceNotice(projection, placeId),
            });
          }
          return result;
        },
        isCanonicalPlaceOpen: (placeId) => {
          const current = driver.getSnapshot().session;
          return (
            current.mode === "browse" &&
            current.scene.kind === "facility" &&
            current.scene.facilityId === placeId
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
    ) =>
      publishReceiptConsumer.consume({
        command,
        intentToken: driver.getIntentToken(),
        transport,
        onIdentityVerified,
      }),
    [driver, publishReceiptConsumer],
  );

  const {
    session: editSession,
    dispatchEvent: dispatchEditEvent,
    startAdd,
    startEdit: startCanonicalEdit,
    announcement: editAnnouncement,
    restoreNotice: editRestoreNotice,
  } = useCampusMapEditSessionOwner({
    driver,
    dispatch,
    recoverPublish,
  });
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
    (facility: Facility) => void startCanonicalEdit(facility.placeId),
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
        buildingId: building.buildingId,
        source,
      });
    },
    [dispatch],
  );

  const selectFacility = useCallback(
    (facility: Facility, source: "category" | "building" | "search") => {
      dispatch({
        type: "OPEN_FACILITY",
        facilityId: facility.placeId,
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
  }, [dispatch, dispatchEditEvent, driver, editSession]);

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
      const currentSnapshot = driver.getSnapshot();
      if (currentSnapshot.transientPanel) {
        event.preventDefault();
        dispatch({ type: "DISMISS" });
        return;
      }
      const current = currentSnapshot.session;
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
            [event.lnglat.lng - offset[0], event.lnglat.lat - offset[1]],
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
        dispatch({ type: "DISMISS" });
      });
    });
    map.on("dragstart", () => {
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
      const position: Position = [
        center.lng - offset[0],
        center.lat - offset[1],
      ];
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
  }, [dispatch, driver, projectionStore, selectBuilding, selectFacility]);

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
        if (projectionStillOwnsScene) {
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
  }, [browseProjection, driver, executeDriverCamera, mapReady]);

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
      clusterProjectionRef.current = null;
      facilityMarkersRef.current.clear();
      return;
    }
    const projectedMarkers = browseProjection.markers.filter(
      (marker) => marker.pinType === activeAmenity,
    );
    const markerByKey = new Map(
      projectedMarkers.map((marker) => [browseMarkerKey(marker), marker]),
    );
    const markerTargets = projectedMarkers.flatMap((marker) => {
      const position =
        marker.kind === "place"
          ? amapPositionsRef.current[`place:${marker.placeId}`]
          : amapPositionsRef.current[`building:${marker.buildingId}`];
      const markerKey = browseMarkerKey(marker);
      if (!position) return [];
      const placeIds =
        marker.kind === "place" ? [marker.placeId] : marker.placeIds;
      return placeIds.map((_, index) => ({
        markerKey,
        position,
        showMarker: marker.kind === "place" || index === 0,
      }));
    });
    const data = markerTargets.map(({ position }) => ({ lnglat: position }));
    const markerTargetsByPosition = new Map<
      string,
      Array<(typeof markerTargets)[number]>
    >();
    for (const target of markerTargets) {
      const key = amapPositionKey(target.position);
      const targets = markerTargetsByPosition.get(key) ?? [];
      targets.push(target);
      markerTargetsByPosition.set(key, targets);
    }

    if (
      clusterRef.current &&
      (clusterCategoryRef.current !== activeAmenity ||
        clusterProjectionRef.current !== browseProjection)
    ) {
      clusterRef.current.setMap(null);
      clusterRef.current = null;
      clusterCategoryRef.current = null;
      clusterProjectionRef.current = null;
      facilityMarkersRef.current.clear();
    }

    try {
      if (!clusterRef.current) {
        const style = amenityStyle(activeAmenity);
        const markerTargetAssignments = new WeakMap<
          AMapMarker,
          (typeof markerTargets)[number]
        >();
        const nextMarkerTargetIndex = new Map<string, number>();
        const cluster = new window.AMap.MarkerCluster(map, data, {
          gridSize: 90,
          maxZoom: 18,
          averageCenter: true,
          renderMarker: ({ marker }: { marker: AMapMarker }) => {
            let markerTarget = markerTargetAssignments.get(marker);
            if (!markerTarget) {
              const position = marker.getPosition();
              if (!position) return;
              const positionKey = amapPositionKey(position);
              const targets = markerTargetsByPosition.get(positionKey);
              if (!targets?.length) return;
              const targetIndex = nextMarkerTargetIndex.get(positionKey) ?? 0;
              markerTarget = targets[targetIndex % targets.length];
              nextMarkerTargetIndex.set(positionKey, targetIndex + 1);
              markerTargetAssignments.set(marker, markerTarget);
            }
            const { markerKey, showMarker } = markerTarget;
            const projectedMarker = markerKey
              ? markerByKey.get(markerKey)
              : undefined;
            if (!markerKey || !projectedMarker) return;
            if (!showMarker) {
              marker.setContent(
                '<span aria-hidden="true" style="display:none"></span>',
              );
              return;
            }
            const view = browseMarkerView(projectedMarker, browseProjection);
            if (!view) return;
            facilityMarkersRef.current.set(markerKey, marker);
            marker.setContent(
              facilityMarkerContent({
                ...view,
                selected: false,
              }),
            );
            marker.on("click", () => {
              interactionAdapterRef.current.dispatchProviderTarget(() => {
                if (projectedMarker.kind === "building-presence") {
                  const building = buildingsRef.current.find(
                    (candidate) =>
                      candidate.buildingId === projectedMarker.buildingId,
                  );
                  const onlyPlace =
                    projectedMarker.placeIds.length === 1
                      ? facilitiesRef.current.find(
                          (candidate) =>
                            candidate.placeId === projectedMarker.placeIds[0],
                        )
                      : null;
                  if (onlyPlace) {
                    selectFacility(onlyPlace, "category");
                  } else if (building) {
                    selectBuilding(building);
                  }
                  return;
                }
                const place = facilitiesRef.current.find(
                  (candidate) => candidate.placeId === projectedMarker.placeId,
                );
                if (!place) return;
                selectFacility(place, "category");
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
              `<button type="button" data-cupedia-marker="true" aria-label="${count} 个${style.label}" style="display:grid;min-width:46px;height:46px;place-items:center;border:3px solid white;border-radius:999px;background:${style.color};color:white;font:700 14px system-ui;box-shadow:0 3px 12px rgba(0,0,0,.22);padding:0 12px">${count}</button>`,
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
        clusterProjectionRef.current = browseProjection;
      } else {
        clusterRef.current.setData(data);
      }
    } catch {
      clusterRef.current = null;
      clusterCategoryRef.current = null;
      clusterProjectionRef.current = null;
      facilityMarkersRef.current.clear();
      queueMicrotask(() => setClusterStatus("error"));
    }
  }, [
    activeAmenity,
    browseProjection,
    buildings,
    clusterStatus,
    coordinateVersion,
    dispatch,
    mapReady,
    selectBuilding,
    selectFacility,
  ]);

  useEffect(() => {
    const syncSelectedMarker = () => {
      document
        .querySelectorAll<HTMLElement>("[data-facility-id]")
        .forEach((element) => {
          element.setAttribute(
            "aria-pressed",
            String(
              browseProjection.markers.some(
                (marker) =>
                  browseMarkerKey(marker) === element.dataset.facilityId &&
                  selectedFacility !== null &&
                  (marker.kind === "place"
                    ? marker.placeId === selectedFacility.placeId
                    : marker.placeIds.includes(selectedFacility.placeId)),
              ),
            ),
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
    for (const projectedMarker of browseProjection.markers) {
      const markerKey = browseMarkerKey(projectedMarker);
      const marker = facilityMarkersRef.current.get(markerKey);
      if (!marker) continue;
      const selected = Boolean(
        selectedFacility &&
        (projectedMarker.kind === "place"
          ? projectedMarker.placeId === selectedFacility.placeId
          : projectedMarker.placeIds.includes(selectedFacility.placeId)),
      );
      const view = browseMarkerView(projectedMarker, browseProjection);
      if (!view) continue;
      marker.setzIndex(selected ? 220 : 160);
      marker.setContent(
        facilityMarkerContent({
          ...view,
          selected,
        }),
      );
    }
    return () => observer.disconnect();
  }, [browseProjection, selectedFacility]);

  useEffect(() => {
    const mapElement = mapElementRef.current;
    const panel = panelRef.current;
    if (
      !mapElement ||
      !panel ||
      (!selectedBuilding && !selectedFacility && !editSession)
    )
      return;
    const observer = new ResizeObserver(() => {
      driver.updateSheetGeometry(panel.hidden ? null : rect(panel));
    });
    observer.observe(mapElement);
    observer.observe(panel);
    return () => observer.disconnect();
  }, [driver, editSession, selectedBuilding, selectedFacility]);

  useEffect(
    () => () => {
      pointerGestureCleanupRef.current?.();
      pointerGestureCleanupRef.current = null;
      clusterRef.current?.setMap(null);
      clusterRef.current = null;
      clusterCategoryRef.current = null;
      clusterProjectionRef.current = null;
      providerPoiCardResolverRef.current.invalidate();
      coordinateProjectorRef.current.invalidate();
      const infoWindow = infoWindowRef.current;
      infoWindowRef.current = null;
      infoWindow?.close();
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
        kind: "facility" as const,
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
  const buildingFacilitySummaryLabel = buildingFacilitySummary
    .map((summary) => `${summary.label} ${summary.count}`)
    .join(" · ");
  const buildingFacilities = buildingDirectory?.places ?? [];
  const buildingFacilityGroups = selectedBuilding
    ? groupBuildingFacilities(selectedBuilding, buildingFacilities)
    : [];
  const categoryResults = activeAmenity
    ? queryCampusMapBrowse(browseProjection, { pinType: activeAmenity })
    : null;
  const categoryFacilities = categoryResults?.places ?? [];
  const categorySummary = `${categoryFacilities.length} 处设施`;
  const activeCategoryStyle = activeAmenity
    ? amenityStyle(activeAmenity)
    : null;
  const chromeHidden = Boolean(editSession) || state.sheet.snap === "full";
  const selectedBuildingIsEmpty = Boolean(
    selectedBuilding &&
    !selectedFacility &&
    selectedBuilding.placeIds.length === 0,
  );
  const panelHidden = Boolean(
    !editSession &&
    !activeProviderTargetError &&
    (state.selection.kind === "external" ||
      (state.selection.kind === "none" &&
        !state.mapFilter.category &&
        !selectedFacility)),
  );
  const mobilePanelHeight =
    editSession?.status === "placing"
      ? "48dvh"
      : editSession
        ? "var(--campus-map-edit-sheet-height)"
        : panelSnap === "full"
          ? "72dvh"
          : "var(--campus-map-peek-height)";
  const mobileMapOcclusion = panelHidden
    ? "0px"
    : "var(--campus-map-panel-height)";
  const desktopSidePanelVisible = Boolean(
    editSession ||
    activeProviderTargetError ||
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
          "--campus-map-edit-sheet-height": "65dvh",
          "--campus-map-peek-height": "min(248px, 36dvh)",
          "--campus-map-panel-height": mobilePanelHeight,
          "--campus-map-provider-control-clearance": "3.5rem",
          "--campus-map-safe-area-bottom": "env(safe-area-inset-bottom)",
        } as CSSProperties
      }
    >
      {visiblePublishNotice ? (
        <div
          role="status"
          className="pointer-events-none absolute bottom-[calc(var(--campus-map-peek-height)+12px)] left-1/2 z-40 flex min-h-11 max-w-[calc(100%-24px)] -translate-x-1/2 items-center gap-2 rounded-xl bg-[#174b38] px-4 py-2.5 text-sm font-semibold text-white shadow-[0_8px_24px_rgba(23,75,56,.28)] motion-reduce:transition-none md:top-4 md:bottom-auto md:left-4 md:translate-x-0"
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
                <XIcon className="size-4" />
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
                  const subtitle =
                    result.kind === "building"
                      ? result.building.englishName
                      : metadataLabel(
                          result.building?.name,
                          placeLocationLabel(result.facility),
                          accessLabel(result.facility),
                        );
                  const content = (
                    <>
                      <span className="grid size-9 place-items-center rounded-lg bg-[#e4f1eb] text-xs font-bold text-[#176346]">
                        {result.kind === "building"
                          ? (result.building.code ?? "校舍")
                          : (result.building?.code ?? "地点")}
                      </span>
                      <span className="min-w-0">
                        <strong className="block truncate text-sm">
                          {result.kind === "building"
                            ? result.building.name
                            : result.facility.name}
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
        hidden={panelHidden}
        aria-labelledby="campus-map-panel-title"
        className={cn(
          "absolute z-30 overflow-hidden overscroll-contain border-black/10 bg-white shadow-[0_12px_40px_rgba(23,33,28,.24)]",
          "inset-x-0 bottom-0 rounded-t-2xl border-t md:right-4 md:left-auto md:w-[390px] md:rounded-2xl md:border",
          "h-[var(--campus-map-panel-height)]",
          editSession?.status === "placing"
            ? "max-h-[65dvh] md:inset-y-4 md:h-auto md:max-h-[calc(100dvh-32px)]"
            : editSession
              ? "md:inset-y-4 md:h-auto"
              : "md:top-4 md:bottom-auto md:h-auto md:max-h-[calc(100dvh-32px)]",
        )}
      >
        {!editSession &&
        !activeProviderTargetError &&
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
            className="absolute top-2 right-3 z-10 grid size-11 place-items-center rounded-full bg-white hover:bg-neutral-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#176346]"
            onClick={() => dispatchEditEvent({ type: "REQUEST_CLOSE" })}
          >
            <XIcon aria-hidden="true" className="size-5" />
          </button>
        ) : null}
        {activeProviderTargetError ? (
          <div
            id="campus-map-panel-content"
            role="alert"
            className="flex h-[calc(100%-44px)] flex-col justify-center px-5 pb-5"
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
              onClick={() => dispatch({ type: "DISMISS_TRANSIENT_PANEL" })}
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
            onEvent={dispatchEditEvent}
          />
        ) : state.selection.kind === "none" &&
          state.mapFilter.category &&
          !selectedFacility &&
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
              <div className="min-w-0 flex-1 rounded-lg has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-[#176346] has-[:focus-visible]:ring-offset-2">
                <h2
                  id="campus-map-panel-title"
                  ref={panelTitleRef}
                  tabIndex={-1}
                  className="text-xl font-semibold focus-visible:outline-none"
                >
                  {activeCategoryStyle.label}
                </h2>
                <p className="mt-1 text-sm text-neutral-500">
                  {categorySummary}
                </p>
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
            <div className="mb-[var(--campus-map-provider-control-clearance)] min-h-0 flex-1 overflow-y-auto px-5 pb-[max(1.25rem,var(--campus-map-safe-area-bottom))] md:mb-0 md:pb-5">
              {(state.sheet.snap === "full"
                ? categoryFacilities
                : categoryFacilities.slice(0, 1)
              ).map((facility) => {
                const building = buildings.find(
                  (item) => item.buildingId === facility.buildingId,
                );
                return (
                  <button
                    key={facility.placeId}
                    data-return-result={facility.placeId}
                    type="button"
                    className="flex min-h-14 w-full items-center border-b border-black/8 py-2 text-left hover:bg-neutral-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#176346]"
                    onClick={() => selectFacility(facility, "category")}
                  >
                    <span className="min-w-0 flex-1">
                      <strong className="block text-sm">{facility.name}</strong>
                      <span className="mt-0.5 block text-xs text-neutral-500">
                        {metadataLabel(
                          building?.name,
                          placeLocationLabel(facility),
                          accessLabel(facility),
                        )}
                      </span>
                    </span>
                  </button>
                );
              })}
              {categoryFacilities.length > 1 ? (
                <button
                  type="button"
                  className="mt-2 min-h-11 w-full rounded-xl bg-neutral-100 text-sm font-medium hover:bg-neutral-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#176346]"
                  onClick={() =>
                    dispatch({
                      type: "SET_SNAP",
                      snap: state.sheet.snap === "full" ? "peek" : "full",
                    })
                  }
                >
                  {state.sheet.snap === "full"
                    ? "收起列表"
                    : `查看全部 ${categoryFacilities.length} 处设施`}
                </button>
              ) : null}
              {!categoryFacilities.length ? (
                <div className="py-6 text-center text-sm text-neutral-500">
                  <p>暂无地点</p>
                  <button
                    type="button"
                    className="mt-3 min-h-11 rounded-xl bg-[#174b38] px-4 font-semibold text-white"
                    onClick={startAddAtPlacementAnchor}
                  >
                    添加地点
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        ) : selectedBuilding || selectedFacility ? (
          <div
            id="campus-map-panel-content"
            className="flex h-[calc(100%-44px)] flex-col overscroll-contain md:h-auto md:max-h-[calc(100dvh-32px)]"
          >
            <div className="flex items-start gap-3 border-b border-black/10 p-4 md:p-5">
              {selectedFacility ? (
                <button
                  type="button"
                  aria-label={
                    facilityOrigin === "category"
                      ? `返回${amenityStyle(selectedFacility.pinType).label}列表`
                      : "返回建筑"
                  }
                  className="grid size-11 shrink-0 place-items-center rounded-full hover:bg-neutral-100"
                  onClick={navigateEntityBack}
                >
                  <ArrowLeftIcon className="size-5" />
                </button>
              ) : (
                <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-[#174b38] text-sm font-bold text-white">
                  {selectedBuilding?.code ?? "地点"}
                </span>
              )}
              <div className="min-w-0 flex-1 rounded-lg has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-[#176346] has-[:focus-visible]:ring-offset-2">
                <h2
                  id="campus-map-panel-title"
                  ref={panelTitleRef}
                  tabIndex={-1}
                  className="truncate text-xl font-semibold tracking-[-0.02em] focus-visible:outline-none"
                >
                  {selectedFacility?.name ?? selectedBuilding?.name}
                </h2>
                {selectedFacility ? (
                  <p className="mt-1 truncate text-sm text-neutral-500">
                    {selectedBuilding
                      ? `${selectedBuilding.name} · ${floorLabel(selectedFacility.floorId, selectedFacility.floorLabel)}`
                      : placeLocationLabel(selectedFacility)}
                  </p>
                ) : selectedBuilding ? (
                  <p className="mt-1 truncate text-sm font-medium text-[#174b38]">
                    {selectedBuilding.placeIds.length > 0
                      ? `楼内设施 · ${buildingFacilitySummaryLabel || `${selectedBuilding.placeIds.length} 项`}`
                      : "暂未收录设施"}
                  </p>
                ) : null}
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
              <div className="mb-[var(--campus-map-provider-control-clearance)] min-h-0 flex-1 overflow-y-auto px-5 pb-[max(1.25rem,var(--campus-map-safe-area-bottom))] md:mb-0 md:pb-5">
                <div className="flex flex-wrap gap-2 pt-4">
                  <span className="rounded-lg bg-[#e7f1ec] px-2.5 py-1.5 text-sm font-medium text-[#174b38]">
                    {amenityStyle(selectedFacility.pinType).label}
                  </span>
                  {accessLabel(selectedFacility) ? (
                    <span className="rounded-lg bg-neutral-100 px-2.5 py-1.5 text-sm text-neutral-700">
                      {accessLabel(selectedFacility)}
                    </span>
                  ) : null}
                </div>
                <button
                  type="button"
                  className="mt-3 min-h-11 w-full touch-manipulation rounded-xl bg-[#174b38] px-4 text-sm font-semibold text-white hover:bg-[#123d2e] active:translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#176346] focus-visible:ring-offset-2 motion-reduce:transform-none"
                  onClick={() => startEdit(selectedFacility)}
                >
                  建议修改
                </button>
                <div
                  role="group"
                  aria-label="更多地点操作"
                  className="mt-2 grid grid-cols-2 gap-2"
                >
                  <button
                    type="button"
                    className="min-h-11 touch-manipulation rounded-xl border border-[#174b38] px-3 text-sm font-semibold text-[#174b38] hover:bg-[#edf5f1] active:translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#176346] motion-reduce:transform-none"
                    onClick={() =>
                      dispatch({ type: "REFRAME", reason: "map-selection" })
                    }
                  >
                    {selectedFacility.location.kind === "outdoor-point"
                      ? "定位地点"
                      : "定位所属建筑"}
                  </button>
                  <Link
                    href={`/campus-map/places/${selectedFacility.placeId}/history`}
                    className="flex min-h-11 touch-manipulation items-center justify-center rounded-xl border border-black/15 px-3 text-center text-sm font-semibold text-neutral-700 hover:bg-neutral-50 active:translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#176346] motion-reduce:transform-none"
                  >
                    查看编辑记录
                  </Link>
                </div>
              </div>
            ) : selectedBuilding ? (
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
                <div className="mb-[var(--campus-map-provider-control-clearance)] min-h-0 flex-1 overflow-y-auto px-4 pt-4 pb-[max(1rem,var(--campus-map-safe-area-bottom))] md:mb-0 md:p-5">
                  {state.sheet.snap !== "full" &&
                  selectedBuilding.placeIds.length > 0 ? (
                    <button
                      type="button"
                      className="flex min-h-11 w-full items-center justify-center rounded-xl bg-[#174b38] px-4 text-sm font-semibold text-white hover:bg-[#123d2e] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#176346] focus-visible:ring-offset-2 md:hidden"
                      onClick={() =>
                        dispatch({ type: "SET_SNAP", snap: "full" })
                      }
                    >
                      查看全部设施
                    </button>
                  ) : null}
                  {selectedBuilding.placeIds.length > 0 ? (
                    <div
                      className={cn(
                        "divide-y divide-black/8",
                        state.sheet.snap !== "full" && "hidden md:block",
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
                            className="mt-3 min-h-11 rounded-xl border border-black/15 px-4 font-semibold"
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
                                const style = amenityStyle(facility.pinType);
                                const Icon = style.icon;
                                return (
                                  <button
                                    key={facility.placeId}
                                    data-return-result={facility.placeId}
                                    type="button"
                                    className="flex min-h-16 w-full items-center gap-3 py-3 text-left hover:bg-neutral-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#176346]"
                                    onClick={() =>
                                      selectFacility(facility, "building")
                                    }
                                  >
                                    <span
                                      className="grid size-9 shrink-0 place-items-center rounded-full text-white"
                                      style={{ background: style.color }}
                                    >
                                      <Icon
                                        aria-hidden="true"
                                        className="size-4"
                                      />
                                    </span>
                                    <span className="min-w-0 flex-1">
                                      <strong className="block truncate text-sm">
                                        {facility.name}
                                      </strong>
                                      <span className="text-xs text-neutral-500">
                                        {metadataLabel(
                                          amenityStyle(facility.pinType).label,
                                          accessLabel(facility),
                                        )}
                                      </span>
                                    </span>
                                  </button>
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
                  ) : null}
                </div>
              </>
            ) : null}
          </div>
        ) : null}
      </section>
    </main>
  );
}
