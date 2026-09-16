import { campusMapFloorDisplayLabel } from "@/lib/campus-map/floor-label";
import {
  DropletsIcon,
  DumbbellIcon,
  HeartPulseIcon,
  PrinterIcon,
  SchoolIcon,
  ToiletIcon,
  UsersRoundIcon,
} from "lucide-react";
import Image from "next/image";

import type { CampusMapBrowsePlace } from "@/lib/campus-map/browse-projection";
import {
  campusMapPlaceTypeLabel,
  CAMPUS_MAP_DISPLAY_REGISTRY,
} from "@/lib/campus-map/display-registry";
import type { CampusMapPublicPlaceType } from "@/lib/campus-map/place-type-contract";
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
} satisfies Record<
  CampusMapPublicPlaceType,
  {
    icon: typeof ToiletIcon;
    color: string;
  }
>;

export const CAMPUS_MAP_CATEGORIES = [
  ...CAMPUS_MAP_DISPLAY_REGISTRY.browseCategories,
  ...CAMPUS_MAP_DISPLAY_REGISTRY.moreBrowseCategories,
].map((placeType) => campusMapPlaceTypeStyle(placeType));

export function campusMapPlaceTypeStyle(placeType: CampusMapPublicPlaceType) {
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
      return campusMapFloorDisplayLabel(place.location.floor.displayLabel);
  }
}

export function campusMapFloorLabel(
  floorId: string | null,
  displayLabel?: string | null,
) {
  if (displayLabel) return campusMapFloorDisplayLabel(displayLabel);
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
  variant: "category" | "building";
  onSelect: () => void;
}) {
  const style = campusMapPlaceTypeStyle(facility.placeType);
  const Icon = style.icon;
  const showsIcon = variant === "building";
  return (
    <button
      data-return-result={facility.placeId}
      type="button"
      className={cn(
        "flex w-full items-center text-left text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
        variant === "category"
          ? "min-h-16 gap-3 border-b border-black/8 py-2 dark:border-white/10"
          : "min-h-14 gap-3 py-2.5",
      )}
      onClick={onSelect}
    >
      {variant === "category" ? (
        coverPhoto ? (
          <span className="relative size-12 shrink-0 overflow-hidden rounded-lg">
            <Image
              unoptimized
              fill
              sizes="48px"
              className="object-cover"
              src={coverPhoto.thumbnailUrl}
              alt=""
            />
            <span
              aria-hidden="true"
              className="absolute right-0 bottom-0 grid size-6 place-items-center rounded-tl-md border-2 border-background text-white"
              style={{ background: style.color }}
            >
              <Icon aria-hidden="true" className="size-3.5" />
            </span>
          </span>
        ) : (
          <span
            className="grid size-8 shrink-0 place-items-center rounded-full text-white"
            style={{ background: style.color }}
          >
            <Icon aria-hidden="true" className="size-4" />
          </span>
        )
      ) : showsIcon ? (
        <span
          className="grid size-9 shrink-0 place-items-center rounded-full text-white"
          style={{ background: style.color }}
        >
          <Icon aria-hidden="true" className="size-4" />
        </span>
      ) : null}
      <span className="min-w-0 flex-1">
        <strong
          className={cn(
            "block break-words text-sm",
            variant === "category" && "font-medium [overflow-wrap:anywhere]",
          )}
        >
          {facility.name}
        </strong>
        {location ? (
          <span
            className={cn(
              "mt-0.5 block text-muted-foreground",
              variant === "category"
                ? "break-words text-[13px] leading-5"
                : "truncate text-xs",
            )}
          >
            {location}
          </span>
        ) : null}
        {summary ? (
          <span
            className={cn(
              "mt-0.5 block text-muted-foreground",
              variant === "category"
                ? "break-words text-[13px] leading-5"
                : "break-words text-xs",
            )}
          >
            {summary}
          </span>
        ) : null}
      </span>
    </button>
  );
}
