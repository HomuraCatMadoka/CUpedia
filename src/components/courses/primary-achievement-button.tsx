"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { setPrimaryAchievement } from "@/lib/achievement-profile-actions";

export function PrimaryAchievementButton({
  achievementId,
  primary,
}: {
  achievementId: string;
  primary: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");

  return (
    <div>
      <Button
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            try {
              setError("");
              await setPrimaryAchievement(primary ? null : achievementId);
              router.refresh();
            } catch (cause) {
              setError(cause instanceof Error ? cause.message : "操作失败");
            }
          })
        }
        size="sm"
        type="button"
        variant={primary ? "secondary" : "outline"}
      >
        {pending ? "保存中…" : primary ? "取消评论旁展示" : "设为评论旁展示"}
      </Button>
      {error && (
        <p className="mt-1 text-xs text-destructive" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
