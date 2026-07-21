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
import { adminDeleteDishComment } from "@/lib/canteen-comment-actions";
import {
  ADMIN_DISH_COMMENT_LIST_LIMIT,
  type AdminDishComment,
} from "@/lib/canteen-types";

export function DishCommentAdminPanel({
  comments,
}: {
  comments: AdminDishComment[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [deleteTarget, setDeleteTarget] = useState<AdminDishComment | null>(
    null,
  );

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
        <h1 className="text-2xl font-bold">评论管理</h1>
        <p className="text-sm text-muted-foreground">
          最近 {ADMIN_DISH_COMMENT_LIST_LIMIT}{" "}
          条菜品评论（新→旧）。封禁用户请前往{" "}
          <Link href="/admin/users" className="underline underline-offset-2">
            用户管理
          </Link>
          。
        </p>
      </div>

      {comments.length === 0 ? (
        <p className="text-muted-foreground">暂无评论。</p>
      ) : (
        <ul className="space-y-2">
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
