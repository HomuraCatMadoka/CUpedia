"use client";

import { ArrowLeftIcon } from "lucide-react";

import {
  ANNOUNCEMENT_DATE_FORMATTER,
  ANNOUNCEMENT_LIFECYCLE_BADGE_VARIANTS,
  ANNOUNCEMENT_LIFECYCLE_LABELS,
  announcementOfflineReason,
} from "@/components/admin/announcement-admin-presentation";
import type {
  AnnouncementAdminEditorController,
  AnnouncementFormField,
} from "@/components/admin/use-announcement-admin-editor";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { AnnouncementLifecycle } from "@/lib/announcement-lifecycle";
import {
  ANNOUNCEMENT_CONTENT_MAX_LENGTH,
  ANNOUNCEMENT_TITLE_MAX_LENGTH,
  type AdminAnnouncement,
} from "@/lib/announcement-types";

export function AnnouncementAdminEditor({
  selected,
  lifecycle,
  isAlreadyPublic,
  isPending,
  editor,
  onSubmit,
  onReturnToList,
  onOpenSettings,
  onDelete,
  onWithdraw,
}: {
  selected: AdminAnnouncement | null;
  lifecycle: AnnouncementLifecycle;
  isAlreadyPublic: boolean;
  isPending: boolean;
  editor: AnnouncementAdminEditorController;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  onReturnToList: () => void;
  onOpenSettings: () => void;
  onDelete: () => void;
  onWithdraw: () => void;
}) {
  const { form, setForm, error, generalErrorRef, isDirty, clearFieldError } =
    editor;
  const fieldError = (field: AnnouncementFormField) => {
    if (error?.field !== field) return null;
    return (
      <p className="text-sm text-destructive" role="alert">
        {error.message}
      </p>
    );
  };

  return (
    <form
      className={`${editor.mobileEditing ? "block" : selected ? "hidden lg:block" : "hidden"} overflow-hidden rounded-xl border bg-background`}
      onSubmit={onSubmit}
    >
      <header className="sticky top-0 z-10 flex items-start gap-3 border-b bg-background/95 px-4 py-4 backdrop-blur lg:px-5">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="lg:hidden"
          aria-label="返回公告列表"
          onClick={onReturnToList}
        >
          <ArrowLeftIcon aria-hidden="true" />
        </Button>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold text-balance">
              {selected ? form.title || "未命名公告" : "新建公告"}
            </h2>
            {selected && (
              <Badge variant={ANNOUNCEMENT_LIFECYCLE_BADGE_VARIANTS[lifecycle]}>
                {ANNOUNCEMENT_LIFECYCLE_LABELS[lifecycle]}
              </Badge>
            )}
            {isDirty && (
              <span className="text-xs text-muted-foreground">未保存</span>
            )}
            {selected?.notificationSentAt && (
              <span className="text-xs text-muted-foreground">已通知</span>
            )}
          </div>
          {selected && (
            <p className="mt-1 text-xs text-muted-foreground">
              {announcementOfflineReason(lifecycle)
                ? `${announcementOfflineReason(lifecycle)}；首次发布于 ${ANNOUNCEMENT_DATE_FORMATTER.format(new Date(selected.publishedAt!))}`
                : lifecycle === "scheduled" && selected.publishedAt
                  ? `计划 ${ANNOUNCEMENT_DATE_FORMATTER.format(new Date(selected.publishedAt))} 发布`
                  : selected.publishedAt
                    ? `首次发布于 ${ANNOUNCEMENT_DATE_FORMATTER.format(new Date(selected.publishedAt))}`
                    : `更新于 ${ANNOUNCEMENT_DATE_FORMATTER.format(new Date(selected.updatedAt))}`}
            </p>
          )}
        </div>
        {selected && (selected.publishedAt === null || isAlreadyPublic) && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-destructive hover:text-destructive"
            disabled={isPending || isDirty}
            onClick={selected.publishedAt === null ? onDelete : onWithdraw}
          >
            {selected.publishedAt === null ? "删除" : "撤回"}
          </Button>
        )}
      </header>

      <div className="space-y-5 p-4 pb-28 lg:p-5 lg:pb-5">
        {error?.field === null && (
          <p
            ref={generalErrorRef}
            className="mt-2 text-sm text-destructive outline-none"
            role="alert"
            aria-live="assertive"
            tabIndex={-1}
          >
            {error.message}
          </p>
        )}
        <section aria-label="公告内容" className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="announcement-title">标题</Label>
            <Input
              id="announcement-title"
              name="title"
              autoComplete="off"
              required
              maxLength={ANNOUNCEMENT_TITLE_MAX_LENGTH}
              aria-invalid={error?.field === "title"}
              value={form.title}
              onChange={(event) => {
                clearFieldError("title");
                setForm((current) => ({
                  ...current,
                  title: event.target.value,
                }));
              }}
            />
            {fieldError("title")}
          </div>
          <div className="space-y-2">
            <Label htmlFor="announcement-content">正文</Label>
            <Textarea
              id="announcement-content"
              name="content"
              autoComplete="off"
              required
              rows={10}
              maxLength={ANNOUNCEMENT_CONTENT_MAX_LENGTH}
              aria-invalid={error?.field === "content"}
              value={form.content}
              onChange={(event) => {
                clearFieldError("content");
                setForm((current) => ({
                  ...current,
                  content: event.target.value,
                }));
              }}
            />
            {fieldError("content")}
            <p className="text-right font-mono text-xs tabular-nums text-muted-foreground">
              {form.content.length} / {ANNOUNCEMENT_CONTENT_MAX_LENGTH}
            </p>
          </div>
        </section>
      </div>

      <footer className="fixed inset-x-0 bottom-0 z-20 flex items-center justify-between gap-3 border-t bg-background/95 px-4 py-3 backdrop-blur lg:sticky lg:inset-auto lg:bottom-0 lg:px-5">
        <span className="text-xs text-muted-foreground">
          {isPending ? "正在保存…" : isDirty ? "未保存" : ""}
        </span>
        <div className="flex gap-2">
          {!isAlreadyPublic && (
            <Button type="submit" variant="outline" disabled={isPending}>
              {lifecycle === "scheduled" ? "保存更改" : "保存草稿"}
            </Button>
          )}
          {isAlreadyPublic ? (
            <>
              <Button
                type="button"
                variant="outline"
                disabled={isPending}
                onClick={onOpenSettings}
              >
                设置…
              </Button>
              <Button type="submit" disabled={isPending}>
                保存更改
              </Button>
            </>
          ) : (
            <Button
              type="submit"
              name="intent"
              value="publish"
              disabled={isPending}
            >
              {lifecycle === "scheduled" ? "发布设置…" : "发布…"}
            </Button>
          )}
        </div>
      </footer>
    </form>
  );
}
