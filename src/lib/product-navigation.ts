export type ProductNavigationItem = Readonly<{
  id: string;
  label: string;
  desktopLabel?: string;
  href: `/${string}`;
  desktop: boolean;
  status?: string;
}>;

export const PRODUCT_NAVIGATION: readonly ProductNavigationItem[] = [
  {
    id: "wiki",
    label: "百科",
    href: "/wiki",
    desktop: false,
  },
  {
    id: "college-picker",
    label: "分院帽",
    href: "/college-picker",
    desktop: true,
  },
  {
    id: "campus-bus",
    label: "中大校巴",
    desktopLabel: "CU Bus",
    href: "/campus-bus",
    desktop: true,
    status: "測試中",
  },
  {
    id: "canteen",
    label: "食堂",
    href: "/canteen",
    desktop: true,
  },
  {
    id: "canteen-rank",
    label: "💩堂榜",
    href: "/canteen/shit-rank",
    desktop: true,
  },
  {
    id: "courses",
    label: "课程测评",
    href: "/courses",
    desktop: true,
  },
] as const;

export const DESKTOP_PRODUCT_NAVIGATION = PRODUCT_NAVIGATION.filter(
  (item) => item.desktop,
);

export function isProductNavigationItemActive(
  pathname: string,
  href: string,
): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}
