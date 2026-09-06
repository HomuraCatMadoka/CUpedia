import {
  campusMapPlaceTypeStyle,
  campusMapFloorLabel,
} from "@/components/campus-map/browse-card-presentation";

import {
  campusMapAmapBuildingPositionKey,
  campusMapAmapPlacePositionKey,
} from "@/lib/campus-map/amap-browse-projection";
import {
  asAmapPosition,
  type CampusMapAmapPosition,
} from "@/lib/campus-map/amap-position";
import type { CampusMapProviderHotspotInput } from "@/lib/campus-map/provider-hotspot";
import type {
  CampusMapBrowseBuilding,
  CampusMapBrowseMarker,
  CampusMapBrowseProjection,
} from "@/lib/campus-map/browse-projection";
import {
  campusMapBuildingDisplayFor,
  projectCampusMapBuildingDisplay,
  type CampusMapBuildingDisplayProjection,
} from "@/lib/campus-map/building-display";
import { placeTypeMarkerContent } from "@/lib/campus-map/canonical-marker";

interface ProviderLngLat {
  lng: number;
  lat: number;
}

interface ProviderMarker {
  on(event: string, handler: () => void): void;
  getPosition(): ProviderLngLat | null;
  setContent(content: string): void;
  setzIndex(zIndex: number): void;
}

interface ProviderClusterEvent {
  clusterData?: ReadonlyArray<{
    lnglat: ProviderLngLat | CampusMapAmapPosition;
  }>;
}

interface ProviderMarkerCluster {
  on(event: string, handler: (event: ProviderClusterEvent) => void): void;
  setMap(map: null): void;
}

interface ProviderMapLike {
  on(event: string, handler: (event: ProviderMapEvent) => void): void;
  off(event: string, handler: (event: ProviderMapEvent) => void): void;
}

interface ProviderMapEvent {
  id?: string;
  name?: string;
}

interface ProviderNamespace<ProviderMap extends ProviderMapLike> {
  MarkerCluster: new (
    map: ProviderMap,
    data: readonly Record<string, unknown>[],
    options: Record<string, unknown>,
  ) => ProviderMarkerCluster;
}

export type CampusMapCanonicalBrowseMode =
  | { kind: "hidden" }
  | {
      kind: "places";
      placeIds: readonly string[];
      selectedPlaceId: string | null;
    };

export type CampusMapCanonicalBrowseIntent =
  | { type: "OPEN_BUILDING"; buildingId: string }
  | { type: "OPEN_PLACE"; placeId: string }
  | { type: "FIT_CLUSTER"; positions: readonly CampusMapAmapPosition[] }
  | { type: "DISMISS" };

export interface AmapCanonicalBrowseLayerInput<
  ProviderMap extends ProviderMapLike,
> {
  map: ProviderMap;
  provider: ProviderNamespace<ProviderMap>;
  onIntent(intent: CampusMapCanonicalBrowseIntent): void;
  onHotspot(hotspot: CampusMapProviderHotspotInput): void;
}

export interface AmapCanonicalBrowseRenderInput {
  projection: CampusMapBrowseProjection;
  providerPositions: Readonly<Record<string, CampusMapAmapPosition>>;
  mode: CampusMapCanonicalBrowseMode;
}

type MarkerIdentity = {
  key: string;
  marker: CampusMapBrowseMarker;
};

type MarkerTarget = MarkerIdentity & {
  position: CampusMapAmapPosition;
  visiblePlaceIds: readonly string[];
};

function scheduleAfterProviderEvents(callback: () => void) {
  if (typeof requestAnimationFrame === "function") {
    const frame = requestAnimationFrame(callback);
    return () => cancelAnimationFrame(frame);
  }
  const timeout = setTimeout(callback, 0);
  return () => clearTimeout(timeout);
}

function placeTypeMarkerKey(marker: CampusMapBrowseMarker) {
  return marker.kind === "place"
    ? campusMapAmapPlacePositionKey(marker.placeId)
    : `${campusMapAmapBuildingPositionKey(marker.buildingId)}:${marker.placeType}`;
}

