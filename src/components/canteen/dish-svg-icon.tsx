import { cn } from "@/lib/utils";
import { DISH_SVG_PATHS, resolveDishSvgKey } from "@/lib/canteen-svg-keys";

export function DishSvgIcon({
  svgKey = "default",
  className,
}: {
  svgKey?: string;
  className?: string;
}) {
  const key = resolveDishSvgKey(svgKey);
  const d = DISH_SVG_PATHS[key];
  return (
    <div
      className={cn(
        "flex size-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-orange-50 to-amber-100/80 ring-1 ring-orange-200/60 dark:from-orange-950/30 dark:to-amber-950/20 dark:ring-orange-900/40",
        className,
      )}
      aria-hidden
      data-svg-key={key}
    >
      <svg viewBox="0 0 24 24" className="size-6 text-orange-700/90 dark:text-orange-300/90" fill="currentColor">
        <path d={d} />
      </svg>
    </div>
  );
}
