export const DISH_SVG_KEYS = [
  "default",
  "rice",
  "bowl",
  "spicy",
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
