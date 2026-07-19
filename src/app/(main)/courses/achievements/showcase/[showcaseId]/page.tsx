import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ProfessionalBadgeLogo } from "@/components/courses/professional-badge-logo";
import { AchievementAvatar } from "@/components/user/achievement-avatar";
import { getPublicAchievementShowcase } from "@/lib/achievement-profile";

export const metadata: Metadata = {
  title: "成就橱窗 | CUpedia",
  robots: { index: false, follow: false },
};

export default async function AchievementShowcasePage({
  params,
}: {
  params: Promise<{ showcaseId: string }>;
}) {
  const { showcaseId } = await params;
  const showcase = await getPublicAchievementShowcase(showcaseId);
  if (!showcase) notFound();

  const tierRank = { gold: 0, silver: 1, bronze: 2 } as const;
  const achievements = [...showcase.achievements].sort(
    (a, b) =>
      Number(b.primary) - Number(a.primary) ||
      tierRank[a.tier] - tierRank[b.tier] ||
      a.badgeCode.localeCompare(b.badgeCode),
  );
  const primaryAchievement = achievements.find(
    (achievement) => achievement.primary,
  );
  const professionalAchievements = achievements.filter(
    (achievement) => achievement.category === "professional",
  );

  return (
    <div className="flex-1 overflow-y-auto">
      <main className="mx-auto max-w-4xl px-6 py-12">
        <p className="text-xs font-medium tracking-[0.2em] text-muted-foreground uppercase">
          Achievement Showcase
        </p>
        <div className="mt-6 flex items-center gap-5">
          <AchievementAvatar
            image={showcase.avatarUrl}
            size="lg"
            title={showcase.equippedTitle}
          />
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-3xl font-bold">{showcase.nickname}</h1>
            {primaryAchievement && (
              <ProfessionalBadgeLogo
                code={primaryAchievement.badgeCode}
                size={42}
                tier={primaryAchievement.tier}
              />
            )}
          </div>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          这里只展示当前成就，不展示测评记录或解锁所用课程。
        </p>

        <section aria-labelledby="professional-showcase" className="mt-10">
          <div className="flex items-baseline justify-between border-b pb-2">
            <h2 className="font-semibold" id="professional-showcase">
              专业成就
            </h2>
            <span className="text-xs text-muted-foreground">
              {professionalAchievements.length}
            </span>
          </div>
          {professionalAchievements.length > 0 ? (
            <div className="mt-4 flex flex-wrap gap-3">
              {professionalAchievements.map((achievement) => (
                <article
                  aria-label={`${achievement.badgeCode} 专业成就`}
                  className="flex size-24 items-center justify-center rounded-xl border bg-card"
                  key={achievement.id}
                >
                  <ProfessionalBadgeLogo
                    code={achievement.badgeCode}
                    size={68}
                    tier={achievement.tier}
                  />
                </article>
              ))}
            </div>
          ) : (
            <p className="mt-4 text-sm text-muted-foreground">暂无</p>
          )}
        </section>

        <section aria-labelledby="hidden-showcase" className="mt-8">
          <div className="flex items-baseline justify-between border-b pb-2">
            <h2 className="font-semibold" id="hidden-showcase">
              隐藏成就
            </h2>
            <span className="text-xs text-muted-foreground">
              {showcase.equippedTitle ? 1 : 0}
            </span>
          </div>
          {showcase.equippedTitle ? (
            <article className="mt-4 inline-flex min-w-36 items-center justify-between gap-6 rounded-xl border border-[#d8b766] bg-[#fffaf0] px-4 py-3">
              <div>
                <p className="text-sm font-semibold tracking-[0.08em] text-[#9a6815]">
                  {showcase.equippedTitle.badgeCode} 传说
                </p>
                <p className="mt-1 text-xs text-[#80601e]">
                  {showcase.equippedTitle.displayName}
                </p>
              </div>
            </article>
          ) : (
            <p className="mt-4 text-sm text-muted-foreground">暂无</p>
          )}
        </section>

        <p className="mt-10 text-xs leading-relaxed text-muted-foreground">
          成就只表示用户在 CUpedia
          评价过相应课程组合，不代表正式修读、主修或毕业资格。
        </p>
      </main>
    </div>
  );
}
