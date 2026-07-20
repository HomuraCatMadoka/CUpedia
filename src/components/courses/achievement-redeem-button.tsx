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
import { redeemProfessionalAchievement } from "@/lib/achievement-actions";

export function AchievementRedeemButton({
  displayName,
  ruleId,
  upgrade = false,
}: {
  displayName: string;
  ruleId: string;
  upgrade?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  function redeem() {
    setError("");
    startTransition(async () => {
      try {
        await redeemProfessionalAchievement(ruleId);
        setOpen(false);
        router.refresh();
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "领取失败");
      }
    });
  }

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger render={<Button size="sm" />}>
        {upgrade ? "升级成就" : "领取成就"}
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            确认{upgrade ? "升级" : "领取"}「{displayName}」？
          </AlertDialogTitle>
          <AlertDialogDescription>
            系统会固定符合条件的课程；这些课程不能再用于领取其他专业成就。
            {upgrade && " 升级后，原有低一级成就会从展示中消失。"}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {error && (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>取消</AlertDialogCancel>
          <AlertDialogAction disabled={pending} onClick={redeem}>
            {pending
              ? upgrade
                ? "升级中…"
                : "领取中…"
              : upgrade
                ? "确认升级"
                : "确认领取"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
