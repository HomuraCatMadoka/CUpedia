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
  const primary =
    emphasis === "recommend" ? counts.likes : counts.dislikes;
  const secondary =
    emphasis === "recommend" ? counts.dislikes : counts.likes;
  const primaryLabel = emphasis === "recommend" ? "赞" : "踩";
  const secondaryLabel = emphasis === "recommend" ? "踩" : "赞";

  return (
    <li className="flex items-center gap-3 rounded-xl border border-[var(--canteen-bamboo)]/20 bg-white/60 px-4 py-3">
      <span
        className={cn(
          "canteen-display flex size-9 shrink-0 items-center justify-center rounded-full text-sm font-bold tabular-nums",
          rank === 1
            ? "bg-[var(--canteen-purple)]/15 text-[var(--canteen-purple)]"
            : "bg-[var(--canteen-bamboo)]/15 text-[var(--canteen-muted)]",
        )}
        aria-hidden
      >
        {rank}
      </span>
      <DishSvgIcon svgKey={item.svgKey} className="size-10 rounded-lg" />
      <div className="min-w-0 flex-1">
        <p className="font-medium text-[var(--canteen-ink)]">{item.name}</p>
        <p className="mt-0.5 text-xs text-[var(--canteen-muted)]">
          {primaryLabel} {primary} · {secondaryLabel} {secondary}
        </p>
      </div>
      <p className="shrink-0 font-mono text-sm text-[var(--canteen-purple)]">
        {item.price != null ? `$${item.price}` : "—"}
      </p>
    </li>
  );
}
