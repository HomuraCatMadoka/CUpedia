import type { MenuItemPricing } from "@/lib/canteen-types";
import { formatPriceAmount } from "@/lib/canteen-pricing";
import { cn } from "@/lib/utils";

export function MenuItemPrice({
  pricing,
  empty = "-",
  className,
  variant = "inline",
  listCollapsedAfter,
  showOptionCount = true,
}: {
  pricing: MenuItemPricing;
  empty?: string | null;
  className?: string;
  variant?: "inline" | "summary" | "list";
  listCollapsedAfter?: number;
  showOptionCount?: boolean;
}) {
  if (!pricing || pricing.options.length === 0) {
    return empty == null ? null : <span className={className}>{empty}</span>;
  }

  if (variant === "summary") {
    if (pricing.options.length === 1) {
      const [only] = pricing.options;
      return (
        <span className={cn("whitespace-nowrap", className)}>
          <span className="tabular-nums">
            {formatPriceAmount(only.amountMinor, only.currency)}
          </span>
        </span>
      );
    }
    const lowest = pricing.options.reduce((current, option) =>
      option.amountMinor < current.amountMinor ? option : current,
    );
    return (
      <span className={cn("whitespace-nowrap", className)}>
        <span className="tabular-nums">
          {formatPriceAmount(lowest.amountMinor, lowest.currency)} 起
        </span>
        {showOptionCount ? (
          <span className="ml-1 text-[var(--canteen-muted)]">
            · {pricing.options.length} 种选择
          </span>
        ) : null}
      </span>
    );
  }

  if (variant === "list") {
    const collapsedAfter =
      listCollapsedAfter && listCollapsedAfter > 0
        ? listCollapsedAfter
        : pricing.options.length;
    const visibleOptions = pricing.options.slice(0, collapsedAfter);
    const hiddenOptions = pricing.options.slice(collapsedAfter);
    const renderOption = (option: (typeof pricing.options)[number]) => (
      <div
        key={option.id}
        className="flex min-h-11 items-center justify-between gap-4 border-b border-[var(--canteen-line)] py-2 last:border-b-0"
      >
        <dt className="text-sm text-[var(--canteen-muted)]">
          {option.label || (pricing.options.length === 1 ? "价格" : "基础价格")}
        </dt>
        <dd className="text-sm font-semibold tabular-nums text-[var(--canteen-ink)]">
          {formatPriceAmount(option.amountMinor, option.currency)}
        </dd>
      </div>
    );

    return (
      <div className={className}>
        <dl className="grid gap-0">{visibleOptions.map(renderOption)}</dl>
        {hiddenOptions.length > 0 ? (
          <details className="canteen-price-more">
            <summary>展开另外 {hiddenOptions.length} 项</summary>
            <dl className="grid gap-0">{hiddenOptions.map(renderOption)}</dl>
          </details>
        ) : null}
      </div>
    );
  }

  return (
    <span
      className={cn(
        "flex flex-wrap justify-end gap-x-2.5 gap-y-0.5",
        className,
      )}
    >
      {pricing.options.map((option) => (
        <span
          key={option.id}
          className="canteen-price-option whitespace-nowrap"
        >
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
