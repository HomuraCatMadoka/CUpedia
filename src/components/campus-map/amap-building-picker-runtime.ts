import {
  campusMapBuildingDisplayFor,
  projectCampusMapBuildingDisplay,
} from "@/lib/campus-map/building-display";
import type { CampusMapAmapPosition } from "@/lib/campus-map/amap-position";
import type { CampusMapBrowseProjection } from "@/lib/campus-map/browse-projection";

interface ProviderMarker {
  on(event: string, handler: () => void): void;
  getPosition(): { lng: number; lat: number } | null;
  setContent(content: string): void;
  setzIndex(zIndex: number): void;
}

interface ProviderMap {
  add(overlays: ProviderMarker | readonly ProviderMarker[]): void;
  remove(overlays: readonly ProviderMarker[]): void;
}

interface ProviderNamespace {
  Marker: new (options: Record<string, unknown>) => ProviderMarker;
}

export interface AmapBuildingPickerRuntimeInput {
  map: ProviderMap;
  provider: ProviderNamespace;
  projection: CampusMapBrowseProjection;
  providerPositions: Readonly<Record<string, CampusMapAmapPosition>>;
  scope: string;
  claimProviderTarget(action: () => void): void;
  selectBuilding(buildingId: string): void;
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

export function buildingPickerMarkerContent(name: string) {
  const label = escapeHtml(name);
  return `<button type="button" title="${label}" data-cupedia-marker data-campus-map-building-picker aria-label="选择${label}作为所属建筑" style="display:grid;width:42px;height:42px;place-items:center;border:3px solid #fff;border-radius:9999px;background:#174b38;color:#fff;box-shadow:0 4px 14px rgba(23,33,28,.28);font:700 14px/1 system-ui,-apple-system,sans-serif;cursor:pointer">建</button>`;
}

export class AmapBuildingPickerRuntime {
  private map: ProviderMap | null = null;
  private markers: ProviderMarker[] = [];
  private signature: string | null = null;

  destroy() {
    if (this.map && this.markers.length > 0) this.map.remove(this.markers);
    this.map = null;
    this.markers = [];
    this.signature = null;
  }

  sync(input: AmapBuildingPickerRuntimeInput) {
    const display = projectCampusMapBuildingDisplay(input.projection.buildings);
    const targets = input.projection.buildings.flatMap((building) => {
      const position =
        input.providerPositions[`building:${building.buildingId}`];
      if (!position) return [];
      return [
        {
          buildingId: building.buildingId,
          name:
            campusMapBuildingDisplayFor(display, building.buildingId)?.label ??
            building.name,
          position,
        },
      ];
    });
    const signature = JSON.stringify([
      input.scope,
      targets.map(({ buildingId, name, position }) => [
        buildingId,
        name,
        position[0],
        position[1],
      ]),
    ]);
    if (this.map === input.map && this.signature === signature) return;
    this.destroy();

    const markers = targets.map((target) => {
      const content = buildingPickerMarkerContent(target.name);
      const marker = new input.provider.Marker({
        position: target.position,
        content,
        anchor: "bottom-center",
        zIndex: 240,
      });
      marker.setContent(content);
      marker.setzIndex(240);
      marker.on("click", () => {
        input.claimProviderTarget(() =>
          input.selectBuilding(target.buildingId),
        );
      });
      return marker;
    });
    if (markers.length > 0) input.map.add(markers);
    this.map = input.map;
    this.markers = markers;
    this.signature = signature;
  }
}
