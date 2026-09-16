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

interface ProviderClusterPoint {
  lnglat: ProviderLngLat | CampusMapAmapPosition;
}

interface ProviderClusterClickEvent {
  marker?: ReadonlyArray<ProviderClusterPoint>;
}

interface ProviderMarkerCluster {
  on(event: string, handler: (event: ProviderClusterClickEvent) => void): void;
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

type CanonicalPositionGroup = {
  key: string;
  position: CampusMapAmapPosition;
  targets: readonly MarkerTarget[];
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

function groupMarkerTargetsByPosition(
  targets: readonly MarkerTarget[],
): CanonicalPositionGroup[] {
  const groups = new Map<string, MarkerTarget[]>();
  for (const target of targets) {
    const key = providerPositionKey(target.position);
    const members = groups.get(key) ?? [];
    members.push(target);
    groups.set(key, members);
  }
  return [...groups].map(([key, members]) => ({
    key,
    position: members[0]!.position,
    targets: members,
  }));
}

function commonPlaceType(targets: readonly MarkerTarget[]) {
  const firstPlaceType = targets[0]?.marker.placeType;
  return firstPlaceType &&
    targets.every((target) => target.marker.placeType === firstPlaceType)
    ? firstPlaceType
    : null;
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
  private positionGroups = new Map<string, CanonicalPositionGroup>();
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
    const positionGroups = groupMarkerTargetsByPosition(targets);
    this.positionGroups = new Map(
      positionGroups.map((group) => [group.key, group]),
    );
    this.selectedPlaceId = mode.selectedPlaceId;

    try {
      this.projection = input.projection;
      this.syncSelectedMarker(
        selectedTarget,
        input.projection,
        buildingDisplay,
      );
      if (!this.cluster && targets.length > 0) {
        const cluster = new this.input.provider.MarkerCluster(
          this.input.map,
          positionGroups.map(({ position }) => ({
            lnglat: position,
          })),
          {
            gridSize: 90,
            maxZoom: 18,
            averageCenter: true,
            renderMarker: ({ marker }: { marker: ProviderMarker }) => {
              const position = marker.getPosition();
              if (!position) return;
              const group = this.positionGroups.get(
                providerPositionKey(position),
              );
              if (!group) return;
              const content = this.positionGroupContent(
                group,
                input.projection,
                buildingDisplay,
                mode.selectedPlaceId,
              );
              if (!content) return;
              this.markers.set(group.key, marker);
              marker.setContent(content);
              marker.on("click", () => {
                if (this.markers.get(group.key) !== marker) return;
                const current = this.positionGroups.get(group.key);
                if (!current) return;
                this.activatePositionGroup(current);
              });
            },
            renderClusterMarker: ({
              count,
              marker,
            }: {
              count: number;
              marker: ProviderMarker;
            }) => {
              const placeType = commonPlaceType(targets);
              const style = placeType
                ? campusMapPlaceTypeStyle(placeType)
                : null;
              marker.setContent(
                placeClusterMarkerContent({
                  count,
                  measure: "位置",
                  placeType,
                  color: style?.color ?? "#374151",
                  label: `${count} 个地图位置${style ? `，类别：${style.label}` : ""}，放大查看这些位置`,
                }),
              );
            },
          },
        );
        cluster.on("click", (event) => {
          if (this.cluster !== cluster) return;
          const groups = this.clusterGroups(event.marker);
          if (!groups) return;
          const members = groups.flatMap((group) => group.targets);
          const buildingId = this.sameBuilding(members);
          if (buildingId) {
            this.activateCanonicalTarget({ type: "OPEN_BUILDING", buildingId });
            return;
          }
          this.activateCanonicalTarget({
            type: "FIT_CLUSTER",
            positions: groups.map((group) => group.position),
          });
        });
        this.cluster = cluster;
        this.projection = input.projection;
        this.dataSignature = dataSignature;
      }
      this.syncSelection(
        input.projection,
        positionGroups,
        mode.selectedPlaceId,
      );
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
    this.positionGroups.clear();
    this.selectedPlaceId = null;
    if (this.selectedMarker) this.input.map.remove([this.selectedMarker]);
    this.selectedMarker = null;
    this.selectedMarkerPositionKey = null;
  }

  private clusterGroups(points: ProviderClusterClickEvent["marker"]) {
    if (!points?.length) return null;
    const groups: CanonicalPositionGroup[] = [];
    const seen = new Set<string>();
    for (const point of points) {
      const key = providerPositionKey(point.lnglat);
      if (seen.has(key)) continue;
      const group = this.positionGroups.get(key);
      // Coordinates only find a group we created from canonical membership;
      // they never establish a new Place-to-Building relationship.
      if (!group) return null;
      seen.add(key);
      groups.push(group);
    }
    return groups;
  }

  private positionGroupContent(
    group: CanonicalPositionGroup,
    projection: CampusMapBrowseProjection,
    display: CampusMapBuildingDisplayProjection,
    selectedPlaceId: string | null,
  ) {
    if (group.targets.length === 1) {
      const target = group.targets[0]!;
      return targetContent(
        target,
        projection,
        display,
        isTargetSelected(target, selectedPlaceId),
      );
    }
    const placeType = commonPlaceType(group.targets);
    const style = placeType ? campusMapPlaceTypeStyle(placeType) : null;
    const placeCount = new Set(
      group.targets.flatMap((target) => target.visiblePlaceIds),
    ).size;
    const buildingId = this.sameBuilding(group.targets);
    const building = buildingId
      ? projection.buildings.find(
          (candidate) => candidate.buildingId === buildingId,
        )
      : null;
    const destination = building
      ? `${buildingLabel(building, display)}，打开建筑目录`
      : "放大查看这个地图位置";
    return placeClusterMarkerContent({
      count: placeCount,
      measure: "地点",
      placeType,
      color: style?.color ?? "#374151",
      label: `${placeCount} 个${style?.label ?? "不同类别地点"}，1 个地图位置，${destination}`,
    });
  }

  private activatePositionGroup(group: CanonicalPositionGroup) {
    const placeIds = new Set(
      group.targets.flatMap((target) => target.visiblePlaceIds),
    );
    if (placeIds.size === 1) {
      this.activateCanonicalTarget({
        type: "OPEN_PLACE",
        placeId: [...placeIds][0]!,
      });
      return;
    }
    const buildingId = this.sameBuilding(group.targets);
    if (buildingId) {
      this.activateCanonicalTarget({ type: "OPEN_BUILDING", buildingId });
      return;
    }
    this.activateCanonicalTarget({
      type: "FIT_CLUSTER",
      positions: [group.position],
    });
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
    visibleGroups: readonly CanonicalPositionGroup[],
    selectedPlaceId: string | null,
  ) {
    const buildingDisplay = projectCampusMapBuildingDisplay(
      projection.buildings,
    );
    const groups = new Map(visibleGroups.map((group) => [group.key, group]));

    for (const [key, marker] of this.markers) {
      const group = groups.get(key);
      if (!group) continue;
      const content = this.positionGroupContent(
        group,
        projection,
        buildingDisplay,
        selectedPlaceId,
      );
      if (!content) continue;
      marker.setzIndex(160);
      marker.setContent(content);
    }
  }
}
