import { AchievementRedeemButton } from "@/components/courses/achievement-redeem-button";
import { ProfessionalBadgeLogo } from "@/components/courses/professional-badge-logo";
import { getMyProfessionalAchievementProgress } from "@/lib/achievement-actions";

export default async function CourseAchievementsPage() {
  const progress = await getMyProfessionalAchievementProgress();

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto max-w-5xl px-6 py-10">
        <h1 className="text-2xl font-bold">我的成就</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          评分课程即可推进专业称号；候选进度实时计算。
        </p>

        {progress.length === 0 ? (
          <div className="mt-8 rounded-2xl border border-dashed p-10 text-center text-sm text-muted-foreground">
            暂无已启用的专业成就
          </div>
        ) : (
          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            {progress.map((item) => (
              <article
                className="flex gap-4 rounded-2xl border bg-card p-5"
                key={item.ruleId}
              >
                <ProfessionalBadgeLogo
                  code={item.badgeCode}
                  size={64}
                  tier={item.tier}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h2 className="font-semibold">{item.displayName}</h2>
                      {item.description && (
                        <p className="mt-1 text-sm text-muted-foreground">
                          {item.description}
                        </p>
                      )}
                    </div>
                    {item.redeemed && (
                      <span className="shrink-0 text-xs font-medium text-emerald-700">
                        已点亮
                      </span>
                    )}
                  </div>
                  {!item.redeemed && (
                    <>
                      <div
                        className="mt-4 h-1.5 overflow-hidden rounded-full bg-muted"
                        aria-label={`${item.matchedCount} / ${item.requiredCount} 门`}
                        role="progressbar"
                        aria-valuemin={0}
                        aria-valuemax={item.requiredCount}
                        aria-valuenow={item.matchedCount}
                      >
                        <div
                          className="h-full rounded-full bg-foreground"
                          style={{
                            width: `${(item.matchedCount / item.requiredCount) * 100}%`,
                          }}
                        />
                      </div>
                      <div className="mt-2 flex items-center justify-between gap-3">
                        <span className="text-xs text-muted-foreground">
                          {item.matchedCount} / {item.requiredCount} 门
                        </span>
                        {item.eligible && (
                          <AchievementRedeemButton
                            displayName={item.displayName}
                            ruleId={item.ruleId}
                            upgrade={item.tier !== "bronze"}
                          />
                        )}
                      </div>
                      {!item.prerequisiteSatisfied && (
                        <p className="mt-2 text-xs text-muted-foreground">
                          需要先点亮前置称号
                        </p>
                      )}
                      {!item.slotAvailable && (
                        <p className="mt-2 text-xs text-muted-foreground">
                          当前等级的称号槽位已占用
                        </p>
                      )}
                    </>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
