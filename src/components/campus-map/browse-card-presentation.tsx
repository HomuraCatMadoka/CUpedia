import {
  DropletsIcon,
  PrinterIcon,
  SchoolIcon,
  ToiletIcon,
  UsersRoundIcon,
} from "lucide-react";

import type { CampusMapBrowsePlace } from "@/lib/campus-map/browse-projection";
import { CAMPUS_MAP_EDIT_SCHEMA } from "@/lib/campus-map/edit-schema";
import type { CampusMapAmenity } from "@/lib/campus-map/facility-marker";
import { cn } from "@/lib/utils";

const CATEGORY_PRESENTATION = {
  toilet: { icon: ToiletIcon, color: "#1b6f55" },
  water: { icon: DropletsIcon, color: "#227a9b" },
  printer: { icon: PrinterIcon, color: "#675aa7" },
  "common-space": { icon: UsersRoundIcon, color: "#9a5b32" },
  classroom: { icon: SchoolIcon, color: "#a33f52" },
} satisfies Record<
  CampusMapAmenity,
  {
    icon: typeof ToiletIcon;
    color: string;
  }
>;

export const CAMPUS_MAP_CATEGORIES = CAMPUS_MAP_EDIT_SCHEMA.presets.map(
  (preset) => ({
    id: preset.pinType,
    label: preset.label,
    ...CATEGORY_PRESENTATION[preset.pinType],
  }),
);

export function campusMapAmenityStyle(category: CampusMapAmenity) {
  return (
    CAMPUS_MAP_CATEGORIES.find((item) => item.id === category) ??
    CAMPUS_MAP_CATEGORIES[0]
  );
}

export function knownCampusMapAmenity(value: string | null) {
  return CAMPUS_MAP_CATEGORIES.find((item) => item.id === value)?.id ?? null;
}

export function campusMapPlaceLocationLabel(place: CampusMapBrowsePlace) {
  switch (place.location.kind) {
    case "outdoor-point":
      return "室外位置";
    case "building":
      return "建筑内";
    case "floor":
      return place.location.floor.displayLabel;
  }
}

export function campusMapFloorLabel(
  floorId: string | null,
  displayLabel?: string | null,
) {
  if (displayLabel) return displayLabel;
  if (!floorId) return "建筑内";
  return floorId.endsWith("/F") ? floorId : `${floorId}/F`;
}

export function CampusMapFacilityResultButton({
  facility,
  metadata,
  variant,
  onSelect,
}: {
  facility: CampusMapBrowsePlace;
  metadata: string;
  variant: "category" | "building" | "preview";
  onSelect: () => void;
}) {
  const style = campusMapAmenityStyle(facility.pinType);
  const Icon = style.icon;
  const showsIcon = variant === "building";
  return (
    <button
      data-building-preview={
        variant === "preview" ? facility.placeId : undefined
      }
      data-return-result={facility.placeId}
      type="button"
      aria-label={
        variant === "preview"
          ? `查看设施：${facility.name}，${campusMapPlaceLocationLabel(facility)}`
          : undefined
      }
      className={cn(
        "flex w-full items-center text-left hover:bg-neutral-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#176346]",
        showsIcon
          ? "min-h-16 gap-3 py-3"
          : "min-h-14 border-b border-black/8 py-2",
      )}
      onClick={onSelect}
    >
      {showsIcon ? (
        <span
          className="grid size-9 shrink-0 place-items-center rounded-full text-white"
          style={{ background: style.color }}
        >
          <Icon aria-hidden="true" className="size-4" />
        </span>
      ) : null}
      <span className="min-w-0 flex-1">
        <strong className="block truncate text-sm">{facility.name}</strong>
        <span className="mt-0.5 block truncate text-xs text-neutral-500">
          {metadata}
        </span>
      </span>
    </button>
  );
}
