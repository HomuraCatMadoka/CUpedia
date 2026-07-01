import Link from "next/link";
import { notFound } from "next/navigation";
import { getCanteenById, getCanteenMenuItems } from "@/lib/canteen-actions";
import {
  getMenuItemVoteCounts,
  getMyVotesForCanteen,
} from "@/lib/canteen-vote-actions";
import { MEAL_PERIODS, type CanteenMenuItem, type MealPeriod } from "@/lib/canteen-types";
import { CanteenShell } from "@/components/canteen/canteen-shell";
import { MenuItemVoteRow } from "@/components/canteen/menu-item-vote-row";
import { mealPeriodLabel } from "@/components/canteen/meal-period-badge";
import { cn } from "@/lib/utils";

const PERIOD_DOT: Record<MealPeriod, string> = {
  breakfast: "bg-[var(--canteen-morning)]",
  lunch: "bg-[var(--canteen-noon)]",
  dinner: "bg-[var(--canteen-evening)]",
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

export default async function CanteenMenuPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const canteen = await getCanteenById(id);
  if (!canteen) notFound();

  const [items, voteCounts, myVotes] = await Promise.all([
    getCanteenMenuItems(id),
    getMenuItemVoteCounts(id),
    getMyVotesForCanteen(id),
  ]);
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
            <section
              key={period}
              className={`canteen-fade-in ${gi > 0 ? "canteen-fade-in-delay-1" : ""}`}
            >
              <h2 className="canteen-display mb-4 flex items-center gap-3 text-lg font-semibold text-[var(--canteen-ink)]">
                <span
                  className={cn("inline-block h-2 w-2 rounded-full", PERIOD_DOT[period])}
                  aria-hidden
                />
                {mealPeriodLabel[period]}
              </h2>
              <ul className="space-y-2">
                {groupItems.map((item) => (
                  <MenuItemVoteRow
                    key={item.id}
                    item={item}
                    counts={voteCounts[item.id] ?? { likes: 0, dislikes: 0 }}
                    initialVote={myVotes[item.id] ?? null}
                  />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </CanteenShell>
  );
}
