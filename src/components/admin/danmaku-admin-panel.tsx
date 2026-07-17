"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { adminDeleteDanmaku } from "@/lib/danmaku-actions";
import type { AdminDanmakuMessage } from "@/lib/danmaku-types";
import { currentMonthHkt } from "@/lib/hkt-datetime";

export function DanmakuAdminPanel({
  messages,
}: {
  messages: AdminDanmakuMessage[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [deleteTarget, setDeleteTarget] = useState<AdminDanmakuMessage | null>(
    null,
  );
  const month = currentMonthHkt();

  function handleDelete() {
    if (!deleteTarget) return;
    startTransition(async () => {
      try {
        await adminDeleteDanmaku(
          deleteTarget.scope === "canteen"
            ? {
                id: deleteTarget.id,
                scope: "canteen",
                canteenId: deleteTarget.canteenId,
              }
            : { id: deleteTarget.id, scope: "hub" },
        );
        setDeleteTarget(null);
        router.refresh();
      } catch {
        alert("删除失败");
      }
    });
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">弹幕管理</h1>
        <p className="text-sm text-muted-foreground">
          当前月份（HKT）：{month}。封禁用户请前往{" "}
          <Link href="/admin/users" className="underline underline-offset-2">
            用户管理
          </Link>
          。
        </p>
      </div>

      {messages.length === 0 ? (
        <p className="text-muted-foreground">本月暂无弹幕。</p>
      ) : (
        <ul className="space-y-2">
          {messages.map((msg) => (
            <li
              key={msg.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3"
            >
              <div className="min-w-0 flex-1">
                <p className="font-medium">{msg.content}</p>
                <p className="text-xs text-muted-foreground">
                  {msg.scope === "canteen" ? msg.canteenName : "食堂总览"} ·{" "}
                  {msg.authorNickname} ·{" "}
                  {msg.createdAt.toLocaleString("zh-HK", {
                    timeZone: "Asia/Hong_Kong",
                  })}
                </p>
              </div>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => setDeleteTarget(msg)}
              >
                删除
              </Button>
            </li>
          ))}
        </ul>
      )}

      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除这条弹幕？</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget
                ? `将永久删除「${deleteTarget.content}」，不可恢复。`
                : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction disabled={pending} onClick={handleDelete}>
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
