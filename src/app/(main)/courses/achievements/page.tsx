import { AchievementNoticesSeen } from "@/components/courses/achievement-notices-seen";
import { PrimaryAchievementButton } from "@/components/courses/primary-achievement-button";
import {
  PersonTitleDismantleButton,
  PersonTitleFuseButton,
} from "@/components/courses/person-title-actions";
import { ProfessionalAchievementInventory } from "@/components/courses/professional-achievement-inventory";
import { ProfessionalBadgeLogo } from "@/components/courses/professional-badge-logo";
import { getMyPersonTitleProgress } from "@/lib/achievement-fusion-actions";
import { getMyProfessionalAchievementInventory } from "@/lib/achievement-inventory";
import { getMyAchievementNoticeState } from "@/lib/achievement-notice-actions";
import { getMyAchievementProfile } from "@/lib/achievement-profile";

export default async function CourseAchievementsPage() {
  const [inventory, profile, personTitles, noticeState] = await Promise.all([
    getMyProfessionalAchievementInventory(),
    getMyAchievementProfile(),
    getMyPersonTitleProgress(),
    getMyAchievementNoticeState(),
  ]);
  const primaryAchievementId =
    profile.achievements.find((achievement) => achievement.primary)?.id ?? null;
  const personAchievements = profile.achievements.filter(
    (achievement) => achievement.category === "person",
  );
  const noticeOrder = new Map(
    noticeState.notices.map((notice, index) => [notice.targetId, index]),
  );
  const personCandidates = personTitles
    .filter((title) => !title.redeemed)
    .sort(
      (a, b) =>
        (noticeOrder.get(a.recipeId) ?? Number.MAX_SAFE_INTEGER) -
          (noticeOrder.get(b.recipeId) ?? Number.MAX_SAFE_INTEGER) ||
        a.badgeCode.localeCompare(b.badgeCode),
    );

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-10">
        <AchievementNoticesSeen unseenCount={noticeState.unseenCount} />
        <h1 className="text-2xl font-bold">我的成就</h1>

        <ProfessionalAchievementInventory
          items={inventory}
          primaryAchievementId={primaryAchievementId}
        />

        {(personAchievements.length > 0 || personCandidates.length > 0) && (
          <section aria-labelledby="person-achievements" className="mt-10">
            <h2 className="text-lg font-semibold" id="person-achievements">
              人物成就
            </h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {personAchievements.map((achievement) => (
                <article
                  className="flex items-center gap-4 rounded-xl border bg-card p-4"
                  key={achievement.id}
                >
                  <ProfessionalBadgeLogo
                    code={achievement.badgeCode}
                    size={56}
                    tier="gold"
                  />
                  <div className="min-w-0 flex-1">
                    <h3 className="font-medium">{achievement.displayName}</h3>
                    <div className="mt-2 flex flex-wrap items-center gap-3">
                      <PrimaryAchievementButton
                        achievementId={achievement.id}
                        primary={achievement.primary}
                      />
                      <PersonTitleDismantleButton
                        achievementId={achievement.id}
                        displayName={achievement.displayName}
                      />
                    </div>
                  </div>
                </article>
              ))}

              {personCandidates.map((title) => (
                <article
                  className="flex items-center gap-4 rounded-xl border bg-card p-4"
                  key={title.recipeId}
                >
                  <ProfessionalBadgeLogo
                    code={title.badgeCode}
                    size={56}
                    tier="gold"
                  />
                  <div className="min-w-0 flex-1">
                    <h3 className="font-medium">{title.displayName}</h3>
                    {title.eligible ? (
                      <div className="mt-2">
                        <PersonTitleFuseButton
                          displayName={title.displayName}
                          recipeId={title.recipeId}
                        />
                      </div>
                    ) : (
                      <p className="mt-1 text-xs text-muted-foreground">
                        {title.slotAvailable
                          ? "还未集齐需要的专业成就"
                          : "目前已经拥有金级成就"}
                      </p>
                    )}
                  </div>
                </article>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
