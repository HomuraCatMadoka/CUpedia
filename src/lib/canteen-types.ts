import {
  MEAL_PERIODS,
  ALLDAY_MEAL_PERIOD,
  MEAL_PERIOD_VALUES,
  type MealPeriod,
  type MealPeriodAssignment,
} from "@/db/schema";
import {
  SVG_KEY_MAX_LENGTH,
  collapseSectionKeyWhitespace,
} from "@/lib/canteen-svg-keys";
import {
  compareMealPeriodAssignments,
  mealPeriodsFromRow,
  normalizeMealPeriods,
  parseMealPeriod,
  primaryMealPeriodSortKey,
} from "@/lib/canteen-meal-periods";
import {
  parseMenuSnapshotCompleteness,
  type MenuSnapshotCompleteness,
} from "./canteen-menu-snapshot-completeness";

export {
  MENU_SNAPSHOT_COMPLETENESS,
  type MenuSnapshotCompleteness,
} from "./canteen-menu-snapshot-completeness";

export {
  MEAL_PERIODS,
  ALLDAY_MEAL_PERIOD,
  MEAL_PERIOD_VALUES,
  type MealPeriod,
  type MealPeriodAssignment,
  normalizeMealPeriods,
  parseMealPeriod,
  mealPeriodsFromRow,
  primaryMealPeriodSortKey,
};

export function compareMealPeriods(a: MealPeriod, b: MealPeriod): number {
  return compareMealPeriodAssignments(a, b);
}

export type Canteen = {
  id: string;
  name: string;
  location: string | null;
  /** Optional notice under the name (takeaway fee, drink add-on, etc.). */
  announcement: string | null;
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
  mealPeriods: MealPeriodAssignment[];
  sortOrder: number;
  svgKey: string;
  createdAt: Date;
  updatedAt: Date;
};

/** Latest accepted provider observation for each public meal period. */
export type CanteenMenuFreshness = {
  evaluatedAt: Date;
  periods: Record<MealPeriod, Date | null>;
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

/** Admin timeline row: dish comment plus canteen / menu context. */
export type AdminDishComment = CanteenDishComment & {
  canteenId: string;
  canteenName: string;
  menuItemName: string;
  authorEmail: string;
};

export const ADMIN_DISH_COMMENT_LIST_LIMIT = 200;

/** Kept for legacy `menu_import_drafts` column typing; OCR import path removed. */
export type MenuImportDraftItem = {
  tempId: string;
  name: string;
  price: number | null;
  mealPeriods: MealPeriodAssignment[];
  sortOrder: number;
};

export const MENU_JSON_MAX_ROWS = 500;

export type MenuItemJsonImportRow = {
  name: string;
  priceOptions: MenuItemPriceOptionInput[];
  mealPeriods: MealPeriodAssignment[];
  sortOrder: number;
  svgKey: string;
};

export type MenuSyncItemInput = MenuItemJsonImportRow & {
  externalProductId: string;
};

/** Immutable database-time context shared by one claimed provider read. */
export type MenuObservationContext = {
  observedAt: Date;
  syncWindowKey: string;
  mealPeriod: MealPeriod;
};

/** The absence boundary asserted by one normalized provider observation. */
export type MenuObservationScope =
  | { kind: "catalog" }
  | { kind: "meal-period"; mealPeriod: MealPeriod };

export type MenuSnapshotScopeEvidence =
  | {
      provider: "aigens";
      externalStoreId: string;
      storeName: string;
      menuName: string;
      providerPeriodCodes: string[];
      categoryPeriodCodes: string[];
      categoryCount: number;
      groupCount: number;
      /** Advisory HKT clock boundaries; never menu-content authority. */
      refreshBoundaryMinutes?: number[];
      /** Last same-day HKT minute where another provider read may be useful. */
      refreshUntilMinute?: number;
    }
  | {
      provider: "pinme";
      menuGroupCount: number;
      groupCount: number;
      referencedGroupIds: string[];
      /** Stable fingerprint of the provider's currently selected menu groups. */
      publicationKey?: string;
      /** Rollout-compatible fingerprint of referenced groups and service time. */
      publicationCompatibilityKey?: string;
      publicationWindows?: Array<{
        publicationId: string;
        startTime: string;
        endTime: string;
      }>;
      /** Advisory HKT clock boundaries; never menu-content authority. */
      refreshBoundaryMinutes?: number[];
      /** Last same-day HKT minute where another provider read may be useful. */
      refreshUntilMinute?: number;
      serviceWindows: Array<{
        startTime: string;
        endTime: string;
      }>;
    };

/** One normalized provider response before any cross-observation projection. */
export type ProviderMenuObservation = {
  snapshotCompleteness: MenuSnapshotCompleteness;
  items: MenuSyncItemInput[];
  scopeEvidence?: MenuSnapshotScopeEvidence;
  observationScope?: MenuObservationScope;
  /** Provider proof that an empty response is a valid, currently open menu. */
  emptyMenuEvidence?: {
    kind: "open-publication";
    publicationKey: string;
  };
};

/** Legacy/Admin command envelope around one provider observation. */
export type MenuSyncInput = ProviderMenuObservation & {
  takeOverLegacyItems: boolean;
};

export type MenuAbsenceAuthority =
  | { kind: "none" }
  | { kind: "provider-catalog" }
  | {
      kind: "current-activity";
      coveredMealPeriods: MealPeriod[];
      configuredMealPeriods: MealPeriod[];
      publicationTransition?: "changed";
    };

/** Derived current-menu state; deliberately not a provider observation. */
export type CurrentMenuProjection = {
  items: MenuSyncItemInput[];
  absenceAuthority: MenuAbsenceAuthority;
  /** True only after the source-sync confirmation gate accepted a proven empty. */
  confirmedEmpty?: boolean;
};

function parseMenuObservationScope(
  input: unknown,
): MenuObservationScope | undefined {
  if (input === undefined) return undefined;
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("INVALID_MENU_OBSERVATION_SCOPE");
  }
  const scope = input as Record<string, unknown>;
  if (scope.kind === "catalog" && Object.keys(scope).length === 1) {
    return { kind: "catalog" };
  }
  if (scope.kind === "meal-period" && Object.keys(scope).length === 2) {
    const mealPeriod =
      typeof scope.mealPeriod === "string"
        ? parseMealPeriod(scope.mealPeriod)
        : null;
    if (mealPeriod) return { kind: "meal-period", mealPeriod };
  }
  throw new Error("INVALID_MENU_OBSERVATION_SCOPE");
}

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
    const mealPeriods = mealPeriodsFromRow(r);
    if (!mealPeriods) throw new Error("INVALID_MEAL_PERIOD");
    const priceOptions = validatePricingInput(r.pricing, r.price) ?? [];
    return {
      name: validateMenuItemName(r.name),
      priceOptions,
      mealPeriods,
      sortOrder: validateSortOrder(r.sortOrder ?? index),
      svgKey: validateSvgKey(r.svgKey),
    };
  });
}

