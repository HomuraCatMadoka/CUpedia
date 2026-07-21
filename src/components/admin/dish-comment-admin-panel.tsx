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
import type { AdminAuditLog } from "@/lib/admin-audit-types";

export function DishCommentAdminPanel({
  comments,
  auditLogs,
}: {
  comments: AdminDishComment[];
  auditLogs: AdminAuditLog[];
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
                  <Link
                    href={`/admin/users?q=${encodeURIComponent(comment.authorEmail)}`}
                    className="underline underline-offset-2"
                  >
                    {comment.authorNickname}（{comment.authorEmail}）
                  </Link>{" "}
                  ·{" "}
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

      <section
        className="space-y-3 border-t pt-6"
        aria-labelledby="comment-audit-heading"
      >
        <div>
          <h2 id="comment-audit-heading" className="text-lg font-semibold">
            最近删除记录
          </h2>
          <p className="text-sm text-muted-foreground">
            保留删除人、原评论及作者账号，供多管理员追溯。
          </p>
        </div>

        {auditLogs.length === 0 ? (
          <p className="text-sm text-muted-foreground">暂无删除记录。</p>
        ) : (
          <ul className="space-y-2">
            {auditLogs.map((log) => (
              <li key={log.id} className="rounded-lg border bg-muted/20 p-3">
                <p className="break-words text-sm">{log.details.content}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {log.details.canteenName} · {log.details.menuItemName} · 作者{" "}
                  <Link
                    href={`/admin/users?q=${encodeURIComponent(log.details.authorEmail)}`}
                    className="underline underline-offset-2"
                  >
                    {log.details.authorNickname}（{log.details.authorEmail}）
                  </Link>
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  由 {log.actorNickname}（{log.actorEmail}）删除 ·{" "}
                  {log.createdAt.toLocaleString("zh-HK", {
                    timeZone: "Asia/Hong_Kong",
                  })}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
