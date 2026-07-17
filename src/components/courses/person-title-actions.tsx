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
import {
  dismantlePersonTitle,
  fusePersonTitle,
} from "@/lib/achievement-fusion-actions";

export function PersonTitleFuseButton({
  recipeId,
  displayName,
}: {
  recipeId: string;
  displayName: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [makePrimary, setMakePrimary] = useState(true);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  function fuse() {
    startTransition(async () => {
      try {
        await fusePersonTitle(recipeId, makePrimary);
        setOpen(false);
        router.refresh();
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "合成失败");
      }
    });
  }
  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger render={<Button size="sm" />}>
        合成称号
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>合成「{displayName}」？</AlertDialogTitle>
          <AlertDialogDescription>
            来源称号会暂时从展示中消失，但其课程归属会保留；之后可以拆解恢复。
          </AlertDialogDescription>
        </AlertDialogHeader>
        <label className="flex items-center gap-2 text-sm">
          <input
            checked={makePrimary}
            onChange={(event) => setMakePrimary(event.target.checked)}
            type="checkbox"
          />
          同时设为主称号
        </label>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>取消</AlertDialogCancel>
          <AlertDialogAction disabled={pending} onClick={fuse}>
            {pending ? "合成中…" : "确认合成"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function PersonTitleDismantleButton({
  achievementId,
  displayName,
}: {
  achievementId: string;
  displayName: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  function dismantle() {
    startTransition(async () => {
      await dismantlePersonTitle(achievementId);
      setOpen(false);
      router.refresh();
    });
  }
  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger
        render={<Button className="h-auto p-0" variant="link" />}
      >
        拆解称号
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>拆解「{displayName}」？</AlertDialogTitle>
          <AlertDialogDescription>
            人名称号会消失，合成时使用的来源称号会恢复展示。
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>取消</AlertDialogCancel>
          <AlertDialogAction disabled={pending} onClick={dismantle}>
            {pending ? "拆解中…" : "确认拆解"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
