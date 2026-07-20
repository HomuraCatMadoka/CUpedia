"use client";

import { useEffect } from "react";

import { markAchievementNoticesSeen } from "@/lib/achievement-notice-actions";

export function AchievementNoticesSeen({
  unseenCount,
}: {
  unseenCount: number;
}) {
  useEffect(() => {
    if (unseenCount > 0) void markAchievementNoticesSeen();
  }, [unseenCount]);
  return null;
}
