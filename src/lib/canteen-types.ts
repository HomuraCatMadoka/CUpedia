import { MEAL_PERIODS, type MealPeriod } from "@/db/schema";

export { MEAL_PERIODS, type MealPeriod };

export type Canteen = {
  id: string;
  name: string;
  location: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type CanteenMenuItem = {
  id: string;
  canteenId: string;
  name: string;
  price: number | null;
  mealPeriod: MealPeriod;
  sortOrder: number;
  svgKey: string;
  createdAt: Date;
  updatedAt: Date;
};

export type DeleteImpact = {
  menuItemCount: number;
  voteCount: number;
  commentCount: number;
};

export function parseMealPeriod(value: string): MealPeriod | null {
  return (MEAL_PERIODS as readonly string[]).includes(value)
    ? (value as MealPeriod)
    : null;
}

export function validateCanteenName(name: unknown): string {
  if (typeof name !== "string") throw new Error("INVALID_NAME");
  const trimmed = name.trim();
  if (!trimmed || trimmed.length > 200) throw new Error("INVALID_NAME");
  return trimmed;
}

export function validateMenuItemName(name: unknown): string {
  return validateCanteenName(name);
}

export function validateLocation(location: unknown): string | null {
  if (location == null || location === "") return null;
  if (typeof location !== "string") throw new Error("INVALID_LOCATION");
  const trimmed = location.trim();
  if (trimmed.length > 500) throw new Error("INVALID_LOCATION");
  return trimmed || null;
}

export function validatePrice(price: unknown): number | null {
  if (price == null || price === "") return null;
  const n = typeof price === "number" ? price : Number(price);
  if (!Number.isInteger(n) || n < 0 || n > 9999) {
    throw new Error("INVALID_PRICE");
  }
  return n;
}

export function validateSortOrder(sortOrder: unknown): number {
  const n = typeof sortOrder === "number" ? sortOrder : Number(sortOrder ?? 0);
  if (!Number.isInteger(n) || n < 0 || n > 100_000) {
    throw new Error("INVALID_SORT_ORDER");
  }
  return n;
}

export function validateSvgKey(svgKey: unknown): string {
  if (typeof svgKey !== "string") return "default";
  const trimmed = svgKey.trim();
  if (!trimmed || trimmed.length > 64) return "default";
  return trimmed;
}
