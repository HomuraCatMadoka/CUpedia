import {
  campusMapAmenityStyle,
  campusMapFloorLabel,
} from "@/components/campus-map/browse-card-presentation";

import type {
  CampusMapBrowseMarker,
  CampusMapBrowseProjection,
} from "@/lib/campus-map/browse-projection";
import {
  campusMapBuildingDisplayFor,
  projectCampusMapBuildingDisplay,
  type CampusMapBuildingDisplayProjection,
} from "@/lib/campus-map/building-display";
import {
  facilityMarkerContent,
  type CampusMapAmenity,
} from "@/lib/campus-map/facility-marker";
import type { CampusMapPosition } from "@/lib/campus-map/amap-position";

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
    lnglat: ProviderLngLat | CampusMapPosition;
  }>;
}

interface ProviderMarkerCluster {
  on(event: string, handler: (event: ProviderClusterEvent) => void): void;
  setMap(map: null): void;
}

interface ProviderNamespace<ProviderMap extends object> {
  MarkerCluster: new (
    map: ProviderMap,
    data: readonly Record<string, unknown>[],
    options: Record<string, unknown>,
  ) => ProviderMarkerCluster;
}

export interface AmapFacilityMarkerRuntimeInput<ProviderMap extends object> {
  map: ProviderMap;
  provider: ProviderNamespace<ProviderMap>;
  projection: CampusMapBrowseProjection;
  providerPositions: Readonly<Record<string, CampusMapPosition>>;
  markerScope: string | null;
  visibleAmenity: CampusMapAmenity | null;
  selectedPlaceId: string | null;
  claimProviderTarget(action: () => void): void;
  selectBuilding(buildingId: string): void;
  selectPlace(placeId: string): void;
  fitCluster(positions: readonly CampusMapPosition[]): void;
}

function markerKey(marker: CampusMapBrowseMarker) {
  return marker.kind === "place"
    ? `place:${marker.placeId}`
    : `building:${marker.buildingId}:${marker.pinType}`;
}

function markerContainsPlace(marker: CampusMapBrowseMarker, placeId: string) {
  return marker.kind === "place"
    ? marker.placeId === placeId
    : marker.placeIds.includes(placeId);
}

function providerPositionKey(position: ProviderLngLat | CampusMapPosition) {
  const longitude = "lng" in position ? position.lng : position[0];
  const latitude = "lat" in position ? position.lat : position[1];
  return `${longitude.toFixed(12)}:${latitude.toFixed(12)}`;
}

