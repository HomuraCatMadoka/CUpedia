import {
  campusMapBuildingDisplayFor,
  projectCampusMapBuildingDisplay,
} from "@/lib/campus-map/building-display";
import type { CampusMapAmapPosition } from "@/lib/campus-map/amap-position";
import type { CampusMapBrowseProjection } from "@/lib/campus-map/browse-projection";

interface ProviderMarker {
  on(event: string, handler: () => void): void;
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

function buildingPickerMarkerContent(name: string) {
  const label = escapeHtml(name);
  return `<button type="button" title="${label}" data-cupedia-marker data-campus-map-building-picker aria-label="选择${label}作为所属建筑" class="group relative grid size-11 cursor-pointer place-items-center rounded-full border-[3px] border-white bg-[#174b38] text-white shadow-[0_4px_14px_rgba(23,33,28,.28)] transition-transform hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#176346]/30 motion-reduce:transform-none motion-reduce:transition-none"><span aria-hidden="true" class="text-xs font-bold">建</span><span aria-hidden="true" class="pointer-events-none absolute top-1/2 left-full ml-2 max-w-40 -translate-y-1/2 truncate rounded-lg border border-black/10 bg-white px-2.5 py-1.5 text-left text-[13px] leading-5 font-semibold whitespace-nowrap text-[#174b38] opacity-0 shadow-[0_4px_14px_rgba(23,33,28,.24)] transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 motion-reduce:transition-none">${label}</span></button>`;
}

export class AmapBuildingPickerRuntime {
  private map: ProviderMap | null = null;
  private markers: ProviderMarker[] = [];
  private signature: string | null = null;

  destroy() {
    if (this.map && this.markers.length > 0) {
      try {
        this.map.remove(this.markers);
      } catch {
        // Provider cleanup must not break the search fallback.
      }
    }
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

    const markers: ProviderMarker[] = [];
    try {
      for (const target of targets) {
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
        markers.push(marker);
      }
      if (markers.length > 0) input.map.add(markers);
      this.map = input.map;
      this.markers = markers;
      this.signature = signature;
    } catch {
      if (markers.length > 0) {
        try {
          input.map.remove(markers);
        } catch {
          // Best-effort cleanup for a partially mounted provider overlay.
        }
      }
      this.map = null;
      this.markers = [];
      this.signature = null;
    }
  }
}
