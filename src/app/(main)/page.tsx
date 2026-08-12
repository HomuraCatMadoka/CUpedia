export const dynamic = "force-dynamic";

import Link from "next/link";
import {
  BookOpenIcon,
  GraduationCapIcon,
  MapIcon,
  UtensilsIcon,
} from "lucide-react";

import { AnnouncementPanel } from "@/components/homepage/announcement-panel";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import {
  countPublicAnnouncements,
  listFeaturedAnnouncements,
} from "@/lib/announcement-queries";

const modules = [
  {
    title: "SG Wiki",
    href: "/wiki",
    description: "Survival Guides 百科",
    icon: BookOpenIcon,
  },
  {
    title: "课程",
    href: "/courses",
    description: "课程测评",
    icon: GraduationCapIcon,
  },
  {
    title: "分院帽",
    href: "/college-picker",
    description: "书院志愿推荐",
    icon: MapIcon,
  },
  {
    title: "山城食记",
    href: "/canteen",
    description: "还有食堂能吃吗",
    icon: UtensilsIcon,
  },
] as const;

export default async function HomePage() {
  const [announcements, announcementCount] = await Promise.all([
    listFeaturedAnnouncements(),
    countPublicAnnouncements(),
  ]);

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 px-4 py-6">
      <header className="text-center">
        <h1 className="text-3xl font-bold">CUpedia</h1>
        <p className="mt-2 text-muted-foreground">你的中大百科全书</p>
      </header>

      <AnnouncementPanel
        announcements={announcements}
        total={announcementCount}
      />

      <section>
        <h2 className="mb-3 text-sm font-medium text-muted-foreground">
          常用入口
        </h2>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {modules.map((module) => {
            const Icon = module.icon;
            return (
              <Link
                key={module.href}
                href={module.href}
                className="block h-full"
              >
                <Card className="h-full transition-shadow hover:shadow-md">
                  <CardHeader>
                    <Icon
                      className="size-5 text-muted-foreground"
                      aria-hidden="true"
                    />
                    <div className="mt-2">
                      <CardTitle className="text-lg">{module.title}</CardTitle>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {module.description}
                      </p>
                    </div>
                  </CardHeader>
                </Card>
              </Link>
            );
          })}
        </div>
      </section>
    </div>
  );
}
