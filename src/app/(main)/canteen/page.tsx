import Link from "next/link";
import { eq } from "drizzle-orm";
import { getCanteens, getCanteenMenuItemCounts } from "@/lib/canteen-actions";
import { CanteenCard, CanteenShell } from "@/components/canteen/canteen-shell";
import { isCanteenMockMode } from "@/lib/canteen-mock";
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

export default async function CanteenBrowsePage() {
  const [canteens, countMap, danmaku, danmakuViewer] = await Promise.all([
    getCanteens(),
    getCanteenMenuItemCounts(),
    listCurrentMonthDanmaku(),
    getDanmakuViewer(),
  ]);

  return (
    <CanteenShell
      eyebrow="中大食堂"
      title="今天吃什么"
      subtitle="浏览各食堂菜单，行内点赞/点踩参与大众口味测评。菜单由管理员维护。"
      action={
        isCanteenMockMode() && process.env.NODE_ENV === "development" ? (
          <Link
            href="/canteen/manage"
            className="inline-flex items-center rounded-full border border-[var(--canteen-purple)]/25 bg-white/80 px-4 py-2 text-sm font-medium text-[var(--canteen-purple)] transition-colors hover:bg-[var(--canteen-purple)] hover:text-white"
          >
            管理菜单
          </Link>
        ) : undefined
      }
    >
      <div className="mb-10">
        <DanmakuBanner initialMessages={danmaku} viewer={danmakuViewer} />
      </div>

      {canteens.length === 0 ? (
        <div className="canteen-fade-in rounded-2xl border border-dashed border-[var(--canteen-bamboo)]/40 bg-white/50 px-6 py-16 text-center">
          <p className="canteen-display text-lg text-[var(--canteen-muted)]">
            暂无食堂
          </p>
          <p className="mt-2 text-sm text-[var(--canteen-muted)]">
            管理员录入后将在此展示
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {canteens.map((canteen, i) => (
            <CanteenCard
              key={canteen.id}
              canteen={canteen}
              href={`/canteen/${canteen.id}`}
              itemCount={countMap[canteen.id] ?? 0}
              className={`canteen-fade-in ${i % 2 === 1 ? "canteen-fade-in-delay-1" : ""}`}
            />
          ))}
        </div>
      )}
    </CanteenShell>
  );
}
