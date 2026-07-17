import Link from "next/link";

import { AchievementRedeemButton } from "@/components/courses/achievement-redeem-button";
import { AchievementNoticesSeen } from "@/components/courses/achievement-notices-seen";
import { AchievementRevokeButton } from "@/components/courses/achievement-revoke-button";
import { PrimaryAchievementButton } from "@/components/courses/primary-achievement-button";
import {
  PersonTitleDismantleButton,
  PersonTitleFuseButton,
} from "@/components/courses/person-title-actions";
import { ProfessionalBadgeLogo } from "@/components/courses/professional-badge-logo";
import { getMyProfessionalAchievementProgress } from "@/lib/achievement-actions";
import { getMyPersonTitleProgress } from "@/lib/achievement-fusion-actions";
import { getMyAchievementProfile } from "@/lib/achievement-profile";
import { getMyAchievementNoticeState } from "@/lib/achievement-notice-actions";

export default async function CourseAchievementsPage() {
  const [progress, profile, personTitles, noticeState] = await Promise.all([
    getMyProfessionalAchievementProgress(),
    getMyAchievementProfile(),
    getMyPersonTitleProgress(),
    getMyAchievementNoticeState(),
  ]);
  const noticeOrder = new Map(
    noticeState.notices.map((notice, index) => [notice.targetId, index]),
  );
  const candidates = progress
    .filter((item) => !item.redeemed)
    .sort(
      (a, b) =>
        (noticeOrder.get(a.ruleId) ?? Number.MAX_SAFE_INTEGER) -
        (noticeOrder.get(b.ruleId) ?? Number.MAX_SAFE_INTEGER),
    );
  const orderedPersonTitles = [...personTitles].sort(
    (a, b) =>
      (noticeOrder.get(a.recipeId) ?? Number.MAX_SAFE_INTEGER) -
      (noticeOrder.get(b.recipeId) ?? Number.MAX_SAFE_INTEGER),
  );

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto max-w-5xl px-6 py-10">
        <AchievementNoticesSeen unseenCount={noticeState.unseenCount} />
        <h1 className="text-2xl font-bold">我的成就</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          评分课程即可推进专业称号；候选进度实时计算。
        </p>
        <Link
          className="mt-3 inline-flex text-sm font-medium underline underline-offset-4"
          href={`/courses/achievements/showcase/${profile.showcaseId}`}
        >
          查看我的公开成就橱窗
        </Link>

        {noticeState.notices.length > 0 && (
          <section
            className="mt-6 rounded-2xl border bg-secondary/20 p-5"
            aria-labelledby="current-achievement-opportunities"
          >
            <h2
              className="font-semibold"
              id="current-achievement-opportunities"
            >
              现在可以点亮
            </h2>
            <div className="mt-2 flex flex-wrap gap-2">
              {noticeState.notices.map((notice) => (
                <a
                  className="rounded-full border bg-background px-3 py-1 text-sm"
                  href="#achievement-opportunities"
                  key={notice.opportunityKey}
                >
                  {notice.displayName}
                </a>
              ))}
            </div>
          </section>
        )}

        {profile.achievements.length > 0 && (
          <section className="mt-8" aria-labelledby="owned-achievements">
            <h2 className="text-sm font-medium" id="owned-achievements">
              已有称号
            </h2>
            <div className="mt-3 flex flex-wrap gap-3">
              {profile.achievements.map((achievement) => (
                <div
                  className="flex items-center gap-3 rounded-xl border bg-card p-3"
                  key={achievement.id}
                >
                  <ProfessionalBadgeLogo
                    code={achievement.badgeCode}
                    size={40}
                    tier={achievement.tier}
                  />
                  <div>
                    <p className="text-sm font-medium">
                      {achievement.displayName}
                    </p>
                    <PrimaryAchievementButton
                      achievementId={achievement.id}
                      primary={achievement.primary}
                    />
                    {achievement.category === "person" ? (
                      <PersonTitleDismantleButton
                        achievementId={achievement.id}
                        displayName={achievement.displayName}
                      />
                    ) : (
                      <AchievementRevokeButton
                        achievementId={achievement.id}
                        displayName={achievement.displayName}
                      />
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
        {orderedPersonTitles.some((title) => !title.redeemed) && (
          <section className="mt-8" aria-labelledby="person-title-candidates">
            <h2 className="text-sm font-medium" id="person-title-candidates">
              可合成人名称号
            </h2>
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              {orderedPersonTitles
                .filter((title) => !title.redeemed)
                .map((title) => (
                  <article
                    className="flex gap-4 rounded-2xl border bg-card p-5"
                    key={title.recipeId}
                  >
                    <ProfessionalBadgeLogo
                      code={title.badgeCode}
                      size={64}
                      tier="gold"
                    />
                    <div className="min-w-0 flex-1">
                      <h3 className="font-semibold">{title.displayName}</h3>
                      {title.description && (
                        <p className="mt-1 text-sm text-muted-foreground">
                          {title.description}
                        </p>
                      )}
                      {title.eligible ? (
                        <div className="mt-3">
                          <PersonTitleFuseButton
                            displayName={title.displayName}
                            recipeId={title.recipeId}
                          />
                        </div>
                      ) : (
                        <p className="mt-3 text-xs text-muted-foreground">
                          {title.slotAvailable
                            ? "来源称号尚未集齐"
                            : "金标称号槽位已占用"}
                        </p>
                      )}
                    </div>
                  </article>
                ))}
            </div>
          </section>
        )}

        {candidates.length === 0 &&
        !personTitles.some((title) => !title.redeemed) ? (
          <div className="mt-8 rounded-2xl border border-dashed p-10 text-center text-sm text-muted-foreground">
            暂无可兑换或升级的专业成就
          </div>
        ) : (
          <div
            className="mt-8 grid gap-4 sm:grid-cols-2"
            id="achievement-opportunities"
          >
            {candidates.map((item) => (
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
