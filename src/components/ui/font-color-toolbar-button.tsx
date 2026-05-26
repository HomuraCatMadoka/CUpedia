"use client";

import { cn } from "@/lib/utils";

export const DEFAULT_COLORS = [
  "#000000",
  "#434343",
  "#666666",
  "#999999",
  "#B7B7B7",
  "#CCCCCC",
  "#D9D9D9",
  "#EFEFEF",
  "#F3F3F3",
  "#FFFFFF",
  "#980000",
  "#FF0000",
  "#FF9900",
  "#FFFF00",
  "#00FF00",
  "#00FFFF",
  "#4A86E8",
  "#0000FF",
  "#9900FF",
  "#FF00FF",
  "#E6B8AF",
  "#F4CCCC",
  "#FCE5CD",
  "#FFF2CC",
  "#D9EAD3",
  "#D0E0E3",
  "#C9DAF8",
  "#CFE2F3",
  "#D9D2E9",
  "#EAD1DC",
];

export function ColorDropdownMenuItems({
  className,
  colors,
  updateColor,
}: {
  className?: string;
  colors: string[];
  updateColor: (color: string) => void;
}) {
  return (
    <div className={cn("grid grid-cols-10 gap-1", className)}>
      {colors.map((color) => (
        <button
          key={color}
          type="button"
          className="size-5 rounded-sm border border-border"
          style={{ backgroundColor: color }}
          onClick={() => updateColor(color)}
        />
      ))}
    </div>
  );
}