function markerView(
  marker: CampusMapBrowseMarker,
  projection: CampusMapBrowseProjection,
  buildingDisplay: CampusMapBuildingDisplayProjection,
) {
  const style = campusMapAmenityStyle(marker.pinType);
  if (marker.kind === "place") {
    const place = projection.places.find(
      (candidate) => candidate.placeId === marker.placeId,
    );
    if (!place) return null;
    return {
      id: markerKey(marker),
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
  const buildingName =
    campusMapBuildingDisplayFor(buildingDisplay, building.buildingId)?.label ??
    building.name;
  const markerPlaces = marker.placeIds.flatMap((placeId) => {
    const place = projection.places.find(
      (candidate) => candidate.placeId === placeId,
    );
    return place ? [place] : [];
  });
  if (markerPlaces.length === 0) return null;
  const locationLabel =
    markerPlaces.length === 1
      ? campusMapFloorLabel(
          markerPlaces[0]!.floorId,
          markerPlaces[0]!.floorLabel,
        )
      : `${markerPlaces.length} 个地点`;
  return {
    id: markerKey(marker),
    name:
      markerPlaces.length === 1
        ? markerPlaces[0]!.name
        : `${markerPlaces.length} 个${style.label}`,
    buildingName,
    floorLabel: locationLabel,
    category: marker.pinType,
    color: style.color,
    markerLabel: `${buildingName}有 ${markerPlaces.length} 个${style.label}，建筑位置参考`,
  };
}

export class AmapFacilityMarkerRuntime {
  private cluster: ProviderMarkerCluster | null = null;
  private scope: string | null = null;
  private projection: CampusMapBrowseProjection | null = null;
  private dataSignature: string | null = null;
  private readonly markers = new Map<string, ProviderMarker>();

  destroy() {
    this.cluster?.setMap(null);
    this.cluster = null;
    this.scope = null;
    this.projection = null;
    this.dataSignature = null;
    this.markers.clear();
  }

  sync<ProviderMap extends object>(
    input: AmapFacilityMarkerRuntimeInput<ProviderMap>,
  ) {
    const {
      fitCluster,
      markerScope,
      projection,
      provider,
      providerPositions,
      selectedPlaceId,
      selectBuilding,
      selectPlace,
      visibleAmenity,
    } = input;
    if (!visibleAmenity || !markerScope) {
      this.destroy();
      return true;
    }
    const buildingDisplay = projectCampusMapBuildingDisplay(
      projection.buildings,
    );

    const projectedMarkers = projection.markers.filter(
      (marker) =>
        marker.pinType === visibleAmenity &&
        (!selectedPlaceId || markerContainsPlace(marker, selectedPlaceId)),
    );
    const markerByKey = new Map(
      projectedMarkers.map((marker) => [markerKey(marker), marker]),
    );
    const markerTargets = projectedMarkers.flatMap((marker) => {
      const position =
        marker.kind === "place"
          ? providerPositions[`place:${marker.placeId}`]
          : providerPositions[`building:${marker.buildingId}`];
      if (!position) return [];
      const placeIds = selectedPlaceId
        ? [selectedPlaceId]
        : marker.kind === "place"
          ? [marker.placeId]
          : marker.placeIds;
      return placeIds.map((_, index) => ({
        markerKey: markerKey(marker),
        position,
        showMarker: marker.kind === "place" || index === 0,
      }));
    });
    const data = markerTargets.map(({ position }) => ({ lnglat: position }));
    const dataSignature = markerTargets
      .map(
        ({ markerKey, position, showMarker }) =>
          `${markerKey}:${providerPositionKey(position)}:${showMarker}`,
      )
      .join("|");
    const markerTargetsByPosition = new Map<
      string,
      Array<(typeof markerTargets)[number]>
    >();
    for (const target of markerTargets) {
      const key = providerPositionKey(target.position);
      const targets = markerTargetsByPosition.get(key) ?? [];
      targets.push(target);
      markerTargetsByPosition.set(key, targets);
    }

    if (
      this.cluster &&
      (this.scope !== markerScope ||
        this.projection !== projection ||
        this.dataSignature !== dataSignature)
    ) {
      this.destroy();
    }

    try {
      if (!this.cluster) {
        const style = campusMapAmenityStyle(visibleAmenity);
        const assignments = new WeakMap<
          ProviderMarker,
          (typeof markerTargets)[number]
        >();
        const nextTargetIndex = new Map<string, number>();
        const cluster = new provider.MarkerCluster(input.map, data, {
          gridSize: 90,
          maxZoom: 18,
          averageCenter: true,
          renderMarker: ({ marker }: { marker: ProviderMarker }) => {
            let target = assignments.get(marker);
            if (!target) {
              const position = marker.getPosition();
              if (!position) return;
              const positionKey = providerPositionKey(position);
              const candidates = markerTargetsByPosition.get(positionKey);
              if (!candidates?.length) return;
              const targetIndex = nextTargetIndex.get(positionKey) ?? 0;
              target = candidates[targetIndex % candidates.length];
              nextTargetIndex.set(positionKey, targetIndex + 1);
              assignments.set(marker, target);
            }
            const projectedMarker = markerByKey.get(target.markerKey);
            if (!projectedMarker) return;
            if (!target.showMarker) {
              marker.setContent(
                '<span aria-hidden="true" style="display:none"></span>',
              );
              return;
            }
            const view = markerView(
              projectedMarker,
              projection,
              buildingDisplay,
            );
            if (!view) return;
            this.markers.set(target.markerKey, marker);
            marker.setContent(
              facilityMarkerContent({
                ...view,
                selected: Boolean(
                  selectedPlaceId &&
                  markerContainsPlace(projectedMarker, selectedPlaceId),
                ),
              }),
            );
            marker.on("click", () => {
              input.claimProviderTarget(() => {
                if (projectedMarker.kind === "building-presence") {
                  if (projectedMarker.placeIds.length === 1) {
                    selectPlace(projectedMarker.placeIds[0]!);
                  } else {
                    selectBuilding(projectedMarker.buildingId);
                  }
                  return;
                }
                selectPlace(projectedMarker.placeId);
              });
            });
          },
          renderClusterMarker: ({
            count,
            marker,
          }: {
            count: number;
            marker: ProviderMarker;
          }) => {
            marker.setContent(
              `<button type="button" data-cupedia-marker="true" aria-label="${count} 个${style.label}" style="display:grid;min-width:46px;height:46px;place-items:center;border:3px solid white;border-radius:999px;background:${style.color};color:white;font:700 14px system-ui;box-shadow:0 3px 12px rgba(0,0,0,.22);padding:0 12px">${count}</button>`,
            );
          },
        });
        cluster.on("click", (event) => {
          input.claimProviderTarget(() => {
            const positions = event.clusterData?.map(({ lnglat }) =>
              "lng" in lnglat
                ? ([lnglat.lng, lnglat.lat] as CampusMapPosition)
                : lnglat,
            );
            if (positions?.length) fitCluster(positions);
          });
        });
        this.cluster = cluster;
        this.scope = markerScope;
        this.projection = projection;
        this.dataSignature = dataSignature;
      }
      return true;
    } catch {
      this.destroy();
      return false;
    }
  }

  syncSelection(
    container: HTMLElement | null,
    projection: CampusMapBrowseProjection,
    selectedPlaceId: string | null,
  ) {
    const buildingDisplay = projectCampusMapBuildingDisplay(
      projection.buildings,
    );
    const syncDom = () => {
      container
        ?.querySelectorAll<HTMLElement>("[data-facility-id]")
        .forEach((element) => {
          element.setAttribute(
            "aria-pressed",
            String(
              projection.markers.some(
                (marker) =>
                  markerKey(marker) === element.dataset.facilityId &&
                  selectedPlaceId !== null &&
                  markerContainsPlace(marker, selectedPlaceId),
              ),
            ),
          );
        });
    };
    syncDom();
    const observer = new MutationObserver(syncDom);
    if (container) {
      observer.observe(container, { childList: true, subtree: true });
    }
    for (const projectedMarker of projection.markers) {
      const marker = this.markers.get(markerKey(projectedMarker));
      if (!marker) continue;
      const selected = Boolean(
        selectedPlaceId &&
        markerContainsPlace(projectedMarker, selectedPlaceId),
      );
      const view = markerView(projectedMarker, projection, buildingDisplay);
      if (!view) continue;
      marker.setzIndex(selected ? 220 : 160);
      marker.setContent(facilityMarkerContent({ ...view, selected }));
    }
    return () => observer.disconnect();
  }
}
