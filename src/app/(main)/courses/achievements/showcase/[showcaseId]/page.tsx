import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ProfessionalBadgeLogo } from "@/components/courses/professional-badge-logo";
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

  const achievements = [...showcase.achievements].sort(
    (a, b) => Number(b.primary) - Number(a.primary),
  );

  return (
    <div className="flex-1 overflow-y-auto">
      <main className="mx-auto max-w-4xl px-6 py-12">
        <p className="text-xs font-medium tracking-[0.2em] text-muted-foreground uppercase">
          Achievement Showcase
        </p>
        <h1 className="mt-2 text-3xl font-bold">{showcase.nickname}</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          这里只展示当前成就，不展示测评记录或解锁所用课程。
        </p>

        {achievements.length === 0 ? (
          <div className="mt-10 rounded-2xl border border-dashed p-10 text-center text-sm text-muted-foreground">
            暂无已点亮成就
          </div>
        ) : (
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {achievements.map((achievement) => (
              <article
                className="rounded-2xl border bg-card p-5"
                key={achievement.id}
              >
                <div className="flex items-start justify-between gap-4">
                  <ProfessionalBadgeLogo
                    code={achievement.badgeCode}
                    size={64}
                    tier={achievement.tier}
                  />
                  {achievement.primary && (
                    <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-900 dark:bg-amber-950/50 dark:text-amber-200">
                      主称号
                    </span>
                  )}
                </div>
                <h2 className="mt-4 font-semibold">
                  {achievement.displayName}
                </h2>
                {achievement.publicDescription && (
                  <p className="mt-1 text-sm text-muted-foreground">
                    {achievement.publicDescription}
                  </p>
                )}
              </article>
            ))}
          </div>
        )}

        <p className="mt-10 text-xs leading-relaxed text-muted-foreground">
          成就只表示用户在 CUpedia
          评价过相应课程组合，不代表正式修读、主修或毕业资格。
        </p>
      </main>
    </div>
  );
}
