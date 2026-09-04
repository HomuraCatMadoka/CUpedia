import {
  campusMapPinTypeStyle,
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
import {
  pinTypeMarkerContent,
  type CampusMapPinType,
} from "@/lib/campus-map/canonical-marker";

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
      kind: "amenity";
      amenity: CampusMapPinType;
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

type MarkerTarget = MarkerIdentity & { position: CampusMapAmapPosition };

function scheduleAfterProviderEvents(callback: () => void) {
  if (typeof requestAnimationFrame === "function") {
    const frame = requestAnimationFrame(callback);
    return () => cancelAnimationFrame(frame);
  }
  const timeout = setTimeout(callback, 0);
  return () => clearTimeout(timeout);
}

function pinTypeMarkerKey(marker: CampusMapBrowseMarker) {
  return marker.kind === "place"
    ? campusMapAmapPlacePositionKey(marker.placeId)
    : `${campusMapAmapBuildingPositionKey(marker.buildingId)}:${marker.pinType}`;
}

function markerContainsPlace(marker: CampusMapBrowseMarker, placeId: string) {
  return marker.kind === "place"
    ? marker.placeId === placeId
    : marker.placeIds.includes(placeId);
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

function pinTypeMarkerView(
  marker: CampusMapBrowseMarker,
  projection: CampusMapBrowseProjection,
  buildingDisplay: CampusMapBuildingDisplayProjection,
) {
  const style = campusMapPinTypeStyle(marker.pinType);
  if (marker.kind === "place") {
    const place = projection.places.find(
      (candidate) => candidate.placeId === marker.placeId,
    );
    if (!place) return null;
    return {
      markerKey: pinTypeMarkerKey(marker),
      name: place.name,
      buildingName: "校内地点",
      floorLabel:
        marker.position.precision === "precise" ? "精确位置" : "约略位置",
      pinType: marker.pinType,
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
  return {
    markerKey: pinTypeMarkerKey(marker),
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
    pinType: marker.pinType,
    color: style.color,
    markerLabel: `${buildingLabel(building, buildingDisplay)}有 ${markerPlaces.length} 个${style.label}，建筑位置参考`,
  };
}

function markerTargets(input: {
  projection: CampusMapBrowseProjection;
  providerPositions: Readonly<Record<string, CampusMapAmapPosition>>;
  mode: Extract<CampusMapCanonicalBrowseMode, { kind: "amenity" }>;
}) {
  return input.projection.markers.flatMap((marker): MarkerTarget[] => {
    if (
      marker.pinType !== input.mode.amenity ||
      (input.mode.selectedPlaceId &&
        !markerContainsPlace(marker, input.mode.selectedPlaceId))
    ) {
      return [];
    }
    const position =
      marker.kind === "place"
        ? input.providerPositions[campusMapAmapPlacePositionKey(marker.placeId)]
        : input.providerPositions[
            campusMapAmapBuildingPositionKey(marker.buildingId)
          ];
    return position
      ? [
          {
            key: pinTypeMarkerKey(marker),
            marker,
            position,
          },
        ]
      : [];
  });
}

function isTargetSelected(
  target: MarkerIdentity,
  selectedPlaceId: string | null,
) {
  return Boolean(
    selectedPlaceId && markerContainsPlace(target.marker, selectedPlaceId),
  );
}

function targetContent(
  target: MarkerIdentity,
  projection: CampusMapBrowseProjection,
  buildingDisplay: CampusMapBuildingDisplayProjection,
  selected: boolean,
) {
  const view = pinTypeMarkerView(target.marker, projection, buildingDisplay);
  return view ? pinTypeMarkerContent({ ...view, selected }) : null;
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
      .map(({ key, position }) => `${key}:${providerPositionKey(position)}`)
      .join("|");
    if (
      this.cluster &&
      (this.projection !== input.projection ||
        this.dataSignature !== dataSignature)
    ) {
      this.clearMarkers();
    }

    const buildingDisplay = projectCampusMapBuildingDisplay(
      input.projection.buildings,
    );
    const targetsByKey = new Map(targets.map((target) => [target.key, target]));
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
                const current = targetsByKey.get(target!.key);
                if (!current) return;
                if (current.marker.kind === "place") {
                  this.activateCanonicalTarget({
                    type: "OPEN_PLACE",
                    placeId: current.marker.placeId,
                  });
                } else if (current.marker.placeIds.length === 1) {
                  this.activateCanonicalTarget({
                    type: "OPEN_PLACE",
                    placeId: current.marker.placeIds[0]!,
                  });
                } else {
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
              const color = campusMapPinTypeStyle(mode.amenity).color;
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
      this.syncSelection(input.projection, mode);
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
  }

  private syncSelection(
    projection: CampusMapBrowseProjection,
    mode: Extract<CampusMapCanonicalBrowseMode, { kind: "amenity" }>,
  ) {
    const buildingDisplay = projectCampusMapBuildingDisplay(
      projection.buildings,
    );
    const targets = new Map<string, MarkerIdentity>();
    for (const marker of projection.markers) {
      const key = pinTypeMarkerKey(marker);
      targets.set(key, { key, marker });
    }

    for (const [key, marker] of this.markers) {
      const target = targets.get(key);
      if (!target) continue;
      const selected = isTargetSelected(target, mode.selectedPlaceId);
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
