export const DISH_SVG_KEYS = [
  "default",
  "rice",
  "bowl",
  "noodle",
  "drink",
  "dessert",
] as const;

export type DishSvgKey = (typeof DISH_SVG_KEYS)[number];

export function resolveDishSvgKey(svgKey: string): DishSvgKey {
  return (DISH_SVG_KEYS as readonly string[]).includes(svgKey)
    ? (svgKey as DishSvgKey)
    : "default";
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
