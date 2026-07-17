import type { ComponentType } from "react";
import type { LucideProps } from "lucide-react";
import {
  CakeSliceIcon,
  CupSodaIcon,
  SoupIcon,
  UtensilsCrossedIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { resolveDishSvgKey, type DishSvgKey } from "@/lib/canteen-svg-keys";

type DishIcon = ComponentType<LucideProps>;

/** 一碗饭：碗底 + 米饭圆弧堆叠，小尺寸可辨认 */
function RiceBowlIcon({
  className,
  absoluteStrokeWidth: _absoluteStrokeWidth,
  size: _size,
  ...props
}: LucideProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
      {...props}
    >
      <path d="M5 12c0 4.2 3.1 7 7 7s7-2.8 7-7" />
      <path d="M4 12h16" />
      <path d="M7 12c.8-3.2 2.7-5 5-5s4.2 1.8 5 5" />
      <path d="M9.5 8.2c.6-.7 1.5-1.1 2.5-1.1s1.9.4 2.5 1.1" />
    </svg>
  );
}

/** 面食：横筷子 + 竖直下垂面条 + 下方碗 */
function NoodleBowlIcon({
  className,
  absoluteStrokeWidth: _absoluteStrokeWidth,
  size: _size,
  ...props
}: LucideProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
      {...props}
    >
      {/* 横着的筷子 */}
      <path d="M3 6.5h18" />
      <path d="M3 9h18" />
      {/* 竖直下垂的面条 */}
      <path d="M8 9.5v6" />
      <path d="M10.5 9.5v7" />
      <path d="M13.5 9.5v7" />
      <path d="M16 9.5v6" />
      {/* 碗 */}
      <path d="M5 17h14l-1.1 2.4A3.4 3.4 0 0 1 14.7 22H9.3a3.4 3.4 0 0 1-3.2-2.6L5 17Z" />
    </svg>
  );
}

const DISH_ICONS: Record<DishSvgKey, DishIcon> = {
  default: UtensilsCrossedIcon,
  rice: RiceBowlIcon,
  bowl: SoupIcon,
  noodle: NoodleBowlIcon,
  drink: CupSodaIcon,
  dessert: CakeSliceIcon,
};

export function DishSvgIcon({
  svgKey = "default",
  className,
}: {
  svgKey?: string;
  className?: string;
}) {
  const key = resolveDishSvgKey(svgKey);
  const Icon = DISH_ICONS[key];
  return (
    <div
      className={cn(
        "flex size-12 shrink-0 items-center justify-center rounded-md bg-[var(--canteen-tray)]/70 ring-1 ring-[var(--canteen-line)]",
        className,
      )}
      aria-hidden
      data-svg-key={key}
    >
      <Icon
        className="size-6 text-[var(--canteen-purple)]"
        strokeWidth={2}
        absoluteStrokeWidth
      />
    </div>
  );
}
