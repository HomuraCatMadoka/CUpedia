"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { revokeProfessionalAchievement } from "@/lib/achievement-actions";

export function AchievementRevokeButton({
  achievementId,
  displayName,
}: {
  achievementId: string;
  displayName: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  function revoke() {
    setError("");
    startTransition(async () => {
      try {
        await revokeProfessionalAchievement(achievementId);
        setOpen(false);
        router.refresh();
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "撤销失败");
      }
    });
  }

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger
        render={<Button className="h-auto p-0" variant="link" />}
      >
        撤销称号
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>撤销「{displayName}」？</AlertDialogTitle>
          <AlertDialogDescription>
            整个专业称号会从展示中移除，相关评分不会删除。之后仍可重新点亮，不能只降一级。
          </AlertDialogDescription>
        </AlertDialogHeader>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>取消</AlertDialogCancel>
          <AlertDialogAction
            disabled={pending}
            onClick={revoke}
            variant="destructive"
          >
            {pending ? "撤销中…" : "确认撤销"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
