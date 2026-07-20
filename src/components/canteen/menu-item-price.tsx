import type { MenuItemPricing } from "@/lib/canteen-types";
import { formatPriceAmount } from "@/lib/canteen-pricing";
import { cn } from "@/lib/utils";

export function MenuItemPrice({
  pricing,
  empty = "—",
  className,
}: {
  pricing: MenuItemPricing;
  empty?: string | null;
  className?: string;
}) {
  if (!pricing || pricing.options.length === 0) {
    return empty == null ? null : <span className={className}>{empty}</span>;
  }

  return (
    <span
      className={cn(
        "flex flex-wrap justify-end gap-x-2.5 gap-y-0.5",
        className,
      )}
    >
      {pricing.options.map((option) => (
        <span key={option.id} className="canteen-price-option whitespace-nowrap">
          {option.label ? (
            <span className="canteen-price-label">{option.label}</span>
          ) : null}
          <span className="tabular-nums">
            {formatPriceAmount(option.amountMinor, option.currency)}
          </span>
        </span>
      ))}
    </span>
  );
}
