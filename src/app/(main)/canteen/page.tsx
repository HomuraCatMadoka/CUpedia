import { eq } from "drizzle-orm";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { getCanteens } from "@/lib/canteen-actions";
import { CanteenCard } from "@/components/canteen/canteen-card";
import { resolveCanteenIconSrc } from "@/lib/canteen-assets";
import { isCanteenMockMode } from "@/lib/canteen-mock";
import { DanmakuBanner } from "@/components/home/danmaku-banner";
import { db } from "@/db";
import { users } from "@/db/schema";
import { getOptionalUser } from "@/lib/auth-guard";
import { listCurrentMonthDanmaku } from "@/lib/danmaku-actions";
import { isPgSoftFail } from "@/lib/pg-errors";

export const dynamic = "force-dynamic";

const MOCK_DANMAKU = [
  "范克廉今天的烧味排队有点长",
  "伍宜孙二楼现在有位置",
  "咖喱鸡今天不错",
  "有没有人试过新亚的晚餐",
  "雨这么大，最近的食堂就是最好的食堂",
  "求推荐一份三十蚊以内的午饭",
  "今天山上风很舒服",
  "善衡那边现在多人吗",
] as const;

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
      ? Promise.resolve(
          MOCK_DANMAKU.map((content, index) => {
            const createdAt = new Date();
            return {
              id: `mock-danmaku-${index + 1}`,
              content,
              month: createdAt.toISOString().slice(0, 7),
              createdAt,
            };
          }),
        )
      : listCurrentMonthDanmaku().catch((error) => {
          if (isPgSoftFail(error)) return [];
          throw error;
        }),
    mock ? Promise.resolve({ kind: "guest" as const }) : getDanmakuViewer(),
  ]);

  return (
    <div className="w-full min-w-0 pb-16 sm:pb-24">
      <section className="canteen-fade-in bg-[var(--canteen-cream)]">
        <div className="mx-auto max-w-6xl px-4 pb-12 pt-14 sm:px-6 sm:pb-16 sm:pt-20">
          <header className="text-center">
            <h1 className="canteen-brand text-[2.5rem] leading-none tracking-[-0.05em] text-[var(--canteen-ink)] sm:text-6xl">
              山城食记
            </h1>
            <p className="mt-3 text-lg text-[var(--canteen-muted)] sm:text-xl">
              还有食堂能吃吗
            </p>
          </header>

          <div className="-mx-4 mt-8 sm:-mx-6 sm:mt-10">
            <DanmakuBanner
              initialMessages={danmaku}
              viewer={danmakuViewer}
              title="本月弹幕"
              trackCount={3}
              appearance="hero"
            />
          </div>
        </div>
      </section>

      <section
        id="canteens"
        className="mx-auto max-w-6xl scroll-mt-20 px-4 pt-14 sm:px-6 sm:pt-20"
      >
        <div className="flex flex-col gap-3 border-b border-[#d2d2d7] pb-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="flex items-baseline gap-3">
              <h2 className="canteen-display text-3xl font-semibold tracking-tight sm:text-4xl">
                食堂
              </h2>
              <span className="text-sm tabular-nums text-[var(--canteen-muted)]">
                {canteens.length} 间
              </span>
            </div>
          </div>
          <Link
            href="/canteen/shit-rank"
            className="canteen-rank-link inline-flex min-h-11 w-fit items-center gap-1.5 rounded-sm text-sm font-medium text-[#0066cc] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0066cc] sm:text-base"
          >
            今日 💩堂榜
            <ChevronRight className="size-4" strokeWidth={2} aria-hidden />
          </Link>
        </div>

        {canteens.length === 0 ? (
          <div className="mt-8 border-t border-[var(--canteen-line)] py-14 text-center">
            <p className="canteen-display text-lg text-[var(--canteen-muted)]">
              暂无食堂
            </p>
            <p className="mt-2 text-sm text-[var(--canteen-muted)]">
              管理员录入后将在此展示
            </p>
          </div>
        ) : (
          <div className="canteen-icon-grid mt-8" role="list">
            {canteens.map((canteen) => (
              <div key={canteen.id} role="listitem">
                <CanteenCard
                  canteen={canteen}
                  href={`/canteen/${canteen.id}`}
                  iconSrc={resolveCanteenIconSrc(canteen.id, canteen.name)}
                />
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
