import { MEAL_PERIODS } from "@/db/schema";
import type {
  MealPeriodAssignment,
  MenuItemPriceOptionInput,
  MenuSyncItemInput,
} from "./canteen-types";
import { menuProviderOccurrences } from "./canteen-types";

export type CanonicalMenuSyncItem = Omit<
  MenuSyncItemInput,
  "externalProductId"
> & {
  normalizedName: string;
  offerings: MenuSyncItemInput[];
};

/**
 * The deliberately narrow dish-name key agreed for provider synchronization.
 * Punctuation, parenthetical text, specifications and hot/cold wording remain.
 */
export function normalizeCanonicalDishName(name: string): string {
  return name
    .replace(/[\u3000\uFF01-\uFFEF]+/gu, (chunk) => chunk.normalize("NFKC"))
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[A-Z]/g, (character) => character.toLowerCase());
}

/** Group one source observation into user-recognizable dishes. */
export function canonicalizeProviderOfferings(
  items: readonly MenuSyncItemInput[],
): CanonicalMenuSyncItem[] {
  const groups = new Map<string, MenuSyncItemInput[]>();
  for (const item of items) {
    const normalizedName = normalizeCanonicalDishName(item.name);
    groups.set(normalizedName, [...(groups.get(normalizedName) ?? []), item]);
  }

  return [...groups.entries()]
    .map(([normalizedName, grouped]) => {
      const offerings = [...grouped].sort(compareOfferingPresentation);
      const [primary] = offerings
        .flatMap((offering) =>
          menuProviderOccurrences(offering).map((occurrence) => ({
            offering,
            occurrence,
          })),
        )
        .sort(
          (left, right) =>
            left.occurrence.sortOrder - right.occurrence.sortOrder ||
            left.occurrence.categoryKey.localeCompare(
              right.occurrence.categoryKey,
            ) ||
            left.offering.externalProductId.localeCompare(
              right.offering.externalProductId,
            ),
        );
      return {
        name: primary.offering.name.trim().replace(/\s+/g, " "),
        normalizedName,
        priceOptions: mergePriceOptions(offerings),
        mealPeriods: mergeMealPeriods(offerings),
        sortOrder: primary.occurrence.sortOrder,
        svgKey: primary.occurrence.categoryKey,
        offerings,
      };
    })
    .sort(
      (left, right) =>
        left.sortOrder - right.sortOrder ||
        left.normalizedName.localeCompare(right.normalizedName),
    );
}

function compareOfferingPresentation(
  left: MenuSyncItemInput,
  right: MenuSyncItemInput,
): number {
  return (
    left.sortOrder - right.sortOrder ||
    left.externalProductId.localeCompare(right.externalProductId)
  );
}

function mergeMealPeriods(
  offerings: readonly MenuSyncItemInput[],
): MealPeriodAssignment[] {
  const periods = new Set(offerings.flatMap((item) => item.mealPeriods));
  if (periods.has("allday")) return ["allday"];
  return MEAL_PERIODS.filter((period) => periods.has(period));
}

function mergePriceOptions(
  offerings: readonly MenuSyncItemInput[],
): MenuItemPriceOptionInput[] {
  const prices = new Map<string, MenuItemPriceOptionInput>();
  for (const offering of offerings) {
    for (const occurrence of menuProviderOccurrences(offering)) {
      for (const option of occurrence.priceOptions) {
        const key = `${option.label ?? ""}\u0000${option.currency}\u0000${option.amountMinor}`;
        if (!prices.has(key)) prices.set(key, option);
      }
    }
  }
  return [...prices.values()]
    .sort(
      (left, right) =>
        left.sortOrder - right.sortOrder ||
        (left.label ?? "").localeCompare(right.label ?? "") ||
        left.currency.localeCompare(right.currency) ||
        left.amountMinor - right.amountMinor,
    )
    .map((option, sortOrder) => ({ ...option, sortOrder }));
}
