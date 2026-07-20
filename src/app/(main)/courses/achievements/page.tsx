import { AchievementNoticesSeen } from "@/components/courses/achievement-notices-seen";
import { HiddenAchievementInventory } from "@/components/courses/hidden-achievement-inventory";
import { ProfessionalAchievementInventory } from "@/components/courses/professional-achievement-inventory";
import { getMyHiddenAchievementGroups } from "@/lib/hidden-achievement-actions";
import { getMyProfessionalAchievementInventory } from "@/lib/achievement-inventory";
import { getMyAchievementNoticeState } from "@/lib/achievement-notice-actions";
import { getMyAchievementProfile } from "@/lib/achievement-profile";

export default async function CourseAchievementsPage() {
  const [inventory, profile, hiddenAchievements, noticeState] =
    await Promise.all([
      getMyProfessionalAchievementInventory(),
      getMyAchievementProfile(),
      getMyHiddenAchievementGroups(),
      getMyAchievementNoticeState(),
    ]);
  const primaryAchievementId =
    profile.achievements.find((achievement) => achievement.primary)?.id ?? null;

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-10">
        <AchievementNoticesSeen unseenCount={noticeState.unseenCount} />
        <h1 className="text-2xl font-bold">我的成就</h1>

        <ProfessionalAchievementInventory
          items={inventory}
          primaryAchievementId={primaryAchievementId}
        />

        <HiddenAchievementInventory
          avatarUrl={profile.avatarUrl}
          groups={hiddenAchievements}
        />
      </div>
    </div>
  );
}
