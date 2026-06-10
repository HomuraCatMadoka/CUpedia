// ==========================================================================
// 寻味CU — Sub-home page
// Route: /canteen
// ==========================================================================

import Link from "next/link";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

const sections = [
  {
    href: "/canteen/leaderboard",
    title: "排行榜",
    description: "查看最受欢迎的食堂与菜品，发现校园美食热门之选",
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="size-5"
      >
        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
      </svg>
    ),
    iconBg: "bg-amber-50 text-amber-600",
  },
  {
    href: "/canteen/menu",
    title: "食堂菜单",
    description: "浏览各书院食堂精选菜品，探索校园美食地图",
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="size-5"
      >
        <path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2" />
        <path d="M7 2v20" />
        <path d="M21 15V2v0a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7" />
      </svg>
    ),
    iconBg: "bg-green-50 text-green-600",
  },
  {
    href: "/canteen/delivery",
    title: "外卖菜单",
    description: "周边外卖美食推荐，足不出户尽享港味",
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="size-5"
      >
        <rect x="1" y="3" width="15" height="13" />
        <polygon points="16 8 20 8 23 11 23 16 16 16 16 8" />
        <circle cx="5.5" cy="18.5" r="2.5" />
        <circle cx="18.5" cy="18.5" r="2.5" />
      </svg>
    ),
    iconBg: "bg-blue-50 text-blue-600",
  },
];

export default function CanteenHomePage() {
  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto max-w-[var(--content-max-width)] px-6 py-12 text-center">
        {/* Hero */}
        <div className="mb-10">
          <div className="mx-auto mb-5 inline-flex h-[72px] w-[72px] items-center justify-center rounded-xl bg-amber-50 ring-1 ring-amber-200">
            <svg
              width="36"
              height="36"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#d97706"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M18 8h1a4 4 0 0 1 0 8h-1" />
              <path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z" />
              <line x1="6" y1="1" x2="6" y2="4" />
              <line x1="10" y1="1" x2="10" y2="4" />
              <line x1="14" y1="1" x2="14" y2="4" />
            </svg>
          </div>
          <h1 className="text-4xl font-bold tracking-tight">寻味CU</h1>
          <p className="mx-auto mt-2 max-w-md text-base leading-relaxed text-muted-foreground">
            探索中大美食，分享你的味蕾体验。
            <br />
            发现每个食堂的隐藏宝藏。
          </p>
        </div>

        {/* Global Search (visual placeholder) */}
        <div className="mx-auto mb-12 max-w-[480px]">
          <div className="relative">
            <svg
              className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <Input
              className="h-9 pl-9 text-sm"
              placeholder="搜索食堂或菜品名称…"
              disabled
            />
          </div>
        </div>

        {/* Feature Cards — 3-column grid */}
        <div className="mx-auto grid max-w-[780px] grid-cols-3 gap-4 max-sm:grid-cols-1">
          {sections.map((s) => (
            <Link key={s.href} href={s.href} prefetch={false}>
              <Card className="h-full text-left transition-shadow hover:ring-foreground/20">
                <CardHeader>
                  <div
                    className={`mb-3 flex h-11 w-11 items-center justify-center rounded-full ${s.iconBg}`}
                  >
                    {s.icon}
                  </div>
                  <CardTitle className="text-base">{s.title}</CardTitle>
                  <CardDescription className="text-[0.8125rem] leading-relaxed">
                    {s.description}
                  </CardDescription>
                </CardHeader>
              </Card>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
