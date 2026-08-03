"use client";

import { ChevronLeft, ChevronRight, Utensils } from "lucide-react";
import { useState } from "react";

import type { FoodleRestaurant } from "@/lib/food-map/restaurant-catalog";

export function RestaurantArtwork({
  restaurant,
  immersive = false,
  aspectClassName,
  activeImageIndex,
  onActiveImageChange,
  controlsLabel = "餐厅插画",
  fallbackTestId = "restaurant-illustration-fallback",
}: {
  restaurant: FoodleRestaurant;
  immersive?: boolean;
  aspectClassName?: string;
  activeImageIndex?: number;
  onActiveImageChange?: (index: number) => void;
  controlsLabel?: string;
  fallbackTestId?: string;
}) {
  const [localImageIndex, setLocalImageIndex] = useState(0);
  const [brokenImages, setBrokenImages] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const images = restaurant.source.imageUrls.filter(
    (url) => url && !brokenImages.has(url),
  );
  const requestedIndex = activeImageIndex ?? localImageIndex;
  const safeIndex = images.length ? requestedIndex % images.length : 0;
  const aspect =
    aspectClassName ?? (immersive ? "aspect-square" : "aspect-[4/3]");

  function setImage(index: number) {
    if (activeImageIndex === undefined) setLocalImageIndex(index);
    onActiveImageChange?.(index);
  }

  if (images.length === 0) {
    return (
      <div
        data-testid={fallbackTestId}
        className={`grid place-items-center bg-[#eee8dc] text-[#5a4c37] dark:bg-[#352f25] dark:text-[#ddcfb7] ${aspect}`}
      >
        <div className="text-center">
          <span className="mx-auto grid size-16 place-items-center rounded-full border-2 border-current/55 bg-background/65">
            <Utensils className="size-7" strokeWidth={1.7} aria-hidden="true" />
          </span>
          <span className="mt-2 block text-xs font-medium">餐厅简笔插画</span>
        </div>
      </div>
    );
  }

  function changeImage(step: number) {
    setImage((safeIndex + step + images.length) % images.length);
  }

  return (
    <div className={`relative overflow-hidden bg-muted ${aspect}`}>
      {/* Fixture URLs become normalized, proxied source URLs in production. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={images[safeIndex]}
        alt={`${restaurant.sourceFacts.name}的餐厅插画，第 ${safeIndex + 1} 张`}
        width={800}
        height={800}
        className="h-full w-full object-cover"
        draggable={false}
        onError={() => {
          const failed = images[safeIndex];
          setBrokenImages((current) => new Set([...current, failed]));
          setImage(0);
        }}
      />
      {images.length > 1 ? (
        <>
          <div
            className="absolute inset-x-3 top-2 flex gap-1"
            aria-hidden="true"
          >
            {images.map((url, index) => (
              <span
                key={url}
                className={`h-1 flex-1 rounded-full ${
                  index === safeIndex ? "bg-white" : "bg-white/45"
                }`}
              />
            ))}
          </div>
          <button
            type="button"
            aria-label={`上一张${controlsLabel}`}
            onClick={(event) => {
              event.stopPropagation();
              changeImage(-1);
            }}
            className="absolute top-1/2 left-0 grid size-12 -translate-y-1/2 touch-manipulation place-items-center text-[#2d2630] focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-inset focus-visible:ring-white/90"
          >
            <ChevronLeft className="size-6 drop-shadow-sm" aria-hidden="true" />
          </button>
          <button
            type="button"
            aria-label={`下一张${controlsLabel}`}
            onClick={(event) => {
              event.stopPropagation();
              changeImage(1);
            }}
            className="absolute top-1/2 right-0 grid size-12 -translate-y-1/2 touch-manipulation place-items-center text-[#2d2630] focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-inset focus-visible:ring-white/90"
          >
            <ChevronRight
              className="size-6 drop-shadow-sm"
              aria-hidden="true"
            />
          </button>
        </>
      ) : null}
    </div>
  );
}
