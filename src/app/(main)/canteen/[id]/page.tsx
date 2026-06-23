import Link from "next/link";
import { notFound } from "next/navigation";
import { getCanteenById, getCanteenMenuItems } from "@/lib/canteen-actions";
import { MEAL_PERIODS, type CanteenMenuItem, type MealPeriod } from "@/lib/canteen-types";
import { CanteenShell } from "@/components/canteen/canteen-shell";
import { DishSvgIcon } from "@/components/canteen/dish-svg-icon";
import { MealPeriodBadge, mealPeriodLabel } from "@/components/canteen/meal-period-badge";
import { cn } from "@/lib/utils";

const PERIOD_ACCENT: Record<MealPeriod, string> = {
  breakfast: "from-[var(--canteen-morning)]",
  lunch: "from-[var(--canteen-noon)]",
  dinner: "from-[var(--canteen-evening)]",
};

function groupByMealPeriod(items: CanteenMenuItem[]) {
  const groups: Record<MealPeriod, CanteenMenuItem[]> = {
    breakfast: [],
    lunch: [],
    dinner: [],
  };
  for (const item of items) {
    groups[item.mealPeriod].push(item);
  }
  return MEAL_PERIODS.filter((p) => groups[p].length > 0).map((p) => ({
    period: p,
    items: groups[p],
  }));
}

function MenuItemRow({ item }: { item: CanteenMenuItem }) {
  return (
    <li
      className={cn(
        "group relative flex items-center gap-4 rounded-xl border border-[var(--canteen-bamboo)]/20 bg-white/60 px-4 py-3 transition-colors hover:bg-white/90",
      )}
    >
      <div
        className={cn(
          "absolute inset-y-2 left-0 w-1 rounded-full bg-gradient-to-b to-transparent opacity-70",
          PERIOD_ACCENT[item.mealPeriod],
        )}
        aria-hidden
      />
      <DishSvgIcon svgKey={item.svgKey} className="ml-2 size-11 rounded-xl" />
      <div className="min-w-0 flex-1">
        <p className="font-medium text-[var(--canteen-ink)]">{item.name}</p>
        <MealPeriodBadge period={item.mealPeriod} className="mt-1" />
      </div>
      <p className="shrink-0 font-mono text-sm font-medium tabular-nums text-[var(--canteen-purple)]">
        {item.price != null ? `$${item.price}` : "—"}
      </p>
    </li>
  );
}

export default async function CanteenMenuPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const canteen = await getCanteenById(id);
  if (!canteen) notFound();
  const items = await getCanteenMenuItems(id);
  const groups = groupByMealPeriod(items);

  return (
    <CanteenShell
      eyebrow={
        <Link href="/canteen" className="hover:text-[var(--canteen-purple)]">
          ← 全部食堂
        </Link>
      }
      title={canteen.name}
      subtitle={canteen.location ?? undefined}
    >
      {items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[var(--canteen-bamboo)]/40 bg-white/50 px-6 py-16 text-center">
          <p className="text-[var(--canteen-muted)]">该食堂暂无菜品</p>
        </div>
      ) : (
        <div className="space-y-10">
          {groups.map(({ period, items: groupItems }, gi) => (
            <section key={period} className={`canteen-fade-in ${gi > 0 ? "canteen-fade-in-delay-1" : ""}`}>
              <h2 className="canteen-display mb-4 flex items-center gap-3 text-lg font-semibold text-[var(--canteen-ink)]">
                <span
                  className={cn(
                    "inline-block h-2 w-2 rounded-full",
                    period === "breakfast" && "bg-[var(--canteen-morning)]",
                    period === "lunch" && "bg-[var(--canteen-noon)]",
                    period === "dinner" && "bg-[var(--canteen-evening)]",
                  )}
                />
                {mealPeriodLabel[period]}
              </h2>
              <ul className="space-y-2">
                {groupItems.map((item) => (
                  <MenuItemRow key={item.id} item={item} />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </CanteenShell>
  );
}
