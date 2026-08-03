export const DISH_SVG_KEYS = [
  "default",
  "rice",
  "bowl",
  "noodle",
  "drink",
  "dessert",
] as const;

export type DishSvgKey = (typeof DISH_SVG_KEYS)[number];

/** Max length for freeform section keys stored in `svg_key`. */
export const SVG_KEY_MAX_LENGTH = 64;

/** Common store category names → icon key (does not rewrite stored section keys). */
const CATEGORY_ICON_ALIASES: Record<string, DishSvgKey> = {
  飯類: "rice",
  饭类: "rice",
  粉麵: "noodle",
  粉面: "noodle",
  麵類: "noodle",
  面类: "noodle",
  煲湯: "bowl",
  煲汤: "bowl",
  湯類: "bowl",
  汤类: "bowl",
  飲品: "drink",
  饮品: "drink",
  甜品: "dessert",
  小食: "default",
  零食: "default",
};

export function normalizeSectionKey(raw: string): string {
  return raw.trim().replace(/\s+/g, " ").slice(0, SVG_KEY_MAX_LENGTH);
}

/**
 * Prefer the store's own category as the section key. Only fall back to
 * name-based inference when no category is present.
 */
export function resolveMenuSectionKey(input: {
  categoryName?: string | null;
  dishName: string;
}): string {
  const category = input.categoryName
    ? normalizeSectionKey(input.categoryName)
    : "";
  if (category) return category;
  return inferDishSvgKeyFromName(input.dishName);
}

/** Map a stored section key to a Lucide/path icon key. */
export function resolveDishIconKey(sectionKey: string): DishSvgKey {
  const key = normalizeSectionKey(sectionKey);
  if ((DISH_SVG_KEYS as readonly string[]).includes(key)) {
    return key as DishSvgKey;
  }
  return CATEGORY_ICON_ALIASES[key] ?? "default";
}

/** @deprecated Prefer resolveDishIconKey — kept for call sites that only need icons. */
export function resolveDishSvgKey(svgKey: string): DishSvgKey {
  return resolveDishIconKey(svgKey);
}

/** Infer category from dish name. Does not preserve `default` — callers that
 *  must leave existing `default` alone should skip those rows themselves. */
export function inferDishSvgKeyFromName(name: string): DishSvgKey {
  if (/(奶茶|咖啡|可樂|汽水|果汁|檸茶)/u.test(name)) return "drink";
  if (/(麵|米粉|河粉|意粉|喇沙)/u.test(name)) return "noodle";
  if (/(飯|粥)/u.test(name)) return "rice";
  if (/(煲|湯)/u.test(name)) return "bowl";
  if (/(多士|菠蘿包|糕|酥|甜品)/u.test(name)) return "dessert";
  return "default";
}
