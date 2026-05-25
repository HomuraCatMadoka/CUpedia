"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const tabs = [
  { href: "/admin/deleted", label: "已删除页面" },
  { href: "/admin/users", label: "用户管理" },
  { href: "/admin/settings", label: "站点设置" },
];

export function AdminTabs() {
  const pathname = usePathname();

  return (
    <nav className="mb-6 flex gap-4 border-b">
      {tabs.map((tab) => (
        <Link
          key={tab.href}
          href={tab.href}
          className={`border-b-2 px-1 pb-2 text-sm ${
            pathname === tab.href
              ? "border-foreground font-medium"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
