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
  highlightedBuildingIds?: readonly string[];
  selectedBuildingId?: string | null;
  claimProviderTarget(action: () => void): void;
  selectBuilding(buildingId: string): void;
}

type BuildingPickerMarkerPriority = "default" | "search" | "selected";

interface BuildingPickerMarkerEntry {
  buildingId: string;
  name: string;
  priority: BuildingPickerMarkerPriority;
  marker: ProviderMarker;
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function buildingPickerMarkerContent(
  name: string,
  priority: BuildingPickerMarkerPriority,
) {
  const label = escapeHtml(name);
  const isSelected = priority === "selected";
  const isPrioritized = priority !== "default";
  const marker = isPrioritized
    ? `<span aria-hidden="true" class="grid size-8 place-items-center rounded-full border-[3px] border-white bg-[#174b38] text-[11px] font-bold text-white shadow-md${isSelected ? " ring-2 ring-[#176346]/30" : ""}">建</span>`
    : '<span aria-hidden="true" class="size-3 rounded-full border-2 border-white bg-[#487463] shadow-sm"></span>';
  const labelVisibility = isPrioritized
    ? "opacity-100"
    : "opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100";
  return `<button type="button" title="${label}" data-cupedia-marker data-campus-map-building-picker data-building-priority="${priority}" aria-label="选择${label}作为所属建筑" aria-pressed="${isSelected}" class="group relative grid size-11 cursor-pointer place-items-center rounded-full bg-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#176346]/30">${marker}<span aria-hidden="true" class="pointer-events-none absolute top-1/2 left-full ml-1.5 max-w-48 -translate-y-1/2 truncate rounded-lg border border-black/10 bg-white px-2.5 py-1.5 text-left text-[13px] leading-5 font-semibold whitespace-nowrap text-[#174b38] ${labelVisibility} shadow-md transition-opacity motion-reduce:transition-none">${label}</span></button>`;
}

function markerPriority(
  buildingId: string,
  selectedBuildingId: string | null,
  highlightedBuildingIds: ReadonlySet<string>,
): BuildingPickerMarkerPriority {
  if (buildingId === selectedBuildingId) return "selected";
  if (highlightedBuildingIds.has(buildingId)) return "search";
  return "default";
}

function markerZIndex(priority: BuildingPickerMarkerPriority) {
  return priority === "selected" ? 280 : priority === "search" ? 260 : 220;
}

export class AmapBuildingPickerRuntime {
  private map: ProviderMap | null = null;
  private entries: BuildingPickerMarkerEntry[] = [];
  private signature: string | null = null;

  destroy() {
    if (this.map && this.entries.length > 0) {
      try {
        this.map.remove(this.entries.map((entry) => entry.marker));
      } catch {
        // Provider cleanup must not break the search fallback.
      }
    }
    this.map = null;
    this.entries = [];
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
    const highlightedBuildingIds = new Set(input.highlightedBuildingIds ?? []);
    const selectedBuildingId = input.selectedBuildingId ?? null;

    if (this.map === input.map && this.signature === signature) {
      try {
        for (const entry of this.entries) {
          const priority = markerPriority(
            entry.buildingId,
            selectedBuildingId,
            highlightedBuildingIds,
          );
          if (priority === entry.priority) continue;
          entry.marker.setContent(
            buildingPickerMarkerContent(entry.name, priority),
          );
          entry.marker.setzIndex(markerZIndex(priority));
          entry.priority = priority;
        }
      } catch {
        this.destroy();
      }
      return;
    }
    this.destroy();

    const entries: BuildingPickerMarkerEntry[] = [];
    try {
      for (const target of targets) {
        const priority = markerPriority(
          target.buildingId,
          selectedBuildingId,
          highlightedBuildingIds,
        );
        const zIndex = markerZIndex(priority);
        const content = buildingPickerMarkerContent(target.name, priority);
        const marker = new input.provider.Marker({
          position: target.position,
          content,
          anchor: "bottom-center",
          zIndex,
        });
        marker.setContent(content);
        marker.setzIndex(zIndex);
        marker.on("click", () => {
          input.claimProviderTarget(() =>
            input.selectBuilding(target.buildingId),
          );
        });
        entries.push({
          buildingId: target.buildingId,
          name: target.name,
          priority,
          marker,
        });
      }
      if (entries.length > 0) {
        input.map.add(entries.map((entry) => entry.marker));
      }
      this.map = input.map;
      this.entries = entries;
      this.signature = signature;
    } catch {
      if (entries.length > 0) {
        try {
          input.map.remove(entries.map((entry) => entry.marker));
        } catch {
          // Best-effort cleanup for a partially mounted provider overlay.
        }
      }
      this.map = null;
      this.entries = [];
      this.signature = null;
    }
  }
}
