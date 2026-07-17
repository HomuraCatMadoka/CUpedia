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
        setError(cause instanceof Error ? cause.message : "点亮失败");
      }
    });
  }

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger render={<Button size="sm" />}>
        {upgrade ? "升级称号" : "点亮称号"}
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            确认{upgrade ? "升级" : "点亮"}「{displayName}」？
          </AlertDialogTitle>
          <AlertDialogDescription>
            系统会在后台固定符合条件的课程；页面不会展示或要求选择具体课程。
            {upgrade && " 升级后，原有低一级称号会从展示中消失。"}
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
                : "点亮中…"
              : upgrade
                ? "确认升级"
                : "确认点亮"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
