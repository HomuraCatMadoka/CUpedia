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

export const DISH_SVG_PATHS: Record<DishSvgKey, string> = {
  default:
    "M4 10h16v2a6 6 0 0 1-6 6H10a6 6 0 0 1-6-6v-2zm2-4h12l1 4H5l1-4z",
  rice: "M6 8c2-3 4-3 6 0s4 3 6 0v10H6V8zm3 12h6v2H9v-2z",
  bowl: "M5 11c0-4 3.5-7 7-7s7 3 7 7v1H5v-1zm-1 3h16a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4z",
  spicy: "M12 3c2 4 5 5 5 9a5 5 0 0 1-10 0c0-4 3-5 5-9zm0 14v4",
  noodle:
    "M4 8c3 0 5 2 8 2s5-2 8-2v2c-3 0-5 2-8 2s-5-2-8-2V8zm0 4c3 0 5 2 8 2s5-2 8-2v2c-3 0-5 2-8 2s-5-2-8-2v-2z",
  drink: "M8 4h8l-1 3H9L8 4zm-1 5h10v9a3 3 0 0 1-3 3h-4a3 3 0 0 1-3-3V9z",
  dessert:
    "M8 18h8v2H8v-2zm-1-8a5 5 0 0 1 10 0v3H7V10zm2 5h6v1H9v-1z",
};

export function resolveDishSvgKey(svgKey: string): DishSvgKey {
  return (DISH_SVG_KEYS as readonly string[]).includes(svgKey)
    ? (svgKey as DishSvgKey)
    : "default";
}
