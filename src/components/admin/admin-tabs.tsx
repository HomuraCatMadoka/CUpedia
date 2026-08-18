"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const tabs = [
  { href: "/admin", label: "课程评价", exact: true },
  { href: "/admin/deleted", label: "已删除页面" },
  { href: "/admin/users", label: "用户管理" },
  { href: "/admin/canteens", label: "食堂管理" },
  { href: "/admin/canteen-sync", label: "菜单同步" },
  { href: "/admin/takeouts", label: "外卖管理" },
  { href: "/admin/danmaku", label: "弹幕管理" },
  { href: "/admin/comments", label: "评论管理" },
  { href: "/admin/announcements", label: "公告管理" },
  { href: "/admin/product-updates", label: "产品更新" },
  { href: "/admin/achievement-rules", label: "成就规则" },
  { href: "/admin/settings", label: "站点设置" },
] as const;

export function AdminTabs() {
  const pathname = usePathname();

  return (
    <nav className="mb-6 flex gap-4 overflow-x-auto border-b whitespace-nowrap">
      {tabs.map((tab) => {
        const exact = "exact" in tab && tab.exact;
        const active = exact
          ? pathname === tab.href
          : pathname === tab.href || pathname.startsWith(`${tab.href}/`);

        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`shrink-0 border-b-2 px-1 pb-2 text-sm ${
              active
                ? "border-foreground font-medium"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
