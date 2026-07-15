import type { CanteenPriceOption, MenuItemPricing } from "@/lib/canteen-types";

type StoredPriceOption = Omit<CanteenPriceOption, "id"> & { id: string };

export function buildMenuItemPricing(
  menuItemId: string,
  options: StoredPriceOption[],
  legacyPrice: number | null,
): MenuItemPricing {
  if (options.length > 0) {
    return {
      options: [...options].sort(
        (a, b) =>
          a.sortOrder - b.sortOrder ||
          a.label?.localeCompare(b.label ?? "") ||
          0,
      ),
    };
  }

  if (legacyPrice == null) return null;
  return {
    options: [
      {
        id: `legacy:${menuItemId}`,
        label: null,
        amountMinor: legacyPrice * 100,
        currency: "HKD",
        sortOrder: 0,
      },
    ],
  };
}

export function formatPriceAmount(
  amountMinor: number,
  currency: string,
): string {
  return new Intl.NumberFormat("zh-HK", {
    style: "currency",
    currency,
    currencyDisplay: "narrowSymbol",
    minimumFractionDigits: amountMinor % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(amountMinor / 100);
}

export function formatPriceOption(option: CanteenPriceOption): string {
  const amount = formatPriceAmount(option.amountMinor, option.currency);
  return option.label ? `${option.label} ${amount}` : amount;
}
