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

export type CanteenPriceOption = {
  id: string;
  label: string | null;
  amountMinor: number;
  currency: string;
  sortOrder: number;
};

export type MenuItemPricing = {
  options: CanteenPriceOption[];
} | null;

export type MenuItemPriceOptionInput = Omit<CanteenPriceOption, "id">;

export type CanteenMenuItem = {
  id: string;
  canteenId: string;
  name: string;
  pricing: MenuItemPricing;
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

export const MENU_IMPORT_DRAFT_STATUSES = [
  "ready",
  "failed",
  "published",
] as const;
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
  priceOptions: MenuItemPriceOptionInput[];
  mealPeriod: MealPeriod;
  sortOrder: number;
  svgKey: string;
};

export type MenuSyncItemInput = MenuItemJsonImportRow & {
  externalKey: string;
};

export type MenuSyncInput = {
  source: string;
  takeOverLegacyItems: boolean;
  items: MenuSyncItemInput[];
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
  if (parsed.length > MENU_JSON_MAX_ROWS)
    throw new Error("MENU_JSON_TOO_LARGE");

  return parsed.map((row, index) => {
    if (!row || typeof row !== "object") throw new Error("INVALID_MENU_JSON");
    const r = row as Record<string, unknown>;
    const mealPeriod = parseMealPeriod(String(r.mealPeriod ?? "lunch"));
    if (!mealPeriod) throw new Error("INVALID_MEAL_PERIOD");
    const priceOptions = validatePricingInput(r.pricing, r.price) ?? [];
    return {
      name: validateMenuItemName(r.name),
      priceOptions,
      mealPeriod,
      sortOrder: validateSortOrder(r.sortOrder ?? index),
      svgKey: validateSvgKey(r.svgKey),
    };
  });
}

/** Parse a complete external-source snapshot used by preview/apply sync. */
export function parseMenuSyncJson(input: unknown): MenuSyncInput {
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

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("INVALID_MENU_SYNC");
  }
  const record = parsed as Record<string, unknown>;
  const source = validateExternalIdentity(record.source, "INVALID_SYNC_SOURCE");
  if (
    record.takeOverLegacyItems !== undefined &&
    typeof record.takeOverLegacyItems !== "boolean"
  ) {
    throw new Error("INVALID_TAKEOVER_FLAG");
  }
  const takeOverLegacyItems = record.takeOverLegacyItems === true;
  if (!Array.isArray(record.items)) throw new Error("INVALID_MENU_SYNC");
  const rows = parseMenuItemsJson(record.items);
  const rawItems = record.items as Array<Record<string, unknown>>;
  const seen = new Set<string>();
  const items = rows.map((row, index) => {
    const externalKey = validateExternalIdentity(
      rawItems[index]?.externalKey,
      "INVALID_EXTERNAL_KEY",
    );
    if (seen.has(externalKey)) throw new Error("DUPLICATE_EXTERNAL_KEY");
    seen.add(externalKey);
    return { ...row, externalKey };
  });
  return { source, takeOverLegacyItems, items };
}

function validateExternalIdentity(input: unknown, code: string): string {
  if (typeof input !== "string") throw new Error(code);
  const value = input.trim();
  if (!value || value.length > 200) throw new Error(code);
  return value;
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

export function validatePricingInput(
  pricing: unknown,
  legacyPrice?: unknown,
): MenuItemPriceOptionInput[] | undefined {
  if (pricing === undefined && legacyPrice === undefined) return undefined;

  if (pricing === undefined) {
    const price = validatePrice(legacyPrice);
    return price == null
      ? []
      : [
          {
            label: null,
            amountMinor: price * 100,
            currency: "HKD",
            sortOrder: 0,
          },
        ];
  }

  if (pricing === null) return [];
  if (!pricing || typeof pricing !== "object" || Array.isArray(pricing)) {
    throw new Error("INVALID_PRICING");
  }

  const options = (pricing as Record<string, unknown>).options;
  if (!Array.isArray(options) || options.length > 20) {
    throw new Error("INVALID_PRICING");
  }

  return options.map((option, index) => {
    if (!option || typeof option !== "object" || Array.isArray(option)) {
      throw new Error("INVALID_PRICE_OPTION");
    }
    const row = option as Record<string, unknown>;
    const rawLabel = row.label;
    let label: string | null = null;
    if (rawLabel != null && rawLabel !== "") {
      if (typeof rawLabel !== "string") throw new Error("INVALID_PRICE_LABEL");
      label = rawLabel.trim();
      if (!label || label.length > 100) throw new Error("INVALID_PRICE_LABEL");
    }

    const amountMinor = row.amountMinor;
    if (
      typeof amountMinor !== "number" ||
      !Number.isInteger(amountMinor) ||
      amountMinor < 0 ||
      amountMinor > 999_900
    ) {
      throw new Error("INVALID_PRICE_AMOUNT");
    }

    const currency = String(row.currency ?? "HKD")
      .trim()
      .toUpperCase();
    if (!/^[A-Z]{3}$/.test(currency)) throw new Error("INVALID_CURRENCY");

    return {
      label,
      amountMinor,
      currency,
      sortOrder: validateSortOrder(row.sortOrder ?? index),
    };
  });
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
