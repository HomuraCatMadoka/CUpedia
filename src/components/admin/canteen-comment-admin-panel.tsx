"use client";

import { useState, useTransition } from "react";
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
import { adminDeleteDishComment } from "@/lib/canteen-comment-actions";
import type { AdminCanteenDishComment } from "@/lib/canteen-types";

export function CanteenCommentAdminPanel({
  comments,
}: {
  comments: AdminCanteenDishComment[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [deleteTarget, setDeleteTarget] =
    useState<AdminCanteenDishComment | null>(null);

  function handleDelete() {
    if (!deleteTarget) return;
    startTransition(async () => {
      try {
        await adminDeleteDishComment(deleteTarget.id);
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
        <h1 className="text-2xl font-bold">菜品评论管理</h1>
        <p className="text-sm text-muted-foreground">
          可删除任意菜品评论，删除后不可恢复。
        </p>
      </div>

      {comments.length === 0 ? (
        <p className="text-muted-foreground">暂无菜品评论。</p>
      ) : (
        <ul className="space-y-2" aria-label="菜品评论列表">
          {comments.map((comment) => (
            <li
              key={comment.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3"
            >
              <div className="min-w-0 flex-1">
                <p className="font-medium">{comment.content}</p>
                <p className="text-xs text-muted-foreground">
                  {comment.canteenName} · {comment.menuItemName} ·{" "}
                  {comment.authorNickname} ·{" "}
                  {comment.createdAt.toLocaleString("zh-HK", {
                    timeZone: "Asia/Hong_Kong",
                  })}
                </p>
              </div>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => setDeleteTarget(comment)}
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
            <AlertDialogTitle>删除这条评论？</AlertDialogTitle>
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
