import {
  DropletsIcon,
  DumbbellIcon,
  HeartPulseIcon,
  PrinterIcon,
  SchoolIcon,
  StoreIcon,
  ToiletIcon,
  UsersRoundIcon,
} from "lucide-react";
import Image from "next/image";

import type { CampusMapBrowsePlace } from "@/lib/campus-map/browse-projection";
import {
  campusMapPlaceTypeLabel,
  CAMPUS_MAP_DISPLAY_REGISTRY,
} from "@/lib/campus-map/display-registry";
import type { CampusMapPlaceType } from "@/lib/campus-map/place-type-contract";
import type { CampusMapPlaceFeedbackSummary } from "@/lib/campus-map/place-feedback";
import type { CampusMapPlacePhotoView } from "@/lib/campus-map/place-photos-contract";
import { cn } from "@/lib/utils";

const PLACE_TYPE_PRESENTATION = {
  toilet: { icon: ToiletIcon, color: "#1b6f55" },
  water: { icon: DropletsIcon, color: "#227a9b" },
  printer: { icon: PrinterIcon, color: "#675aa7" },
  "common-space": { icon: UsersRoundIcon, color: "#9a5b32" },
  classroom: { icon: SchoolIcon, color: "#a33f52" },
  "sports-facility": { icon: DumbbellIcon, color: "#b25b25" },
  "health-service": { icon: HeartPulseIcon, color: "#b33d5c" },
  "vending-machine": { icon: StoreIcon, color: "#5f6f3c" },
} satisfies Record<
  CampusMapPlaceType,
  {
    icon: typeof ToiletIcon;
    color: string;
  }
>;

export const CAMPUS_MAP_CATEGORIES =
  CAMPUS_MAP_DISPLAY_REGISTRY.browseCategories.map((placeType) =>
    campusMapPlaceTypeStyle(placeType),
  );

export function campusMapPlaceTypeStyle(placeType: CampusMapPlaceType) {
  return {
    id: placeType,
    label: campusMapPlaceTypeLabel(placeType),
    ...PLACE_TYPE_PRESENTATION[placeType],
  };
}

export function knownCampusMapBrowseCategory(value: string | null) {
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

export function campusMapFeedbackSummaryLabel(
  summary: CampusMapPlaceFeedbackSummary | undefined,
) {
  if (!summary || summary.averageRating === null || summary.ratingCount === 0) {
    return "暂无评分";
  }
  return `${summary.averageRating.toFixed(1)} 分 · ${summary.ratingCount} 个评分 · ${summary.reviewCount} 条评价`;
}

export function CampusMapFacilityResultButton({
  facility,
  location,
  summary,
  coverPhoto,
  variant,
  onSelect,
}: {
  facility: CampusMapBrowsePlace;
  location: string;
  summary: string;
  coverPhoto?: CampusMapPlacePhotoView | null;
  variant: "category" | "building" | "preview";
  onSelect: () => void;
}) {
  const style = campusMapPlaceTypeStyle(facility.placeType);
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
          ? `查看设施：${facility.name}，${location}`
          : undefined
      }
      className={cn(
        "flex w-full items-center text-left hover:bg-neutral-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#176346]",
        showsIcon
          ? "min-h-20 gap-3 py-3"
          : variant === "preview"
            ? "min-h-14 border-b border-black/8 py-1"
            : "min-h-20 gap-3 border-b border-black/8 py-2",
      )}
      onClick={onSelect}
    >
      {variant === "category" ? (
        <span className="relative grid size-16 shrink-0 place-items-center overflow-hidden rounded-xl text-white">
          {coverPhoto ? (
            <Image
              unoptimized
              fill
              sizes="64px"
              className="object-cover"
              src={coverPhoto.thumbnailUrl}
              alt=""
            />
          ) : (
            <span
              className="grid size-full place-items-center"
              style={{ background: style.color }}
            >
              <Icon aria-hidden="true" className="size-6" />
            </span>
          )}
        </span>
      ) : showsIcon ? (
        <span
          className="grid size-9 shrink-0 place-items-center rounded-full text-white"
          style={{ background: style.color }}
        >
          <Icon aria-hidden="true" className="size-4" />
        </span>
      ) : null}
      <span className="min-w-0 flex-1">
        <strong className="block truncate text-sm">{facility.name}</strong>
        <span className="mt-0.5 block truncate text-xs text-neutral-600">
          {location}
        </span>
        <span className="mt-0.5 block truncate text-xs text-neutral-500">
          {summary}
        </span>
      </span>
    </button>
  );
}
