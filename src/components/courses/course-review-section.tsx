"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ThumbsUpIcon, Trash2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  addReview,
  deleteReview,
  toggleLike,
  searchProfessors,
  type ProfessorOption,
  type CourseReviewView,
} from "@/lib/course-review-actions";

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  if (minutes < 1) return "刚刚";
  if (minutes < 60) return `${minutes} 分钟前`;
  if (hours < 24) return `${hours} 小时前`;
  if (days < 30) return `${days} 天前`;
  return new Date(iso).toLocaleDateString("zh-CN");
}

export function CourseReviewSection({
  code,
  reviews,
  isAuthenticated,
}: {
  code: string;
  reviews: CourseReviewView[];
  isAuthenticated: boolean;
}) {
  const router = useRouter();
  const [content, setContent] = useState("");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [professorQuery, setProfessorQuery] = useState("");
  const [professorOptions, setProfessorOptions] = useState<ProfessorOption[]>(
    [],
  );
  const [professor, setProfessor] = useState<ProfessorOption | null>(null);

  function handleProfessorQuery(value: string) {
    setProfessorQuery(value);
    setProfessor(null);
    startTransition(async () =>
      setProfessorOptions(await searchProfessors(code, value)),
    );
  }

  function handleSubmit() {
    const trimmed = content.trim();
    if (!trimmed) return;
    setError("");
    startTransition(async () => {
      try {
        if (!professor) throw new Error("请选择任课教授");
        await addReview(code, trimmed, professor.id);
        setContent("");
        setProfessorQuery("");
        setProfessor(null);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "发表失败");
      }
    });
  }

  function handleLike(id: string) {
    setBusyId(id);
    startTransition(async () => {
      try {
        await toggleLike(id);
        router.refresh();
      } finally {
        setBusyId(null);
      }
    });
  }

  function handleDelete(id: string) {
    setBusyId(id);
    startTransition(async () => {
      try {
        await deleteReview(id);
        router.refresh();
      } finally {
        setBusyId(null);
      }
    });
  }

  return (
    <section className="space-y-6">
      <div className="flex items-baseline justify-between">
        <h2 className="text-lg font-semibold">课程评论</h2>
        <span className="text-sm text-muted-foreground">
          {reviews.length} 条评论
        </span>
      </div>

      {isAuthenticated ? (
        <div className="space-y-2 rounded-xl border p-4">
          <div className="relative">
            <input
              value={professorQuery}
              onChange={(event) => handleProfessorQuery(event.target.value)}
              placeholder="搜索任课教授姓名"
              className="h-9 w-full rounded-md border bg-transparent px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            {!professor && professorQuery && professorOptions.length > 0 && (
              <ul className="absolute z-10 mt-1 max-h-48 w-full overflow-auto rounded-md border bg-popover p-1 shadow-md">
                {professorOptions.map((option) => (
                  <li key={option.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setProfessor(option);
                        setProfessorQuery(option.name);
                        setProfessorOptions([]);
                      }}
                      className="w-full rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent"
                    >
                      {option.name}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <Textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="匿名分享你对这门课的看法…"
            rows={3}
            className="resize-none text-sm"
            maxLength={2000}
          />
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">
              评论将以「匿名用户」显示
            </span>
            <Button
              size="sm"
              onClick={handleSubmit}
              disabled={pending || !content.trim() || !professor}
            >
              {pending ? "发表中…" : "发表评论"}
            </Button>
          </div>
        </div>
      ) : (
        <div className="rounded-xl border bg-secondary/40 p-4 text-sm text-muted-foreground">
          请先{" "}
          <Link href="/login" className="font-medium text-foreground underline">
            登录
          </Link>{" "}
          后发表评论或点赞。
        </div>
      )}

      <ul className="space-y-3">
        {reviews.length === 0 && (
          <li className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
            还没有评论，来做第一个分享的人吧。
          </li>
        )}
        {reviews.map((r) => (
          <li key={r.id} className="rounded-xl border p-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">匿名用户</span>
              <span className="text-xs text-muted-foreground">
                {timeAgo(r.createdAt)}
              </span>
            </div>
            <p className="mt-2 text-sm whitespace-pre-wrap">{r.content}</p>
            {r.professorName && (
              <p className="mt-1 text-xs text-muted-foreground">
                任课教授：{r.professorName}
              </p>
            )}
            <div className="mt-3 flex items-center gap-3">
              <button
                type="button"
                onClick={() => isAuthenticated && handleLike(r.id)}
                disabled={!isAuthenticated || (pending && busyId === r.id)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs transition-colors",
                  r.likedByMe
                    ? "bg-primary/10 text-primary"
                    : "bg-secondary text-muted-foreground hover:bg-accent",
                  !isAuthenticated && "cursor-not-allowed opacity-60",
                )}
                title={isAuthenticated ? "点赞" : "登录后可点赞"}
              >
                <ThumbsUpIcon
                  className={cn("h-3.5 w-3.5", r.likedByMe && "fill-current")}
                />
                {r.likeCount}
              </button>
              {r.isOwn && (
                <button
                  type="button"
                  onClick={() => handleDelete(r.id)}
                  disabled={pending && busyId === r.id}
                  className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs text-destructive transition-colors hover:bg-destructive/10"
                  title="撤回我的评论"
                >
                  <Trash2Icon className="h-3.5 w-3.5" />
                  撤回
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
