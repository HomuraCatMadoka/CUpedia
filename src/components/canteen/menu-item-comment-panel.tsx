"use client";

import Link from "next/link";
import { useCallback, useState, useTransition } from "react";
import type { CanteenDishComment } from "@/lib/canteen-types";
import {
  createDishComment,
  deleteDishComment,
  getCommentsForMenuItem,
  updateDishComment,
} from "@/lib/canteen-comment-actions";
import { cn } from "@/lib/utils";
import { useContributorSetup } from "@/components/auth/contributor-setup-provider";

type MenuItemCommentPanelProps = {
  menuItemId: string;
  currentUserId: string | null;
  commentBlocked?: "banned" | null;
  /** Server-rendered count so "评论 (N)" shows before expand/load. */
  initialCommentCount?: number;
};

function commentErrorMessage(code: string): string {
  if (code === "INVALID_COMMENT") return "评论内容无效（纯文本，最多 500 字）";
  if (code === "SENSITIVE_CONTENT") return "内容包含敏感词，无法发送";
  return "操作失败，请重试";
}

export function MenuItemCommentPanel({
  menuItemId,
  currentUserId,
  commentBlocked = null,
  initialCommentCount = 0,
}: MenuItemCommentPanelProps) {
  const [expanded, setExpanded] = useState(false);
  const [comments, setComments] = useState<CanteenDishComment[] | null>(null);
  const [draft, setDraft] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const { ensureContributorSetup } = useContributorSetup();

  const loadComments = useCallback(() => {
    startTransition(async () => {
      try {
        const rows = await getCommentsForMenuItem(menuItemId);
        setComments(rows);
        setError(null);
      } catch {
        setError("加载评论失败");
      }
    });
  }, [menuItemId]);

  function handleToggle() {
    const next = !expanded;
    setExpanded(next);
    if (next && comments === null) loadComments();
  }

  function handleCreate() {
    const content = draft.trim();
    if (!content) return;
    startTransition(async () => {
      if (!(await ensureContributorSetup())) return;
      try {
        const created = await createDishComment(menuItemId, content);
        setComments((prev) => [...(prev ?? []), created]);
        setDraft("");
        setError(null);
      } catch (err) {
        const code = err instanceof Error ? err.message : "COMMENT_FAILED";
        if (code === "NEXT_REDIRECT") {
          setError("请登录后发表评论");
          return;
        }
        setError(commentErrorMessage(code));
      }
    });
  }

  function startEdit(comment: CanteenDishComment) {
    setEditingId(comment.id);
    setEditDraft(comment.content);
    setError(null);
  }

  function handleUpdate(commentId: string) {
    const content = editDraft.trim();
    if (!content) return;
    startTransition(async () => {
      try {
        const updated = await updateDishComment(commentId, content);
        setComments((prev) =>
          (prev ?? []).map((c) => (c.id === commentId ? updated : c)),
        );
        setEditingId(null);
        setEditDraft("");
        setError(null);
      } catch (err) {
        const code = err instanceof Error ? err.message : "COMMENT_FAILED";
        setError(commentErrorMessage(code));
      }
    });
  }

  function handleDelete(commentId: string) {
    startTransition(async () => {
      try {
        await deleteDishComment(commentId);
        setComments((prev) => (prev ?? []).filter((c) => c.id !== commentId));
        setError(null);
      } catch {
        setError("删除失败");
      }
    });
  }

  const count = comments?.length ?? initialCommentCount;

  return (
    <div className="w-full basis-full">
      <button
        type="button"
        aria-expanded={expanded}
        onClick={handleToggle}
        className={cn(
          "canteen-comment-toggle mt-1.5",
          expanded && "canteen-comment-toggle-on",
        )}
      >
        评论{" "}
        <span className="font-mono tabular-nums">{count}</span>
      </button>

      {expanded ? (
        <div className={cn("mt-2 space-y-3", pending && "opacity-80")}>
          {comments === null ? (
            <p className="text-sm text-[var(--canteen-muted)]">加载中…</p>
          ) : comments.length === 0 ? (
            <p className="text-sm text-[var(--canteen-muted)]">暂无评论</p>
          ) : (
            <ul
              className="divide-y divide-[var(--canteen-line)] border-y border-[var(--canteen-line)]"
              aria-label="菜品评论"
            >
              {comments.map((comment) => (
                <li key={comment.id} className="py-2.5 text-sm">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="font-medium text-[var(--canteen-ink)]">
                      {comment.authorNickname}
                    </p>
                    {currentUserId === comment.userId &&
                    editingId !== comment.id ? (
                      <div className="flex shrink-0 gap-2">
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() => startEdit(comment)}
                          className="text-xs text-[var(--canteen-muted)] hover:text-[var(--canteen-ink)]"
                        >
                          编辑
                        </button>
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() => handleDelete(comment.id)}
                          className="text-xs text-[var(--canteen-evening)] hover:underline"
                        >
                          删除
                        </button>
                      </div>
                    ) : null}
                  </div>
                  {editingId === comment.id ? (
                    <div className="mt-1.5 space-y-2">
                      <textarea
                        value={editDraft}
                        onChange={(e) => setEditDraft(e.target.value)}
                        maxLength={500}
                        rows={2}
                        aria-label="编辑评论内容"
                        className="canteen-comment-input w-full"
                      />
                      <div className="flex gap-3">
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() => handleUpdate(comment.id)}
                          className="text-xs font-medium text-[var(--canteen-purple)] hover:underline"
                        >
                          保存
                        </button>
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() => {
                            setEditingId(null);
                            setEditDraft("");
                          }}
                          className="text-xs text-[var(--canteen-muted)] hover:underline"
                        >
                          取消
                        </button>
                      </div>
                    </div>
                  ) : (
                    <p className="mt-0.5 whitespace-pre-wrap break-words leading-relaxed text-[var(--canteen-ink)]/90">
                      {comment.content}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}

          {commentBlocked === "banned" ? (
            <p className="text-xs text-[var(--canteen-muted)]" role="status">
              账号已封禁，无法发表评论
            </p>
          ) : currentUserId ? (
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="写下你的短评…"
                maxLength={500}
                rows={2}
                className="canteen-comment-input min-w-0 flex-1"
              />
              <button
                type="button"
                disabled={pending || !draft.trim()}
                onClick={handleCreate}
                className="canteen-comment-submit shrink-0 disabled:opacity-40"
              >
                发表
              </button>
            </div>
          ) : (
            <p className="text-xs text-[var(--canteen-muted)]">
              <Link
                href="/login"
                className="text-[var(--canteen-purple)] hover:underline"
              >
                登录
              </Link>
              后可发表评论
            </p>
          )}

          {error ? (
            <p className="text-xs text-red-600" role="alert">
              {error}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
