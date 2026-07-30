import { getCanteens } from "@/lib/canteen-actions";
import { getTakeouts } from "@/lib/takeout-actions";
import { CanteenCard, CanteenShell } from "@/components/canteen/canteen-shell";
import { ShameRankEntryLink } from "@/components/canteen/shame-rank-list";
import { isCanteenMockMode } from "@/lib/canteen-mock";
import {
  resolveCanteenIconSrc,
  resolveTakeoutIconSrc,
} from "@/lib/canteen-assets";
import { DanmakuBanner } from "@/components/home/danmaku-banner";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getOptionalUser } from "@/lib/auth-guard";
import { listCurrentMonthDanmaku } from "@/lib/danmaku-actions";
import { isPgSoftFail, isPgUndefinedTable } from "@/lib/pg-errors";
import type { Canteen } from "@/lib/canteen-types";
import { messagesForFlyover, shuffleArray } from "@/lib/danmaku-types";

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

function VenueGrid({
  venues,
  hrefFor,
  iconSrcFor,
  emptyTitle,
  emptyHint,
}: {
  venues: Canteen[];
  hrefFor: (id: string) => string;
  iconSrcFor: (id: string, name: string) => string | null;
  emptyTitle: string;
  emptyHint: string;
}) {
  if (venues.length === 0) {
    return (
      <div className="canteen-fade-in border border-dashed border-[var(--canteen-line)] bg-[var(--canteen-tray)] px-1 py-10 text-center sm:rounded-2xl sm:py-14">
        <p className="canteen-display text-lg text-[var(--canteen-muted)]">
          {emptyTitle}
        </p>
        <p className="mt-2 text-sm text-[var(--canteen-muted)]">{emptyHint}</p>
      </div>
    );
  }

  return (
    <div className="canteen-fade-in canteen-icon-grid" role="list">
      {venues.map((venue, i) => (
        <div
          key={venue.id}
          role="listitem"
          className={i % 2 === 1 ? "canteen-fade-in-delay-1" : ""}
        >
          <CanteenCard
            canteen={venue}
            href={hrefFor(venue.id)}
            iconSrc={iconSrcFor(venue.id, venue.name)}
          />
        </div>
      ))}
    </div>
  );
}

export default async function CanteenBrowsePage() {
  const mock = isCanteenMockMode();
  const [canteens, takeouts, danmaku, danmakuViewer] = await Promise.all([
    getCanteens(),
    mock
      ? Promise.resolve([])
      : getTakeouts().catch((error) => {
          if (isPgSoftFail(error) || isPgUndefinedTable(error)) return [];
          throw error;
        }),
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
  const danmakuFly = shuffleArray(messagesForFlyover(danmaku));

  const canteenGrid = (
    <VenueGrid
      venues={canteens}
      hrefFor={(id) => `/canteen/${id}`}
      iconSrcFor={resolveCanteenIconSrc}
      emptyTitle="暂无食堂"
      emptyHint="管理员录入后将在此展示"
    />
  );

  return (
    <CanteenShell
      brandTitle
      backHref="/"
      backLabel="返回首页"
      title="山城食记"
      subtitle="还有食堂能吃吗"
      action={<ShameRankEntryLink />}
    >
      <div className="-mx-1 mb-3 sm:-mx-2 sm:mb-8">
        <DanmakuBanner
          initialMessages={danmaku}
          initialFlyMessages={danmakuFly}
          viewer={danmakuViewer}
          title="本月弹幕"
          trackCount={3}
          appearance="hero"
        />
      </div>

      {takeouts.length === 0 ? (
        canteenGrid
      ) : (
        <>
          <section
            className="canteen-zone-section"
            aria-labelledby="canteen-zone-heading"
          >
            <header className="canteen-zone-section-header">
              <h2
                id="canteen-zone-heading"
                className="canteen-zone-section-title"
              >
                食堂区
              </h2>
            </header>
            {canteenGrid}
          </section>

          <section
            className="canteen-zone-section canteen-zone-section--takeout"
            aria-labelledby="takeout-zone-heading"
          >
            <header className="canteen-zone-section-header">
              <h2
                id="takeout-zone-heading"
                className="canteen-zone-section-title"
              >
                外卖区
              </h2>
            </header>
            <VenueGrid
              venues={takeouts}
              hrefFor={(id) => `/canteen/takeout/${id}`}
              iconSrcFor={resolveTakeoutIconSrc}
              emptyTitle="暂无外卖"
              emptyHint="管理员录入后将在此展示"
            />
          </section>
        </>
      )}
    </CanteenShell>
  );
}
