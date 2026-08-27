import type { MealPeriod } from "@/db/schema";

export const EMPTY_MENU_CONFIRMATION_PENDING_CODE =
  "MENU_SYNC_EMPTY_PENDING_CONFIRMATION";
export const EMPTY_MENU_CONFIRMATION_MIN_MS = 10 * 60 * 1_000;
export const EMPTY_MENU_CONFIRMATION_MAX_MS = 45 * 60 * 1_000;

export type EmptyMenuConfirmationEvidence = {
  mealPeriod: MealPeriod;
  observationScope: "catalog" | "meal-period";
  publicationKey: string;
};
