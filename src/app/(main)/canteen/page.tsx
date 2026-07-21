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
  const mock = isCanteenMockMode();
  const [canteens, countMap, danmaku, danmakuViewer] = await Promise.all([
    getCanteens(),
    getCanteenMenuItemCounts(),
    mock ? Promise.resolve([]) : listCurrentMonthDanmaku(),
    mock ? Promise.resolve({ kind: "guest" as const }) : getDanmakuViewer(),
  ]);

  return (
    <CanteenShell
      brandTitle
      backHref="/"
      backLabel="返回首页"
      title="山城食记"
      subtitle="还有食堂能吃吗"
      action={
        isCanteenMockMode() && process.env.NODE_ENV === "development" ? (
          <div className="flex flex-wrap gap-2">
            <Link
              href="/admin/canteens"
              className="inline-flex items-center border border-[var(--canteen-purple)]/35 bg-[var(--canteen-surface)] px-4 py-2 text-sm font-medium text-[var(--canteen-purple)] transition-colors hover:bg-[var(--canteen-purple)] hover:text-white"
            >
              管理后台
            </Link>
            <Link
              href="/canteen/manage"
              className="inline-flex items-center border border-[var(--canteen-bamboo)]/35 bg-[var(--canteen-surface)] px-4 py-2 text-sm font-medium text-[var(--canteen-muted)] transition-colors hover:bg-[var(--canteen-bamboo)]/15"
            >
              演示预览
            </Link>
          </div>
        ) : undefined
      }
    >
      <div className="mb-10">
        <DanmakuBanner initialMessages={danmaku} viewer={danmakuViewer} />
      </div>

      {canteens.length === 0 ? (
        <div className="canteen-fade-in canteen-ledger border-b border-dashed border-[var(--canteen-line)] px-1 py-16 text-center">
          <p className="canteen-display text-lg text-[var(--canteen-muted)]">
            暂无食堂
          </p>
          <p className="mt-2 text-sm text-[var(--canteen-muted)]">
            管理员录入后将在此展示
          </p>
        </div>
      ) : (
        <div className="canteen-fade-in canteen-ledger">
          {canteens.map((canteen, i) => (
            <CanteenCard
              key={canteen.id}
              canteen={canteen}
              href={`/canteen/${canteen.id}`}
              itemCount={countMap[canteen.id] ?? 0}
              className={i % 2 === 1 ? "canteen-fade-in-delay-1" : ""}
            />
          ))}
        </div>
      )}
    </CanteenShell>
  );
}
