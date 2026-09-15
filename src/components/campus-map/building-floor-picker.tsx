"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { ChevronDownIcon } from "lucide-react";

import type { CampusMapBrowseBuilding } from "@/lib/campus-map/browse-projection";
import { orderedCampusMapFloors } from "@/lib/campus-map/browse-order";
import { campusMapFloorDisplayLabel } from "@/lib/campus-map/floor-label";
import { cn } from "@/lib/utils";

export function CampusMapBuildingFloorPicker({
  floors,
  floorId,
  onChange,
}: {
  floors: CampusMapBrowseBuilding["floors"];
  floorId: string | null;
  onChange: (floorId: string | null) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const [pillsFit, setPillsFit] = useState(false);
  const orderedFloors = orderedCampusMapFloors(floors);
  const options = [
    { id: "", label: "全部", accessibleLabel: "全部楼层" },
    ...orderedFloors.map((floor) => ({
      id: floor.floorId,
      label: floor.displayLabel.replace(/\/F$/iu, ""),
      accessibleLabel: campusMapFloorDisplayLabel(floor.displayLabel),
    })),
  ];
  useLayoutEffect(() => {
    const container = containerRef.current;
    const measure = measureRef.current;
    if (!container || !measure) return;
    const update = () =>
      setPillsFit(
        measure.scrollWidth <= container.clientWidth &&
          container.clientWidth > 0,
      );
    update();
    const observer = new ResizeObserver(update);
    observer.observe(container);
    observer.observe(measure);
    return () => observer.disconnect();
  }, [floors]);

  if (!floors.length) return null;
  const pillClass =
    "min-h-11 min-w-11 shrink-0 whitespace-nowrap rounded-full border px-2 text-sm font-medium";
  return (
    <div className="min-w-0 shrink-0 border-b border-black/10 px-4 py-2 dark:border-white/15 md:px-5">
      <div ref={containerRef} className="relative overflow-hidden">
        <span className="mb-1 block text-xs text-neutral-500 dark:text-neutral-400">
          楼层
        </span>
        <div
          ref={measureRef}
          aria-hidden="true"
          inert
          className="pointer-events-none invisible absolute flex w-max gap-1"
        >
          {options.map((option) => (
            <span
              key={option.id}
              className={cn(pillClass, "flex items-center")}
            >
              {option.label}
            </span>
          ))}
        </div>
        {pillsFit ? (
          <div role="group" aria-label="切换楼层" className="flex gap-1">
            {options.map((option) => (
              <button
                key={option.id}
                type="button"
                aria-label={option.accessibleLabel}
                aria-pressed={(floorId ?? "") === option.id}
                className={cn(
                  pillClass,
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#176346] dark:focus-visible:ring-emerald-300",
                  (floorId ?? "") === option.id
                    ? "border-[#176346] bg-[#176346] text-white dark:border-emerald-300 dark:bg-emerald-300 dark:text-neutral-950"
                    : "border-black/15 bg-white text-neutral-700 hover:bg-neutral-50 dark:border-white/20 dark:bg-neutral-900 dark:text-neutral-200 dark:hover:bg-neutral-800",
                )}
                onClick={() => onChange(option.id || null)}
              >
                {option.label}
              </button>
            ))}
          </div>
        ) : (
          <label className="relative inline-block max-w-full">
            <span className="sr-only">切换楼层</span>
            <select
              aria-label="切换楼层"
              value={floorId ?? ""}
              onChange={(event) => onChange(event.target.value || null)}
              className="min-h-11 max-w-full appearance-none rounded-xl border border-[#176346]/20 bg-[#edf5f1] py-2 pr-8 pl-3 text-sm font-semibold text-[#174b38] outline-none focus-visible:ring-2 focus-visible:ring-[#176346] dark:border-emerald-300/30 dark:bg-emerald-950 dark:text-emerald-200 dark:focus-visible:ring-emerald-300"
            >
              {options.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.accessibleLabel}
                </option>
              ))}
            </select>
            <ChevronDownIcon
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 right-2.5 size-4 -translate-y-1/2"
            />
          </label>
        )}
      </div>
    </div>
  );
}
