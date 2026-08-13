import { notFound } from "next/navigation";
import { getTakeoutById, getTakeoutMenuItems } from "@/lib/takeout-actions";
import { CanteenShell } from "@/components/canteen/canteen-shell";
import { CanteenOrderAction } from "@/components/canteen/canteen-order-action";
import { DishSvgIcon } from "@/components/canteen/dish-svg-icon";
import { MealPeriodsBadges } from "@/components/canteen/meal-period-badge";
import { MenuItemPrice } from "@/components/canteen/menu-item-price";
import { resolveCanteenOrderUrl } from "@/lib/canteen-order-urls";

export const dynamic = "force-dynamic";

export default async function TakeoutMenuPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const takeout = await getTakeoutById(id);
  if (!takeout) notFound();

  const items = await getTakeoutMenuItems(id);
  const orderUrl = resolveCanteenOrderUrl(id, takeout.name);

  return (
    <CanteenShell
      backHref="/canteen"
      backLabel="返回山城食记"
      title={takeout.name}
      subtitle={takeout.location ?? undefined}
      announcement={takeout.announcement}
      action={<CanteenOrderAction href={orderUrl} canteenName={takeout.name} />}
    >
      {items.length === 0 ? (
        <div className="canteen-fade-in border border-dashed border-[var(--canteen-line)] bg-[var(--canteen-tray)] px-1 py-10 text-center sm:rounded-2xl sm:py-16">
          <p className="canteen-display text-lg text-[var(--canteen-muted)]">
            暂无菜单
          </p>
          <p className="mt-2 text-sm text-[var(--canteen-muted)]">
            管理员录入后将在此展示
          </p>
        </div>
      ) : (
        <ul className="canteen-fade-in space-y-2">
          {items.map((item, i) => (
            <li
              key={item.id}
              className={`flex items-center gap-3 rounded-xl border border-[var(--canteen-line)] bg-white/70 px-4 py-3 ${
                i % 2 === 1 ? "canteen-fade-in-delay-1" : ""
              }`}
            >
              <DishSvgIcon
                svgKey={item.svgKey}
                className="size-10 rounded-xl"
              />
              <div className="min-w-0 flex-1">
                <p className="font-medium text-[var(--canteen-ink)]">
                  {item.name}
                </p>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <MealPeriodsBadges periods={item.mealPeriods} />
                  <MenuItemPrice
                    pricing={item.pricing}
                    className="font-mono text-sm text-[var(--canteen-link)]"
                  />
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </CanteenShell>
  );
}
