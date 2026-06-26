import { cn } from "@/lib/utils";

const PATHS: Record<string, string> = {
  default:
    "M4 10h16v2a6 6 0 0 1-6 6H10a6 6 0 0 1-6-6v-2zm2-4h12l1 4H5l1-4z",
  rice: "M6 8c2-3 4-3 6 0s4 3 6 0v10H6V8zm3 12h6v2H9v-2z",
  bowl: "M5 11c0-4 3.5-7 7-7s7 3 7 7v1H5v-1zm-1 3h16a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4z",
  spicy: "M12 3c2 4 5 5 5 9a5 5 0 0 1-10 0c0-4 3-5 5-9zm0 14v4",
};

export function DishSvgIcon({
  svgKey = "default",
  className,
}: {
  svgKey?: string;
  className?: string;
}) {
  const d = PATHS[svgKey] ?? PATHS.default;
  return (
    <div
      className={cn(
        "flex size-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-orange-50 to-amber-100/80 ring-1 ring-orange-200/60 dark:from-orange-950/30 dark:to-amber-950/20 dark:ring-orange-900/40",
        className,
      )}
      aria-hidden
    >
      <svg viewBox="0 0 24 24" className="size-6 text-orange-700/90 dark:text-orange-300/90" fill="currentColor">
        <path d={d} />
      </svg>
    </div>
  );
}
