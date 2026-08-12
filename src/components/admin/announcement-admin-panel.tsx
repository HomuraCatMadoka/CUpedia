"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  createAnnouncement,
  deleteAnnouncement,
  updateAnnouncement,
} from "@/lib/announcement-actions";
import {
  ANNOUNCEMENT_CONTENT_MAX_LENGTH,
  ANNOUNCEMENT_TITLE_MAX_LENGTH,
  type AdminAnnouncement,
  type AnnouncementInput,
} from "@/lib/announcement-types";

const DATE_FORMATTER = new Intl.DateTimeFormat("zh-HK", {
  year: "numeric",
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Asia/Hong_Kong",
});

type FormState = {
  title: string;
  content: string;
  priority: string;
  publishAt: string;
  expiresAt: string;
  published: boolean;
  sendNotification: boolean;
};

const EMPTY_FORM: FormState = {
  title: "",
  content: "",
  priority: "0",
  publishAt: "",
  expiresAt: "",
  published: false,
  sendNotification: false,
};

function toLocalDateTimeInput(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function toFormState(announcement: AdminAnnouncement): FormState {
  return {
    title: announcement.title,
    content: announcement.content,
    priority: String(announcement.priority),
    publishAt: toLocalDateTimeInput(announcement.publishedAt),
    expiresAt: toLocalDateTimeInput(announcement.expiresAt),
    published:
      announcement.publishedAt !== null && announcement.withdrawnAt === null,
    sendNotification:
      announcement.notifyOnPublish && !announcement.notificationSentAt,
  };
}

export function AnnouncementAdminPanel({
  announcements,
}: {
  announcements: AdminAnnouncement[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AdminAnnouncement | null>(
    null,
  );
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const selected = announcements.find((item) => item.id === selectedId) ?? null;

  function chooseAnnouncement(announcement: AdminAnnouncement) {
    setSelectedId(announcement.id);
    setForm(toFormState(announcement));
  }

  function startNewAnnouncement() {
    setSelectedId(null);
    setForm(EMPTY_FORM);
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const input: AnnouncementInput = {
      title: form.title,
      content: form.content,
      priority: Number(form.priority),
      publishAt: form.publishAt ? new Date(form.publishAt).toISOString() : null,
      expiresAt: form.expiresAt ? new Date(form.expiresAt).toISOString() : null,
      published: form.published,
      sendNotification: form.sendNotification,
    };

    startTransition(async () => {
      try {
        if (selectedId) {
          await updateAnnouncement(selectedId, input);
          toast.success("公告已更新");
        } else {
          await createAnnouncement(input);
          toast.success(form.published ? "公告已发布" : "草稿已保存");
          setForm(EMPTY_FORM);
        }
        router.refresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "保存失败");
      }
    });
  }

  function handleDelete() {
    if (!deleteTarget) return;
    startTransition(async () => {
      try {
        await deleteAnnouncement(deleteTarget.id);
        if (selectedId === deleteTarget.id) startNewAnnouncement();
        setDeleteTarget(null);
        toast.success("公告已删除");
        router.refresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "删除失败");
      }
    });
  }

  const notificationAlreadySent = Boolean(selected?.notificationSentAt);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">公告管理</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            首页最多展示 3 条有效公告；完整列表每页显示 10 条。
          </p>
        </div>
        <Button type="button" variant="outline" onClick={startNewAnnouncement}>
          新建公告
        </Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(16rem,0.7fr)_minmax(0,1.3fr)]">
        <section aria-label="公告列表" className="space-y-2">
          {announcements.length === 0 ? (
            <p className="rounded-lg border p-6 text-center text-sm text-muted-foreground">
              暂无公告
            </p>
          ) : (
            announcements.map((announcement) => (
              <button
                key={announcement.id}
                type="button"
                onClick={() => chooseAnnouncement(announcement)}
                className={`w-full rounded-lg border p-3 text-left transition-colors hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none ${
                  selectedId === announcement.id
                    ? "border-foreground bg-accent"
                    : ""
                }`}
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="line-clamp-1 font-medium">
                    {announcement.title}
                  </span>
                  <Badge
                    variant={announcement.publishedAt ? "default" : "secondary"}
                  >
                    {announcement.withdrawnAt
                      ? "已撤回"
                      : announcement.expiresAt &&
                          new Date(announcement.expiresAt) <= new Date()
                        ? "已失效"
                        : announcement.publishedAt
                          ? new Date(announcement.publishedAt) > new Date()
                            ? "待发布"
                            : "已发布"
                          : "草稿"}
                  </Badge>
                </span>
                <span className="mt-1 block text-xs text-muted-foreground">
                  更新于{" "}
                  {DATE_FORMATTER.format(new Date(announcement.updatedAt))}
                </span>
              </button>
            ))
          )}
        </section>

        <form
          className="space-y-5 rounded-xl border p-5"
          onSubmit={handleSubmit}
        >
          <div>
            <h2 className="text-lg font-semibold">
              {selected ? "编辑公告" : "新建公告"}
            </h2>
            {selected?.notificationSentAt && (
              <p className="mt-1 text-xs text-muted-foreground">
                此公告已于{` `}
                {DATE_FORMATTER.format(new Date(selected.notificationSentAt))}
                {` `}同步到通知中心，再次保存不会重复发送。
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="announcement-title">标题</Label>
            <Input
              id="announcement-title"
              required
              maxLength={ANNOUNCEMENT_TITLE_MAX_LENGTH}
              value={form.title}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  title: event.target.value,
                }))
              }
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="announcement-content">正文</Label>
            <Textarea
              id="announcement-content"
              required
              rows={12}
              maxLength={ANNOUNCEMENT_CONTENT_MAX_LENGTH}
              value={form.content}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  content: event.target.value,
                }))
              }
            />
            <p className="text-right text-xs text-muted-foreground">
              {form.content.length} / {ANNOUNCEMENT_CONTENT_MAX_LENGTH}
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="announcement-priority">优先级（0–100）</Label>
              <Input
                id="announcement-priority"
                type="number"
                min={0}
                max={100}
                required
                value={form.priority}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    priority: event.target.value,
                  }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="announcement-publish-at">
                发布时间（留空为立即）
              </Label>
              <Input
                id="announcement-publish-at"
                type="datetime-local"
                disabled={!form.published}
                value={form.publishAt}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    publishAt: event.target.value,
                  }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="announcement-expiry">失效时间（可选）</Label>
              <Input
                id="announcement-expiry"
                type="datetime-local"
                value={form.expiresAt}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    expiresAt: event.target.value,
                  }))
                }
              />
            </div>
          </div>

          <div className="space-y-4 border-t pt-5">
            <div className="flex items-center justify-between gap-4">
              <div>
                <Label htmlFor="announcement-published">发布公告</Label>
                <p className="text-xs text-muted-foreground">
                  可立即或定时发布；关闭后保存为草稿或撤回已发布公告。
                </p>
              </div>
              <Switch
                id="announcement-published"
                checked={form.published}
                onCheckedChange={(published) =>
                  setForm((current) => ({
                    ...current,
                    published,
                    sendNotification: published
                      ? current.sendNotification
                      : false,
                  }))
                }
              />
            </div>
            <div className="flex items-center justify-between gap-4">
              <div>
                <Label htmlFor="announcement-notification">
                  同步到通知中心
                </Label>
                <p className="text-xs text-muted-foreground">
                  仅首次发布时发送给当前未封禁用户。
                </p>
              </div>
              <Switch
                id="announcement-notification"
                checked={form.sendNotification}
                disabled={!form.published || notificationAlreadySent}
                onCheckedChange={(sendNotification) =>
                  setForm((current) => ({ ...current, sendNotification }))
                }
              />
            </div>
          </div>

          <div className="flex flex-wrap justify-between gap-3 border-t pt-5">
            {selected && !selected.publishedAt ? (
              <Button
                type="button"
                variant="destructive"
                disabled={isPending}
                onClick={() => setDeleteTarget(selected)}
              >
                删除公告
              </Button>
            ) : (
              <span />
            )}
            <Button type="submit" disabled={isPending}>
              {isPending ? "正在保存…" : "保存"}
            </Button>
          </div>
        </form>
      </div>

      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除这条公告？</AlertDialogTitle>
            <AlertDialogDescription>
              将永久删除草稿「{deleteTarget?.title}」，此操作不可恢复。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction disabled={isPending} onClick={handleDelete}>
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
