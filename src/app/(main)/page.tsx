export const dynamic = "force-dynamic";

import Link from "next/link";

import { AnnouncementPanel } from "@/components/homepage/announcement-panel";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import {
  countPublishedAnnouncements,
  listFeaturedAnnouncements,
} from "@/lib/announcement-queries";

export default async function HomePage() {
  const [announcements, announcementCount] = await Promise.all([
    listFeaturedAnnouncements(),
    countPublishedAnnouncements(),
  ]);
  const modules = [
    { title: "SG Wiki", href: "/wiki", description: "Survival Guides 百科" },
    { title: "课程", href: "/courses", description: "课程测评" },
    {
      title: "分院帽",
      href: "/college-picker",
      description: "书院志愿推荐",
    },
    {
      title: "山城食记",
      href: "/canteen",
      description: "还有食堂能吃吗",
      disabled: false,
    },
    { title: "生活", href: "/life", description: "生活指南", disabled: true },
    {
      title: "交换",
      href: "/exchange",
      description: "交换经验",
      disabled: true,
    },
    { title: "求职", href: "/career", description: "求职资源", disabled: true },
  ];

  return (
    <div className="mx-auto w-full max-w-7xl space-y-8 px-4 py-6">
      <div className="text-center">
        <h1 className="text-3xl font-bold">CUpedia</h1>
        <p className="mt-2 text-muted-foreground">你的中大百科全书</p>
      </div>

      <AnnouncementPanel
        announcements={announcements}
        total={announcementCount}
      />

      <div className="relative z-10 grid grid-cols-2 gap-4 md:grid-cols-3">
        {modules.map((module) =>
          module.disabled ? (
            <Card key={module.href} className="cursor-not-allowed opacity-60">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg">{module.title}</CardTitle>
                  <Badge variant="secondary" className="text-xs">
                    即将上线
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground">
                  {module.description}
                </p>
              </CardHeader>
            </Card>
          ) : (
            <Link key={module.href} href={module.href}>
              <Card className="transition-shadow hover:shadow-md">
                <CardHeader>
                  <CardTitle className="text-lg">{module.title}</CardTitle>
                  <p className="text-sm text-muted-foreground">
                    {module.description}
                  </p>
                </CardHeader>
              </Card>
            </Link>
          ),
        )}
      </div>
    </div>
  );
}
