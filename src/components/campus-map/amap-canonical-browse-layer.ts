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
import {
  placeClusterMarkerContent,
  placeTypeMarkerContent,
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
    markerKey?: string;
  }>;
}

interface ProviderMarkerCluster {
  on(event: string, handler: (event: ProviderClusterEvent) => void): void;
  setMap(map: null): void;
}

interface ProviderMapLike {
  add(marker: ProviderMarker): void;
  remove(markers: readonly ProviderMarker[]): void;
  on(event: string, handler: (event: ProviderMapEvent) => void): void;
  off(event: string, handler: (event: ProviderMapEvent) => void): void;
}

interface ProviderMapEvent {
  id?: string;
  name?: string;
  lnglat?: ProviderLngLat;
}

interface ProviderNamespace<ProviderMap extends ProviderMapLike> {
  Marker: new (options: Record<string, unknown>) => ProviderMarker;
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
  onHotspot(
    hotspot: CampusMapProviderHotspotInput & {
      providerPosition: CampusMapAmapPosition | null;
    },
  ): void;
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
      precisionLabel:
        marker.position.precision === "precise"
          ? "精确室外位置"
          : "约略室外位置",
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
    count: markerPlaces.length,
    precisionLabel: "所属建筑 · 非室内精确位置",
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
  selectedPlaceId: string | null = null,
) {
  const view = placeTypeMarkerView(target, projection, buildingDisplay);
  if (!view) return null;
  const place = selectedPlaceId
    ? projection.places.find(
        (candidate) => candidate.placeId === selectedPlaceId,
      )
    : null;
  return placeTypeMarkerContent({
    ...view,
    selected,
    ...(selected && place
      ? {
          name: place.name,
          markerLabel: `已选 ${place.name}，${view.buildingName}，${view.precisionLabel}`,
        }
      : {}),
  });
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
  private selectedMarker: ProviderMarker | null = null;
  private selectedMarkerPositionKey: string | null = null;
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
        providerPosition:
          Number.isFinite(event.lnglat?.lng) &&
          Number.isFinite(event.lnglat?.lat)
            ? asAmapPosition([event.lnglat!.lng, event.lnglat!.lat])
            : null,
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
    const visibleTargets = markerTargets({
      projection: input.projection,
      providerPositions: input.providerPositions,
      mode,
    });
    const selectedTarget = visibleTargets.find((target) =>
      isTargetSelected(target, mode.selectedPlaceId),
    );
    // A selected Place stays visible even while its neighbours are clustered.
    const targets = visibleTargets.filter(
      (target) => target !== selectedTarget,
    );
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
    if (visibleTargets.length === 0) {
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
      this.projection = input.projection;
      this.syncSelectedMarker(
        selectedTarget,
        input.projection,
        buildingDisplay,
      );
      if (!this.cluster && targets.length > 0) {
        const assignments = new WeakMap<ProviderMarker, MarkerTarget>();
        const nextTargetIndex = new Map<string, number>();
        const cluster = new this.input.provider.MarkerCluster(
          this.input.map,
          targets.map(({ key, position }) => ({
            lnglat: position,
            markerKey: key,
          })),
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
                if (this.markers.get(target!.key) !== marker) return;
                const current = this.targetsByKey.get(target!.key);
                if (!current) return;
                const directPlaceId =
                  current.visiblePlaceIds.length === 1
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
              marker,
              clusterData,
            }: ProviderClusterEvent & {
              marker: ProviderMarker;
            }) => {
              const members = this.clusterMembers(clusterData);
              const positions = clusterData
                ? new Set(
                    clusterData.map(({ lnglat }) =>
                      providerPositionKey(lnglat),
                    ),
                  )
                : null;
              const firstPlaceType = members?.[0]?.marker.placeType;
              const placeType =
                firstPlaceType &&
                members!.every(
                  (target) => target.marker.placeType === firstPlaceType,
                )
                  ? firstPlaceType
                  : null;
              const style = placeType
                ? campusMapPlaceTypeStyle(placeType)
                : null;
              const placeCount = members
                ? new Set(members.flatMap((member) => member.visiblePlaceIds))
                    .size
                : null;
              const buildingId = members ? this.sameBuilding(members) : null;
              const building = buildingId
                ? input.projection.buildings.find(
                    (candidate) => candidate.buildingId === buildingId,
                  )
                : null;
              const destination = building
                ? `${buildingLabel(building, buildingDisplay)}，打开建筑目录`
                : "放大查看这些位置";
              marker.setContent(
                placeClusterMarkerContent({
                  count: placeCount ?? positions?.size ?? null,
                  measure: placeCount === null ? "位置" : "地点",
                  placeType,
                  color: style?.color ?? "#374151",
                  label: members
                    ? `${placeCount} 个${style?.label ?? "不同类别地点"}，${positions?.size ?? 0} 个地图位置，${destination}`
                    : `${positions?.size ?? "多个"} 个地图位置，地点数量暂不可用，${destination}`,
                }),
              );
            },
          },
        );
        cluster.on("click", (event) => {
          if (this.cluster !== cluster) return;
          const members = this.clusterMembers(event.clusterData);
          const buildingId = members ? this.sameBuilding(members) : null;
          if (buildingId) {
            this.activateCanonicalTarget({ type: "OPEN_BUILDING", buildingId });
            return;
          }
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
    if (this.selectedMarker) this.input.map.remove([this.selectedMarker]);
    this.selectedMarker = null;
    this.selectedMarkerPositionKey = null;
  }

  private clusterMembers(data: ProviderClusterEvent["clusterData"]) {
    if (!data?.length) return null;
    const members: MarkerTarget[] = [];
    for (const item of data) {
      // Only metadata from the canonical input can establish containment.
      const target = item.markerKey
        ? this.targetsByKey.get(item.markerKey)
        : null;
      if (!target) return null;
      members.push(target);
    }
    return members;
  }

  private sameBuilding(members: readonly MarkerTarget[]) {
    const buildingIds = members.map((target) => {
      const marker = target.marker;
      return marker.kind === "building-presence"
        ? marker.buildingId
        : this.projection?.places.find(
            (place) => place.placeId === marker.placeId,
          )?.buildingId;
    });
    const buildingId = buildingIds[0];
    return buildingId && buildingIds.every((id) => id === buildingId)
      ? buildingId
      : null;
  }

  private syncSelectedMarker(
    target: MarkerTarget | undefined,
    projection: CampusMapBrowseProjection,
    display: CampusMapBuildingDisplayProjection,
  ) {
    const positionKey = target
      ? `${target.key}:${providerPositionKey(target.position)}`
      : null;
    if (this.selectedMarker && this.selectedMarkerPositionKey !== positionKey) {
      this.input.map.remove([this.selectedMarker]);
      this.selectedMarker = null;
    }
    this.selectedMarkerPositionKey = positionKey;
    if (!target) return;
    if (!this.selectedMarker) {
      const marker = new this.input.provider.Marker({
        position: target.position,
        anchor: "center",
        zIndex: 240,
      });
      marker.on("click", () => {
        if (this.selectedMarker !== marker) return;
        if (this.selectedPlaceId)
          this.activateCanonicalTarget({
            type: "OPEN_PLACE",
            placeId: this.selectedPlaceId,
          });
      });
      this.selectedMarker = marker;
      this.input.map.add(marker);
    }
    const content = targetContent(
      target,
      projection,
      display,
      true,
      this.selectedPlaceId,
    );
    if (content) this.selectedMarker.setContent(content);
    this.selectedMarker.setzIndex(240);
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