function providerPositionKey(position: ProviderLngLat | CampusMapAmapPosition) {
  const longitude = "lng" in position ? position.lng : position[0];
  const latitude = "lat" in position ? position.lat : position[1];
  return `${longitude.toFixed(12)}:${latitude.toFixed(12)}`;
}

function buildingLabel(
  building: CampusMapBrowseBuilding,
  display: CampusMapBuildingDisplayProjection,
) {
  return (
    campusMapBuildingDisplayFor(display, building.buildingId)?.label ??
    building.name
  );
}

function placeTypeMarkerView(
  target: MarkerTarget,
  projection: CampusMapBrowseProjection,
  buildingDisplay: CampusMapBuildingDisplayProjection,
) {
  const marker = target.marker;
  const style = campusMapPlaceTypeStyle(marker.placeType);
  if (marker.kind === "place") {
    const place = projection.places.find(
      (candidate) => candidate.placeId === marker.placeId,
    );
    if (!place) return null;
    return {
      markerKey: placeTypeMarkerKey(marker),
      name: place.name,
      buildingName: "校内地点",
      floorLabel:
        marker.position.precision === "precise" ? "精确位置" : "约略位置",
      placeType: marker.placeType,
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
  const markerPlaces = target.visiblePlaceIds.flatMap((placeId) => {
    const place = projection.places.find(
      (candidate) => candidate.placeId === placeId,
    );
    return place ? [place] : [];
  });
  if (markerPlaces.length === 0) return null;
  return {
    markerKey: placeTypeMarkerKey(marker),
    name:
      markerPlaces.length === 1
        ? markerPlaces[0]!.name
        : `${markerPlaces.length} 个${style.label}`,
    buildingName: buildingLabel(building, buildingDisplay),
    floorLabel:
      markerPlaces.length === 1
        ? campusMapFloorLabel(
            markerPlaces[0]!.floorId,
            markerPlaces[0]!.floorLabel,
          )
        : `${markerPlaces.length} 个地点`,
    placeType: marker.placeType,
    color: style.color,
    markerLabel: `${buildingLabel(building, buildingDisplay)}有 ${markerPlaces.length} 个${style.label}，建筑位置参考`,
  };
}

function markerTargets(input: {
  projection: CampusMapBrowseProjection;
  providerPositions: Readonly<Record<string, CampusMapAmapPosition>>;
  mode: Extract<CampusMapCanonicalBrowseMode, { kind: "places" }>;
}) {
  const visiblePlaceIds = new Set(input.mode.placeIds);
  return input.projection.markers.flatMap((marker): MarkerTarget[] => {
    const matchingPlaceIds =
      marker.kind === "place"
        ? visiblePlaceIds.has(marker.placeId)
          ? [marker.placeId]
          : []
        : marker.placeIds.filter((placeId) => visiblePlaceIds.has(placeId));
    if (matchingPlaceIds.length === 0) return [];
    const position =
      marker.kind === "place"
        ? input.providerPositions[campusMapAmapPlacePositionKey(marker.placeId)]
        : input.providerPositions[
            campusMapAmapBuildingPositionKey(marker.buildingId)
          ];
    return position
      ? [
          {
            key: placeTypeMarkerKey(marker),
            marker,
            position,
            visiblePlaceIds: matchingPlaceIds,
          },
        ]
      : [];
  });
}

function isTargetSelected(
  target: MarkerTarget,
  selectedPlaceId: string | null,
) {
  return Boolean(
    selectedPlaceId && target.visiblePlaceIds.includes(selectedPlaceId),
  );
}

function targetContent(
  target: MarkerTarget,
  projection: CampusMapBrowseProjection,
  buildingDisplay: CampusMapBuildingDisplayProjection,
  selected: boolean,
) {
  const view = placeTypeMarkerView(target, projection, buildingDisplay);
  return view ? placeTypeMarkerContent({ ...view, selected }) : null;
}

/**
 * Owns the complete AMap browse surface: canonical markers, selection styling,
 * and the one-event-cycle distinction between a marker click and a map click.
 */
export class AmapCanonicalBrowseLayer<
  ProviderMap extends ProviderMapLike = ProviderMapLike,
> {
  private cluster: ProviderMarkerCluster | null = null;
  private projection: CampusMapBrowseProjection | null = null;
  private dataSignature: string | null = null;
  private readonly markers = new Map<string, ProviderMarker>();
  private targetsByKey = new Map<string, MarkerTarget>();
  private selectedPlaceId: string | null = null;
  private cancelPendingDismiss: (() => void) | null = null;
  private cancelCompanionClickExpiry: (() => void) | null = null;
  private suppressCompanionMapClick = false;
  private readonly handleMapClick = () => {
    if (this.suppressCompanionMapClick) {
      this.clearCompanionClickSuppression();
      return;
    }
    this.cancelPendingDismiss?.();
    this.cancelPendingDismiss = scheduleAfterProviderEvents(() => {
      this.cancelPendingDismiss = null;
      this.input.onIntent({ type: "DISMISS" });
    });
  };
  private readonly handleHotspotClick = (event: ProviderMapEvent) => {
    this.activateProviderTarget(() => {
      this.input.onHotspot({
        providerObjectId: event.id ?? null,
        name: event.name?.trim() || "高德地图地点",
      });
    });
  };

  constructor(
    private readonly input: AmapCanonicalBrowseLayerInput<ProviderMap>,
  ) {
    input.map.on("click", this.handleMapClick);
    input.map.on("hotspotclick", this.handleHotspotClick);
  }

  render(input: AmapCanonicalBrowseRenderInput) {
    if (input.mode.kind === "hidden") {
      this.cancelPendingDismiss?.();
      this.cancelPendingDismiss = null;
      this.clearCompanionClickSuppression();
      this.clearMarkers();
      return true;
    }

    const mode = input.mode;
    const targets = markerTargets({
      projection: input.projection,
      providerPositions: input.providerPositions,
      mode,
    });
    const dataSignature = targets
      .map(
        ({ key, position, visiblePlaceIds }) =>
          `${key}:${visiblePlaceIds.join(",")}:${providerPositionKey(position)}`,
      )
      .join("|");
    if (
      this.cluster &&
      (this.projection !== input.projection ||
        this.dataSignature !== dataSignature)
    ) {
      this.clearMarkers();
    }
    if (targets.length === 0) {
      this.clearMarkers();
      return true;
    }

    const buildingDisplay = projectCampusMapBuildingDisplay(
      input.projection.buildings,
    );
    const targetsByKey = new Map(targets.map((target) => [target.key, target]));
    this.targetsByKey = targetsByKey;
    this.selectedPlaceId = mode.selectedPlaceId;
    const targetsByPosition = new Map<string, MarkerTarget[]>();
    for (const target of targets) {
      const key = providerPositionKey(target.position);
      const candidates = targetsByPosition.get(key) ?? [];
      candidates.push(target);
      targetsByPosition.set(key, candidates);
    }

    try {
      if (!this.cluster) {
        const assignments = new WeakMap<ProviderMarker, MarkerTarget>();
        const nextTargetIndex = new Map<string, number>();
        const cluster = new this.input.provider.MarkerCluster(
          this.input.map,
          targets.map(({ position }) => ({ lnglat: position })),
          {
            gridSize: 90,
            maxZoom: 18,
            averageCenter: true,
            renderMarker: ({ marker }: { marker: ProviderMarker }) => {
              let target = assignments.get(marker);
              if (!target) {
                const position = marker.getPosition();
                if (!position) return;
                const positionKey = providerPositionKey(position);
                const candidates = targetsByPosition.get(positionKey);
                if (!candidates?.length) return;
                const targetIndex = nextTargetIndex.get(positionKey) ?? 0;
                target = candidates[targetIndex % candidates.length];
                nextTargetIndex.set(positionKey, targetIndex + 1);
                assignments.set(marker, target);
              }
              const content = targetContent(
                target,
                input.projection,
                buildingDisplay,
                isTargetSelected(target, mode.selectedPlaceId),
              );
              if (!content) return;
              this.markers.set(target.key, marker);
              marker.setContent(content);
              marker.on("click", () => {
                const current = this.targetsByKey.get(target!.key);
                if (!current) return;
                const selectedPlaceId = this.selectedPlaceId;
                const directPlaceId =
                  selectedPlaceId &&
                  current.visiblePlaceIds.includes(selectedPlaceId)
                    ? selectedPlaceId
                    : current.visiblePlaceIds.length === 1
                      ? current.visiblePlaceIds[0]!
                      : null;
                if (directPlaceId) {
                  this.activateCanonicalTarget({
                    type: "OPEN_PLACE",
                    placeId: directPlaceId,
                  });
                } else if (current.marker.kind === "building-presence") {
                  this.activateCanonicalTarget({
                    type: "OPEN_BUILDING",
                    buildingId: current.marker.buildingId,
                  });
                }
              });
            },
            renderClusterMarker: ({
              count,
              marker,
            }: {
              count: number;
              marker: ProviderMarker;
            }) => {
              const firstPlaceType = targets[0]?.marker.placeType;
              const color =
                firstPlaceType &&
                targets.every(
                  (target) => target.marker.placeType === firstPlaceType,
                )
                  ? campusMapPlaceTypeStyle(firstPlaceType).color
                  : "#174b38";
              marker.setContent(
                `<button type="button" data-cupedia-marker="true" aria-label="${count} 个设施位置" style="display:grid;min-width:46px;height:46px;place-items:center;border:3px solid white;border-radius:999px;background:${color};color:white;font:700 14px system-ui;box-shadow:0 3px 12px rgba(0,0,0,.22);padding:0 12px">${count}</button>`,
              );
            },
          },
        );
        cluster.on("click", (event) => {
          const positions = event.clusterData?.map(({ lnglat }) =>
            "lng" in lnglat ? asAmapPosition([lnglat.lng, lnglat.lat]) : lnglat,
          );
          if (positions?.length) {
            this.activateCanonicalTarget({ type: "FIT_CLUSTER", positions });
          }
        });
        this.cluster = cluster;
        this.projection = input.projection;
        this.dataSignature = dataSignature;
      }
      this.syncSelection(input.projection, targets, mode.selectedPlaceId);
      return true;
    } catch {
      this.clearMarkers();
      return false;
    }
  }

  destroy() {
    this.clearMarkers();
    this.clearCompanionClickSuppression();
    this.cancelPendingDismiss?.();
    this.cancelPendingDismiss = null;
    this.input.map.off("click", this.handleMapClick);
    this.input.map.off("hotspotclick", this.handleHotspotClick);
  }

  private activateCanonicalTarget(intent: CampusMapCanonicalBrowseIntent) {
    this.activateProviderTarget(() => this.input.onIntent(intent));
  }

  private activateProviderTarget(action: () => void) {
    this.cancelPendingDismiss?.();
    this.cancelPendingDismiss = null;
    this.clearCompanionClickSuppression();
    this.suppressCompanionMapClick = true;
    this.cancelCompanionClickExpiry = scheduleAfterProviderEvents(() => {
      this.suppressCompanionMapClick = false;
      this.cancelCompanionClickExpiry = null;
    });
    action();
  }

  private clearCompanionClickSuppression() {
    this.cancelCompanionClickExpiry?.();
    this.cancelCompanionClickExpiry = null;
    this.suppressCompanionMapClick = false;
  }

  private clearMarkers() {
    this.cluster?.setMap(null);
    this.cluster = null;
    this.projection = null;
    this.dataSignature = null;
    this.markers.clear();
    this.targetsByKey.clear();
    this.selectedPlaceId = null;
  }

  private syncSelection(
    projection: CampusMapBrowseProjection,
    visibleTargets: readonly MarkerTarget[],
    selectedPlaceId: string | null,
  ) {
    const buildingDisplay = projectCampusMapBuildingDisplay(
      projection.buildings,
    );
    const targets = new Map(
      visibleTargets.map((target) => [target.key, target]),
    );

    for (const [key, marker] of this.markers) {
      const target = targets.get(key);
      if (!target) continue;
      const selected = isTargetSelected(target, selectedPlaceId);
      const content = targetContent(
        target,
        projection,
        buildingDisplay,
        selected,
      );
      if (!content) continue;
      marker.setzIndex(selected ? 220 : 160);
      marker.setContent(content);
    }
  }
}
