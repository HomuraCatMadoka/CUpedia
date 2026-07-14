import type { RankedDish } from "@/lib/canteen-rankings";
import { DishSvgIcon } from "@/components/canteen/dish-svg-icon";
import { cn } from "@/lib/utils";

export function CanteenRankingRow({
  rank,
  entry,
  emphasis,
}: {
  rank: number;
  entry: RankedDish;
  emphasis: "recommend" | "avoid";
}) {
  const { item, counts } = entry;
  const primary = emphasis === "recommend" ? counts.likes : counts.dislikes;
  const secondary = emphasis === "recommend" ? counts.dislikes : counts.likes;
  const primaryLabel = emphasis === "recommend" ? "赞" : "踩";
  const secondaryLabel = emphasis === "recommend" ? "踩" : "赞";

  return (
    <li className="canteen-ledger-row flex items-center gap-3 px-1 py-3">
      <span
        className={cn(
          "canteen-display flex size-8 shrink-0 items-center justify-center font-mono text-sm font-semibold tabular-nums",
          rank === 1
            ? "text-[var(--canteen-purple)]"
            : "text-[var(--canteen-muted)]",
        )}
        aria-hidden
      >
        {String(rank).padStart(2, "0")}
      </span>
      <DishSvgIcon svgKey={item.svgKey} className="size-10 rounded-md" />
      <div className="min-w-0 flex-1">
        <p className="font-medium text-[var(--canteen-ink)]">{item.name}</p>
        <p className="mt-0.5 text-xs text-[var(--canteen-muted)]">
          {primaryLabel} {primary} · {secondaryLabel} {secondary}
        </p>
      </div>
      <p className="shrink-0 font-mono text-sm tabular-nums text-[var(--canteen-ink)]">
        {item.price != null ? `$${item.price}` : "—"}
      </p>
    </li>
  );
}
