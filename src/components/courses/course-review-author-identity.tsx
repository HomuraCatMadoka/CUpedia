import Link from "next/link";

import { ProfessionalBadgeLogo } from "@/components/courses/professional-badge-logo";
import { AchievementAvatar } from "@/components/user/achievement-avatar";
import type { PublicAchievementSummary } from "@/lib/achievement-profile";
import type { EquippedPersonTitle } from "@/lib/user-avatar";

export function CourseReviewAuthorIdentity({
  nickname,
  showcaseId,
  achievements = [],
  avatarUrl,
  equippedTitle,
  achievementLabel = "",
  variant = "review",
}: {
  nickname: string | null;
  showcaseId: string | null;
  achievements?: PublicAchievementSummary[];
  avatarUrl?: string | null;
  equippedTitle?: EquippedPersonTitle | null;
  achievementLabel?: string;
  variant?: "review" | "reply";
}) {
  const sortedAchievements = [...achievements].sort((a, b) => {
    const tierOrder = { gold: 0, silver: 1, bronze: 2 };
    return (
      tierOrder[a.tier] - tierOrder[b.tier] ||
      Number(b.primary) - Number(a.primary) ||
      a.badgeCode.localeCompare(b.badgeCode)
    );
  });

  if (variant === "review") {
    const avatar = (
      <AchievementAvatar image={avatarUrl} size="sm" title={equippedTitle} />
    );
    return (
      <div
        data-comment-level="review"
        className="flex min-w-0 items-start gap-3"
      >
        {showcaseId ? (
          <Link
            aria-label={`${nickname ?? "用户"}的成就橱窗`}
            className="shrink-0"
            href={`/courses/achievements/showcase/${showcaseId}`}
          >
            {avatar}
          </Link>
        ) : (
          avatar
        )}
        <div className="min-w-0 pt-0.5">
          <span className="block truncate">
            {showcaseId && nickname ? (
              <Link
                className="text-sm font-medium hover:underline"
                href={`/courses/achievements/showcase/${showcaseId}`}
              >
                {nickname}
              </Link>
            ) : (
              <span className="text-sm font-medium">
                {nickname ?? "匿名用户"}
              </span>
            )}
          </span>
          {sortedAchievements.length > 0 && (
            <div
              aria-label={achievementLabel}
              className="mt-1 flex flex-wrap items-end gap-1"
            >
              {sortedAchievements.map((achievement) => (
                <ProfessionalBadgeLogo
                  code={achievement.badgeCode}
                  compact
                  key={achievement.id}
                  size={achievement.primary ? 56 : 52}
                  tier={achievement.tier}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div data-comment-level="reply" className="min-w-0">
      {showcaseId && nickname ? (
        <Link
          className="text-sm font-medium break-words hover:underline"
          href={`/courses/achievements/showcase/${showcaseId}`}
        >
          {nickname}
        </Link>
      ) : (
        <span className="text-sm font-medium">{nickname ?? "匿名用户"}</span>
      )}
    </div>
  );
}
