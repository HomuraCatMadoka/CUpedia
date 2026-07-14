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
        "flex size-12 shrink-0 items-center justify-center rounded-md bg-[var(--canteen-tray)]/70 ring-1 ring-[var(--canteen-line)]",
        className,
      )}
      aria-hidden
      data-svg-key={key}
    >
      <svg
        viewBox="0 0 24 24"
        className="size-6 text-[var(--canteen-purple)]"
        fill="currentColor"
      >
        <path d={d} />
      </svg>
    </div>
  );
}
