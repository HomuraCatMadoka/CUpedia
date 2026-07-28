import { eq } from "drizzle-orm";
import { getCanteens } from "@/lib/canteen-actions";
import { CanteenCard, CanteenShell } from "@/components/canteen/canteen-shell";
import { ShameRankEntryLink } from "@/components/canteen/shame-rank-list";
import { isCanteenMockMode } from "@/lib/canteen-mock";
import { resolveCanteenIconSrc } from "@/lib/canteen-assets";
import { DanmakuBanner } from "@/components/home/danmaku-banner";
import { db } from "@/db";
import { users } from "@/db/schema";
import { getOptionalUser } from "@/lib/auth-guard";
import { listCurrentMonthDanmaku } from "@/lib/danmaku-actions";
import { isPgSoftFail } from "@/lib/pg-errors";

export const dynamic = "force-dynamic";

async function getDanmakuViewer() {
  try {
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
  } catch (error) {
    if (isPgSoftFail(error)) return { kind: "guest" as const };
    throw error;
  }
}

export default async function CanteenBrowsePage() {
  const mock = isCanteenMockMode();
  const [canteens, danmaku, danmakuViewer] = await Promise.all([
    getCanteens(),
    mock
      ? Promise.resolve([])
      : listCurrentMonthDanmaku().catch((error) => {
          if (isPgSoftFail(error)) return [];
          throw error;
        }),
    mock ? Promise.resolve({ kind: "guest" as const }) : getDanmakuViewer(),
  ]);

  return (
    <CanteenShell
      brandTitle
      backHref="/"
      backLabel="返回首页"
      title="山城食记"
      subtitle="还有食堂能吃吗"
      action={<ShameRankEntryLink />}
    >
      <div className="mb-3 sm:mb-8">
        <DanmakuBanner initialMessages={danmaku} viewer={danmakuViewer} />
      </div>

      {canteens.length === 0 ? (
        <div className="canteen-fade-in border border-dashed border-[var(--canteen-line)] bg-[var(--canteen-tray)] px-1 py-10 text-center sm:rounded-2xl sm:py-16">
          <p className="canteen-display text-lg text-[var(--canteen-muted)]">
            暂无食堂
          </p>
          <p className="mt-2 text-sm text-[var(--canteen-muted)]">
            管理员录入后将在此展示
          </p>
        </div>
      ) : (
        <div className="canteen-fade-in canteen-icon-grid" role="list">
          {canteens.map((canteen, i) => (
            <div
              key={canteen.id}
              role="listitem"
              className={i % 2 === 1 ? "canteen-fade-in-delay-1" : ""}
            >
              <CanteenCard
                canteen={canteen}
                href={`/canteen/${canteen.id}`}
                iconSrc={resolveCanteenIconSrc(canteen.id, canteen.name)}
              />
            </div>
          ))}
        </div>
      )}
    </CanteenShell>
  );
}
