import Link from "next/link";
import { eq } from "drizzle-orm";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DanmakuBanner } from "@/components/home/danmaku-banner";
import { db } from "@/db";
import { users } from "@/db/schema";
import { getOptionalUser } from "@/lib/auth-guard";
import { listCurrentMonthDanmaku } from "@/lib/danmaku-actions";

export const dynamic = "force-dynamic";

async function getDanmakuViewer() {
  const sessionUser = await getOptionalUser();
  if (!sessionUser?.id) return { kind: "guest" as const };

  const dbUser = await db.query.users.findFirst({
    where: eq(users.id, sessionUser.id),
    columns: { id: true, nickname: true, banned: true },
  });
  if (!dbUser) return { kind: "guest" as const };
  if (dbUser.banned) return { kind: "banned" as const };
  return {
    kind: "member" as const,
    userId: dbUser.id,
    nickname: dbUser.nickname,
  };
}

export default async function HomePage() {
  const [messages, viewer] = await Promise.all([
    listCurrentMonthDanmaku(),
    getDanmakuViewer(),
  ]);

  const modules = [
    { title: "SG Wiki", href: "/wiki", description: "Survival Guides 百科" },
    {
      title: "课程",
      href: "/courses",
      description: "课程测评",
    },
    {
      title: "分院帽",
      href: "/college-picker",
      description: "书院志愿推荐",
    },
    {
      title: "食堂",
      href: "/canteen",
      description: "食堂测评",
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

      <DanmakuBanner initialMessages={messages} viewer={viewer} />

      <div className="relative z-10 grid grid-cols-2 gap-4 md:grid-cols-3">
        {modules.map((m) =>
          m.disabled ? (
            <Card key={m.href} className="cursor-not-allowed opacity-60">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg">{m.title}</CardTitle>
                  <Badge variant="secondary" className="text-xs">
                    即将上线
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground">{m.description}</p>
              </CardHeader>
            </Card>
          ) : (
            <Link key={m.href} href={m.href}>
              <Card className="transition-shadow hover:shadow-md">
                <CardHeader>
                  <CardTitle className="text-lg">{m.title}</CardTitle>
                  <p className="text-sm text-muted-foreground">
                    {m.description}
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