/** Parse an external-source snapshot used by preview/apply sync. */
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
  if (
    record.takeOverLegacyItems !== undefined &&
    typeof record.takeOverLegacyItems !== "boolean"
  ) {
    throw new Error("INVALID_TAKEOVER_FLAG");
  }
  const takeOverLegacyItems = record.takeOverLegacyItems === true;
  const snapshotCompleteness = parseMenuSnapshotCompleteness(
    record.snapshotCompleteness,
  );
  const observationScope = parseMenuObservationScope(record.observationScope);
  if (!Array.isArray(record.items)) throw new Error("INVALID_MENU_SYNC");
  const rows = parseMenuItemsJson(record.items);
  const rawItems = record.items as Array<Record<string, unknown>>;
  const seen = new Set<string>();
  const items = rows.map((row, index) => {
    const externalProductId = validateExternalIdentity(
      rawItems[index]?.externalProductId,
      "INVALID_EXTERNAL_PRODUCT_ID",
    );
    if (seen.has(externalProductId)) {
      throw new Error("DUPLICATE_EXTERNAL_PRODUCT_ID");
    }
    seen.add(externalProductId);
    return { ...row, externalProductId };
  });
  return {
    snapshotCompleteness,
    takeOverLegacyItems,
    items,
    ...(observationScope ? { observationScope } : {}),
  };
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

export function validateAnnouncement(announcement: unknown): string | null {
  if (announcement == null || announcement === "") return null;
  if (typeof announcement !== "string") throw new Error("INVALID_ANNOUNCEMENT");
  const trimmed = announcement.trim();
  if (trimmed.length > 500) throw new Error("INVALID_ANNOUNCEMENT");
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
  const normalized = collapseSectionKeyWhitespace(svgKey);
  if (!normalized || normalized.length > SVG_KEY_MAX_LENGTH) return "default";
  return normalized;
}
