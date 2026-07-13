import { MEAL_PERIODS, type MealPeriod } from "@/db/schema";
import { DISH_SVG_KEYS } from "@/lib/canteen-svg-keys";

export { MEAL_PERIODS, type MealPeriod };

const MEAL_PERIOD_ORDER: Record<MealPeriod, number> = {
  breakfast: 0,
  lunch: 1,
  dinner: 2,
};

export function compareMealPeriods(a: MealPeriod, b: MealPeriod): number {
  return MEAL_PERIOD_ORDER[a] - MEAL_PERIOD_ORDER[b];
}

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

export type VoteChoice = "like" | "dislike" | null;

export type MenuItemVoteCounts = {
  likes: number;
  dislikes: number;
};

/** Apply a vote transition to aggregate counts (optimistic UI). */
export function applyVoteCountDelta(
  counts: MenuItemVoteCounts,
  prevVote: VoteChoice,
  nextVote: VoteChoice,
): MenuItemVoteCounts {
  const out = { ...counts };
  if (prevVote === "like") out.likes -= 1;
  if (prevVote === "dislike") out.dislikes -= 1;
  if (nextVote === "like") out.likes += 1;
  if (nextVote === "dislike") out.dislikes += 1;
  return out;
}

export type CanteenDishComment = {
  id: string;
  menuItemId: string;
  userId: string;
  content: string;
  createdAt: Date;
  updatedAt: Date;
  authorNickname: string;
};

export const MENU_IMPORT_DRAFT_STATUSES = ["ready", "failed", "published"] as const;
export type MenuImportDraftStatus = (typeof MENU_IMPORT_DRAFT_STATUSES)[number];

export type MenuImportDraftItem = {
  tempId: string;
  name: string;
  price: number | null;
  mealPeriod: MealPeriod;
  sortOrder: number;
};

export type MenuImportDraft = {
  id: string;
  canteenId: string;
  sourceImageUrl: string;
  ocrRawText: string | null;
  items: MenuImportDraftItem[];
  status: MenuImportDraftStatus;
  errorMessage: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export function validateMenuImportDraftItems(
  input: unknown,
): MenuImportDraftItem[] {
  if (!Array.isArray(input)) throw new Error("INVALID_DRAFT_ITEMS");
  return input.map((row, index) => {
    if (!row || typeof row !== "object") throw new Error("INVALID_DRAFT_ITEMS");
    const r = row as Record<string, unknown>;
    const tempId =
      typeof r.tempId === "string" && r.tempId.trim()
        ? r.tempId.trim()
        : `draft-${index}`;
    const name = validateMenuItemName(r.name);
    const price = validatePrice(r.price);
    const mealPeriod = parseMealPeriod(String(r.mealPeriod ?? "lunch"));
    if (!mealPeriod) throw new Error("INVALID_MEAL_PERIOD");
    const sortOrder = validateSortOrder(r.sortOrder ?? index);
    return { tempId, name, price, mealPeriod, sortOrder };
  });
}

export const MENU_JSON_MAX_ROWS = 200;

export type MenuItemJsonImportRow = {
  name: string;
  price: number | null;
  mealPeriod: MealPeriod;
  sortOrder: number;
  svgKey: string;
};

/** Parse admin JSON bulk import: array or `{ items: [...] }`. */
export function parseMenuItemsJson(input: unknown): MenuItemJsonImportRow[] {
  let parsed: unknown = input;
  if (typeof input === "string") {
    const trimmed = input.trim();
    if (!trimmed) throw new Error("EMPTY_MENU_JSON");
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      throw new Error("INVALID_JSON");
    }
  }

  if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
    const obj = parsed as Record<string, unknown>;
    if (Array.isArray(obj.items)) parsed = obj.items;
  }

  if (!Array.isArray(parsed)) throw new Error("INVALID_MENU_JSON");
  if (parsed.length === 0) throw new Error("EMPTY_MENU_JSON");
  if (parsed.length > MENU_JSON_MAX_ROWS) throw new Error("MENU_JSON_TOO_LARGE");

  return parsed.map((row, index) => {
    if (!row || typeof row !== "object") throw new Error("INVALID_MENU_JSON");
    const r = row as Record<string, unknown>;
    const mealPeriod = parseMealPeriod(String(r.mealPeriod ?? "lunch"));
    if (!mealPeriod) throw new Error("INVALID_MEAL_PERIOD");
    return {
      name: validateMenuItemName(r.name),
      price: validatePrice(r.price),
      mealPeriod,
      sortOrder: validateSortOrder(r.sortOrder ?? index),
      svgKey: validateSvgKey(r.svgKey),
    };
  });
}

export function validateCommentContent(input: unknown): string {
  if (typeof input !== "string") throw new Error("INVALID_COMMENT");
  const trimmed = input.trim();
  if (!trimmed || trimmed.length > 500) throw new Error("INVALID_COMMENT");
  if (/<[^>]+>/.test(trimmed)) throw new Error("INVALID_COMMENT");
  return trimmed;
}

export function parseVote(input: unknown): VoteChoice {
  if (input === null || input === undefined || input === "") return null;
  if (input === "like" || input === "dislike") return input;
  throw new Error("INVALID_VOTE");
}

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
  if (!(DISH_SVG_KEYS as readonly string[]).includes(trimmed)) return "default";
  return trimmed;
}
