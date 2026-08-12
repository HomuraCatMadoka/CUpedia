"use client";

import { useEffect, useRef, useState, useTransition } from "react";
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
  getAnnouncementLifecycle,
  type AnnouncementLifecycle,
} from "@/lib/announcement-lifecycle";
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

type FormField = "title" | "content" | "priority" | "publishAt" | "expiresAt";

type FormError = {
  message: string;
  field: FormField | null;
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

const LIFECYCLE_LABELS: Record<AnnouncementLifecycle, string> = {
  draft: "草稿",
  scheduled: "待发布",
  published: "已发布",
  expired: "已失效",
  withdrawn: "已撤回",
};

const FIELD_IDS: Record<FormField, string> = {
  title: "announcement-title",
  content: "announcement-content",
  priority: "announcement-priority",
  publishAt: "announcement-publish-at",
  expiresAt: "announcement-expiry",
};

function lifecycleOf(
  announcement: AdminAnnouncement,
  now: Date,
): AnnouncementLifecycle {
  return getAnnouncementLifecycle(
    {
      publishedAt: announcement.publishedAt
        ? new Date(announcement.publishedAt)
        : null,
      withdrawnAt: announcement.withdrawnAt
        ? new Date(announcement.withdrawnAt)
        : null,
      expiresAt: announcement.expiresAt
        ? new Date(announcement.expiresAt)
        : null,
    },
    now,
  );
}

function toLocalDateTimeInput(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function toFormState(announcement: AdminAnnouncement, now: Date): FormState {
  const lifecycle = lifecycleOf(announcement, now);
  return {
    title: announcement.title,
    content: announcement.content,
    priority: String(announcement.priority),
    publishAt:
      lifecycle === "withdrawn"
        ? ""
        : toLocalDateTimeInput(announcement.publishedAt),
    expiresAt:
      lifecycle === "withdrawn"
        ? ""
        : toLocalDateTimeInput(announcement.expiresAt),
    published:
      announcement.publishedAt !== null && announcement.withdrawnAt === null,
    sendNotification:
      announcement.notifyOnPublish && !announcement.notificationSentAt,
  };
}

export function AnnouncementAdminPanel({
  announcements,
  serverNow,
}: {
  announcements: AdminAnnouncement[];
  serverNow: string;
}) {
  const router = useRouter();
  const [lifecycleNowMs, setLifecycleNowMs] = useState(() =>
    new Date(serverNow).getTime(),
  );
  const lifecycleNow = new Date(lifecycleNowMs);
  const [isPending, startTransition] = useTransition();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AdminAnnouncement | null>(
    null,
  );
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [baselineForm, setBaselineForm] = useState<FormState>(EMPTY_FORM);
  const [withdrawTarget, setWithdrawTarget] =
    useState<AdminAnnouncement | null>(null);
  const [publicationInput, setPublicationInput] =
    useState<AnnouncementInput | null>(null);
  const [formError, setFormError] = useState<FormError | null>(null);
  const formErrorRef = useRef<HTMLParagraphElement>(null);
  const selected = announcements.find((item) => item.id === selectedId) ?? null;
  const selectedLifecycle = selected
    ? lifecycleOf(selected, lifecycleNow)
    : "draft";
  const isAlreadyPublic =
    selectedLifecycle === "published" || selectedLifecycle === "expired";
  const isDirty = JSON.stringify(form) !== JSON.stringify(baselineForm);
  const isDirtyRef = useRef(isDirty);

  useEffect(() => {
    isDirtyRef.current = isDirty;
  }, [isDirty]);

  useEffect(() => {
    const serverEpoch = new Date(serverNow).getTime();
    const monotonicStart = performance.now();
    const timer = window.setInterval(() => {
      setLifecycleNowMs(serverEpoch + performance.now() - monotonicStart);
    }, 30_000);
    return () => window.clearInterval(timer);
  }, [serverNow]);

  useEffect(() => {
    const state = window.history.state as {
      cupediaAnnouncementNavigationGuardToken?: string;
    } | null;
    const existingToken = state?.cupediaAnnouncementNavigationGuardToken;
    const guardToken =
      existingToken ?? `announcement-${Date.now()}-${Math.random()}`;
    const guardedUrl = window.location.href;
    if (!existingToken) {
      window.history.pushState(
        {
          ...window.history.state,
          cupediaAnnouncementNavigationGuardToken: guardToken,
        },
        "",
        guardedUrl,
      );
    }

    let handlingTraversal = false;
    const handleHistoryNavigation = (event: PopStateEvent) => {
      const nextToken = (
        event.state as {
          cupediaAnnouncementNavigationGuardToken?: string;
        } | null
      )?.cupediaAnnouncementNavigationGuardToken;
      if (nextToken === guardToken || handlingTraversal) return;

      if (
        !isDirtyRef.current ||
        window.confirm("当前公告有未保存更改，确定要放弃这些更改吗？")
      ) {
        handlingTraversal = true;
        window.history.back();
        return;
      }

      window.history.pushState(
        {
          ...window.history.state,
          cupediaAnnouncementNavigationGuardToken: guardToken,
        },
        "",
        guardedUrl,
      );
    };
    window.addEventListener("popstate", handleHistoryNavigation);
    return () => {
      window.removeEventListener("popstate", handleHistoryNavigation);
    };
  }, []);

  useEffect(() => {
    if (!isDirty) return;
    const preventUnsavedExit = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    const preventUnsavedNavigation = (event: MouseEvent) => {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return;
      }
      const target = event.target;
      if (!(target instanceof Element)) return;
      const link = target.closest<HTMLAnchorElement>("a[href]");
      if (!link || link.target === "_blank" || link.hasAttribute("download")) {
        return;
      }
      const destination = new URL(link.href, window.location.href);
      if (
        destination.origin === window.location.origin &&
        destination.href !== window.location.href &&
        !window.confirm("当前公告有未保存更改，确定要放弃这些更改吗？")
      ) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    window.addEventListener("beforeunload", preventUnsavedExit);
    document.addEventListener("click", preventUnsavedNavigation, true);
    return () => {
      window.removeEventListener("beforeunload", preventUnsavedExit);
      document.removeEventListener("click", preventUnsavedNavigation, true);
    };
  }, [isDirty]);

  function confirmDiscardChanges() {
    return (
      !isDirty || window.confirm("当前公告有未保存更改，确定要放弃这些更改吗？")
    );
  }

  function chooseAnnouncement(announcement: AdminAnnouncement) {
    if (!confirmDiscardChanges()) return;
    const nextForm = toFormState(announcement, lifecycleNow);
    setSelectedId(announcement.id);
    setForm(nextForm);
    setBaselineForm(nextForm);
    setFormError(null);
  }

  function startNewAnnouncement() {
    if (!confirmDiscardChanges()) return;
    setSelectedId(null);
    setForm(EMPTY_FORM);
    setBaselineForm(EMPTY_FORM);
    setFormError(null);
  }

  function fieldForError(message: string): FormField | null {
    if (message.includes("标题")) return "title";
    if (message.includes("内容")) return "content";
    if (message.includes("优先级")) return "priority";
    if (message.includes("失效时间")) return "expiresAt";
    if (message.includes("发布时间")) return "publishAt";
    return null;
  }

  function showFormError(error: unknown, fallback: string) {
    const message = error instanceof Error ? error.message : fallback;
    const field = fieldForError(message);
    setFormError({ message, field });
    toast.error(message);
    window.requestAnimationFrame(() => {
      const target = field
        ? document.getElementById(FIELD_IDS[field])
        : formErrorRef.current;
      target?.focus();
    });
  }

  function clearFieldError(field: FormField) {
    setFormError((current) => (current?.field === field ? null : current));
  }

  function fieldError(field: FormField) {
    if (formError?.field !== field) return null;
    return (
      <p className="text-sm text-destructive" role="alert">
        {formError.message}
      </p>
    );
  }

  function toInput(published = form.published): AnnouncementInput {
    return {
      title: form.title,
      content: form.content,
      priority: Number(form.priority),
      publishAt: form.publishAt ? new Date(form.publishAt).toISOString() : null,
      expiresAt: form.expiresAt ? new Date(form.expiresAt).toISOString() : null,
      published,
      sendNotification: published && form.sendNotification,
    };
  }

  function saveAnnouncement(input: AnnouncementInput) {
    setFormError(null);
    startTransition(async () => {
      try {
        if (selectedId) {
          await updateAnnouncement(selectedId, input);
          toast.success("公告已更新");
          const savedForm = input.published
            ? form
            : {
                ...form,
                publishAt: "",
                sendNotification: false,
              };
          setForm(savedForm);
          setBaselineForm(savedForm);
        } else {
          await createAnnouncement(input);
          toast.success(
            input.published
              ? input.publishAt && new Date(input.publishAt) > lifecycleNow
                ? "公告已排期"
                : "公告已发布"
              : "草稿已保存",
          );
          setForm(EMPTY_FORM);
          setBaselineForm(EMPTY_FORM);
        }
        router.refresh();
      } catch (error) {
        showFormError(error, "保存失败");
      }
    });
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const input = toInput();
    if (!isAlreadyPublic && input.published) {
      setPublicationInput(input);
      return;
    }
    saveAnnouncement(input);
  }

  function handleWithdraw() {
    if (!withdrawTarget) return;
    startTransition(async () => {
      try {
        await updateAnnouncement(withdrawTarget.id, toInput(false));
        const withdrawnForm = {
          ...form,
          published: false,
          publishAt: "",
          expiresAt: "",
        };
        setForm(withdrawnForm);
        setBaselineForm(withdrawnForm);
        setWithdrawTarget(null);
        toast.success("公告已撤回");
        router.refresh();
      } catch (error) {
        showFormError(error, "撤回失败");
      }
    });
  }

  function handleDelete() {
    if (!deleteTarget) return;
    startTransition(async () => {
      try {
        await deleteAnnouncement(deleteTarget.id);
        if (selectedId === deleteTarget.id) {
          setSelectedId(null);
          setForm(EMPTY_FORM);
          setBaselineForm(EMPTY_FORM);
          setFormError(null);
        }
        setDeleteTarget(null);
        toast.success("公告已删除");
        router.refresh();
      } catch (error) {
        showFormError(error, "删除失败");
      }
    });
  }

  const notificationAlreadySent = Boolean(selected?.notificationSentAt);
  const scheduledPublication = Boolean(
    form.publishAt && new Date(form.publishAt) > lifecycleNow,
  );
  const submitLabel = isAlreadyPublic
    ? "保存更改"
    : !form.published
      ? "保存草稿"
      : scheduledPublication
        ? "排期发布"
        : "立即发布";

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
                    {LIFECYCLE_LABELS[lifecycleOf(announcement, lifecycleNow)]}
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
            {formError?.field === null && (
              <p
                ref={formErrorRef}
                className="mt-2 text-sm text-destructive outline-none"
                role="alert"
                aria-live="assertive"
                tabIndex={-1}
              >
                {formError.message}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="announcement-title">标题</Label>
            <Input
              id="announcement-title"
              name="title"
              autoComplete="off"
              required
              maxLength={ANNOUNCEMENT_TITLE_MAX_LENGTH}
              aria-invalid={formError?.field === "title"}
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
              rows={12}
              maxLength={ANNOUNCEMENT_CONTENT_MAX_LENGTH}
              aria-invalid={formError?.field === "content"}
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
            <p className="text-right text-xs text-muted-foreground">
              {form.content.length} / {ANNOUNCEMENT_CONTENT_MAX_LENGTH}
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="announcement-priority">优先级（0–100）</Label>
              <Input
                id="announcement-priority"
                name="priority"
                autoComplete="off"
                type="number"
                min={0}
                max={100}
                required
                aria-invalid={formError?.field === "priority"}
                value={form.priority}
                onChange={(event) => {
                  clearFieldError("priority");
                  setForm((current) => ({
                    ...current,
                    priority: event.target.value,
                  }));
                }}
              />
              {fieldError("priority")}
            </div>
            <div className="space-y-2">
              <Label htmlFor="announcement-publish-at">
                {isAlreadyPublic
                  ? "首次发布时间（发布后不可修改）"
                  : "发布时间（留空为立即）"}
              </Label>
              <Input
                id="announcement-publish-at"
                name="publishAt"
                autoComplete="off"
                type="datetime-local"
                disabled={!form.published || isAlreadyPublic}
                aria-invalid={formError?.field === "publishAt"}
                value={form.publishAt}
                onChange={(event) => {
                  clearFieldError("publishAt");
                  setForm((current) => ({
                    ...current,
                    publishAt: event.target.value,
                  }));
                }}
              />
              {fieldError("publishAt")}
            </div>
            <div className="space-y-2">
              <Label htmlFor="announcement-expiry">失效时间（可选）</Label>
              <Input
                id="announcement-expiry"
                name="expiresAt"
                autoComplete="off"
                type="datetime-local"
                aria-invalid={formError?.field === "expiresAt"}
                value={form.expiresAt}
                onChange={(event) => {
                  clearFieldError("expiresAt");
                  setForm((current) => ({
                    ...current,
                    expiresAt: event.target.value,
                  }));
                }}
              />
              {fieldError("expiresAt")}
            </div>
          </div>

          <div className="space-y-4 border-t pt-5">
            {!isAlreadyPublic && (
              <div className="flex items-center justify-between gap-4">
                <div>
                  <Label htmlFor="announcement-published">发布公告</Label>
                  <p className="text-xs text-muted-foreground">
                    开启后可立即或定时发布；关闭后保存为草稿。
                  </p>
                </div>
                <Switch
                  id="announcement-published"
                  name="published"
                  checked={form.published}
                  onCheckedChange={(published) =>
                    setForm((current) => ({
                      ...current,
                      published,
                      publishAt: published ? current.publishAt : "",
                      sendNotification: published
                        ? current.sendNotification
                        : false,
                    }))
                  }
                />
              </div>
            )}
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
                name="sendNotification"
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
              <div>
                <Button
                  type="button"
                  variant="destructive"
                  disabled={isPending || isDirty}
                  onClick={() => setDeleteTarget(selected)}
                >
                  删除公告
                </Button>
                {isDirty && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    请先保存或放弃当前更改，再删除公告。
                  </p>
                )}
              </div>
            ) : isAlreadyPublic && selected ? (
              <div>
                <Button
                  type="button"
                  variant="destructive"
                  disabled={isPending || isDirty}
                  onClick={() => setWithdrawTarget(selected)}
                >
                  撤回公告
                </Button>
                {isDirty && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    请先保存或放弃当前更改，再撤回公告。
                  </p>
                )}
              </div>
            ) : (
              <span />
            )}
            <Button type="submit" disabled={isPending}>
              {isPending ? "正在保存…" : submitLabel}
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

      <AlertDialog
        open={withdrawTarget !== null}
        onOpenChange={(open) => {
          if (!open) setWithdrawTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>撤回这条公告？</AlertDialogTitle>
            <AlertDialogDescription>
              「{withdrawTarget?.title}
              」将从首页、全部公告和详情页下线。既有通知会保留为发布记录。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction disabled={isPending} onClick={handleWithdraw}>
              确认撤回
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={publicationInput !== null}
        onOpenChange={(open) => {
          if (!open) setPublicationInput(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {scheduledPublication ? "确认排期发布？" : "确认立即发布？"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {scheduledPublication
                ? `公告将在 ${DATE_FORMATTER.format(new Date(form.publishAt))} 自动公开。`
                : "公告保存后会立即公开。"}
              {form.sendNotification
                ? "届时会向当前未封禁用户发送一次站内通知。"
                : "此次不会发送站内通知。"}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>返回检查</AlertDialogCancel>
            <AlertDialogAction
              disabled={isPending}
              onClick={() => {
                if (!publicationInput) return;
                const input = publicationInput;
                setPublicationInput(null);
                saveAnnouncement(input);
              }}
            >
              {scheduledPublication ? "确认排期" : "确认发布"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
