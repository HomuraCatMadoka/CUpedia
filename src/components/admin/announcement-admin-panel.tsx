"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeftIcon } from "lucide-react";
import { toast } from "sonner";

import { AnnouncementAdminList } from "@/components/admin/announcement-admin-list";
import {
  ANNOUNCEMENT_DATE_FORMATTER,
  ANNOUNCEMENT_LIFECYCLE_BADGE_VARIANTS,
  ANNOUNCEMENT_LIFECYCLE_LABELS,
  announcementLifecycleOf,
  announcementOfflineReason,
} from "@/components/admin/announcement-admin-presentation";
import { useUnsavedAnnouncementNavigation } from "@/components/admin/use-unsaved-announcement-navigation";
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
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

type FormState = {
  title: string;
  content: string;
  priority: string;
  publishAt: string;
  expiresAt: string;
  publicationMode: PublicationMode;
  sendNotification: boolean;
};

type PublicationMode = "draft" | "immediate" | "scheduled";
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
  publicationMode: "draft",
  sendNotification: false,
};

const FIELD_IDS: Record<FormField, string> = {
  title: "announcement-title",
  content: "announcement-content",
  priority: "announcement-priority",
  publishAt: "announcement-publish-at",
  expiresAt: "announcement-expiry",
};

function toLocalDateTimeInput(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function formatDateTime(value: string): string | null {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? null
    : ANNOUNCEMENT_DATE_FORMATTER.format(date);
}

function toFormState(announcement: AdminAnnouncement, now: Date): FormState {
  const lifecycle = announcementLifecycleOf(announcement, now);
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
    publicationMode:
      lifecycle === "scheduled"
        ? "scheduled"
        : lifecycle === "draft" || lifecycle === "withdrawn"
          ? "draft"
          : "immediate",
    sendNotification:
      lifecycle !== "withdrawn" &&
      announcement.notifyOnPublish &&
      !announcement.notificationSentAt,
  };
}

export function AnnouncementAdminPanel({
  announcements,
  serverNow,
  initialAnnouncementId = null,
}: {
  announcements: AdminAnnouncement[];
  serverNow: string;
  initialAnnouncementId?: string | null;
}) {
  const router = useRouter();
  const initialAnnouncement =
    announcements.find((item) => item.id === initialAnnouncementId) ?? null;
  const initialForm = initialAnnouncement
    ? toFormState(initialAnnouncement, new Date(serverNow))
    : EMPTY_FORM;
  const [lifecycleNowMs, setLifecycleNowMs] = useState(() =>
    new Date(serverNow).getTime(),
  );
  const [isPending, startTransition] = useTransition();
  const [selectedId, setSelectedId] = useState<string | null>(
    initialAnnouncement?.id ?? null,
  );
  const [deleteTarget, setDeleteTarget] = useState<AdminAnnouncement | null>(
    null,
  );
  const [form, setForm] = useState<FormState>(initialForm);
  const [baselineForm, setBaselineForm] = useState<FormState>(initialForm);
  const [withdrawTarget, setWithdrawTarget] =
    useState<AdminAnnouncement | null>(null);
  const [publishDialogOpen, setPublishDialogOpen] = useState(false);
  const [publishDialogBaseline, setPublishDialogBaseline] =
    useState<FormState | null>(null);
  const [formError, setFormError] = useState<FormError | null>(null);
  const [mobileEditing, setMobileEditing] = useState(
    initialAnnouncement !== null,
  );
  const formErrorRef = useRef<HTMLParagraphElement>(null);
  const lifecycleNow = new Date(lifecycleNowMs);
  const selected = announcements.find((item) => item.id === selectedId) ?? null;
  const selectedLifecycle = selected
    ? announcementLifecycleOf(selected, lifecycleNow)
    : "draft";
  const isAlreadyPublic =
    selectedLifecycle === "published" || selectedLifecycle === "expired";
  const isDirty = JSON.stringify(form) !== JSON.stringify(baselineForm);
  const { confirmDiscardChanges } = useUnsavedAnnouncementNavigation({
    isDirty,
  });
  const editorOpen = mobileEditing || selected !== null;

  useEffect(() => {
    const serverEpoch = new Date(serverNow).getTime();
    const monotonicStart = performance.now();
    const timer = window.setInterval(() => {
      setLifecycleNowMs(serverEpoch + performance.now() - monotonicStart);
    }, 30_000);
    return () => window.clearInterval(timer);
  }, [serverNow]);

  function chooseAnnouncement(announcement: AdminAnnouncement) {
    if (!confirmDiscardChanges()) return;
    const nextForm = toFormState(announcement, lifecycleNow);
    setSelectedId(announcement.id);
    setForm(nextForm);
    setBaselineForm(nextForm);
    setFormError(null);
    setMobileEditing(true);
    const url = new URL(window.location.href);
    url.searchParams.set("announcement", announcement.id);
    window.history.replaceState(window.history.state, "", url);
  }

  function startNewAnnouncement() {
    if (!confirmDiscardChanges()) return;
    setSelectedId(null);
    setForm(EMPTY_FORM);
    setBaselineForm(EMPTY_FORM);
    setFormError(null);
    setMobileEditing(true);
    const url = new URL(window.location.href);
    url.searchParams.delete("announcement");
    window.history.replaceState(window.history.state, "", url);
  }

  function returnToList() {
    if (!confirmDiscardChanges()) return;
    setMobileEditing(false);
    const url = new URL(window.location.href);
    url.searchParams.delete("announcement");
    window.history.replaceState(window.history.state, "", url);
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

  function toInput(publicationMode = form.publicationMode): AnnouncementInput {
    const published = publicationMode !== "draft";
    return {
      title: form.title,
      content: form.content,
      priority: Number(form.priority),
      publishAt:
        publicationMode === "scheduled" && form.publishAt
          ? new Date(form.publishAt).toISOString()
          : null,
      expiresAt: form.expiresAt ? new Date(form.expiresAt).toISOString() : null,
      published,
      sendNotification:
        publicationMode === "immediate" && form.sendNotification,
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
                publicationMode: "draft" as const,
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
          setMobileEditing(false);
        }
        router.refresh();
      } catch (error) {
        showFormError(error, "保存失败");
      }
    });
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const intent = (event.nativeEvent as SubmitEvent).submitter?.getAttribute(
      "value",
    );
    if (!isAlreadyPublic && intent === "publish") {
      setPublishDialogBaseline(form);
      setForm((current) => ({
        ...current,
        publicationMode:
          current.publicationMode === "draft"
            ? "immediate"
            : current.publicationMode,
      }));
      setPublishDialogOpen(true);
      return;
    }
    saveAnnouncement(
      toInput(
        isAlreadyPublic || selectedLifecycle === "scheduled"
          ? form.publicationMode
          : "draft",
      ),
    );
  }

  function handleWithdraw() {
    if (!withdrawTarget) return;
    startTransition(async () => {
      try {
        await updateAnnouncement(withdrawTarget.id, toInput("draft"));
        const withdrawnForm: FormState = {
          ...form,
          publicationMode: "draft",
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
          setMobileEditing(false);
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
  const scheduledPublication = form.publicationMode === "scheduled";
  const formattedSchedule = form.publishAt
    ? formatDateTime(form.publishAt)
    : null;
  const usesPresetPriority = ["0", "50", "100"].includes(form.priority);
  const publishLabel = scheduledPublication ? "确认排期" : "确认发布";
  const publishDialogActionLabel =
    form.publicationMode === "draft" ? "保存为草稿" : publishLabel;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h1 className="text-2xl font-bold">公告管理</h1>
        <Button type="button" variant="outline" onClick={startNewAnnouncement}>
          新建公告
        </Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(18rem,0.72fr)_minmax(0,1.28fr)]">
        <AnnouncementAdminList
          announcements={announcements}
          now={lifecycleNow}
          selectedId={selectedId}
          hiddenOnMobile={mobileEditing}
          onSelect={chooseAnnouncement}
        />

        <form
          className={`${mobileEditing ? "block" : selected ? "hidden lg:block" : "hidden"} overflow-hidden rounded-xl border bg-background`}
          onSubmit={handleSubmit}
        >
          <header className="sticky top-0 z-10 flex items-start gap-3 border-b bg-background/95 px-4 py-4 backdrop-blur lg:px-5">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="lg:hidden"
              aria-label="返回公告列表"
              onClick={returnToList}
            >
              <ArrowLeftIcon aria-hidden="true" />
            </Button>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg font-semibold text-balance">
                  {selected ? form.title || "未命名公告" : "新建公告"}
                </h2>
                {selected && (
                  <Badge
                    variant={
                      ANNOUNCEMENT_LIFECYCLE_BADGE_VARIANTS[selectedLifecycle]
                    }
                  >
                    {ANNOUNCEMENT_LIFECYCLE_LABELS[selectedLifecycle]}
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
                  {announcementOfflineReason(selectedLifecycle)
                    ? `${announcementOfflineReason(selectedLifecycle)}；首次发布于 ${ANNOUNCEMENT_DATE_FORMATTER.format(new Date(selected.publishedAt!))}`
                    : selectedLifecycle === "scheduled" && selected.publishedAt
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
                onClick={() =>
                  selected.publishedAt === null
                    ? setDeleteTarget(selected)
                    : setWithdrawTarget(selected)
                }
              >
                {selected.publishedAt === null ? "删除" : "撤回"}
              </Button>
            )}
          </header>

          <div className="space-y-5 p-4 pb-28 lg:p-5 lg:pb-5">
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

            <section aria-label="公告内容" className="space-y-4">
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
                  rows={10}
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
                  {selectedLifecycle === "scheduled" ? "保存更改" : "保存草稿"}
                </Button>
              )}
              {isAlreadyPublic ? (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={isPending}
                    onClick={() => {
                      setPublishDialogBaseline(form);
                      setPublishDialogOpen(true);
                    }}
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
                  {selectedLifecycle === "scheduled" ? "发布设置…" : "发布…"}
                </Button>
              )}
            </div>
          </footer>
        </form>

        {!editorOpen && (
          <section className="hidden min-h-80 items-center justify-center rounded-xl border border-dashed text-center lg:flex">
            <div>
              <p className="font-medium">选择一条公告查看详情</p>
              <p className="mt-1 text-sm text-muted-foreground">
                或新建一条公告
              </p>
            </div>
          </section>
        )}
      </div>

      <Dialog
        open={publishDialogOpen}
        onOpenChange={(open) => {
          if (!open && publishDialogBaseline) {
            setForm(publishDialogBaseline);
            setPublishDialogBaseline(null);
          }
          setPublishDialogOpen(open);
        }}
      >
        <DialogContent
          className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg"
          showCloseButton={false}
        >
          <DialogHeader>
            <DialogTitle>
              {isAlreadyPublic ? "公告设置" : "发布公告"}
            </DialogTitle>
            <DialogDescription>
              {isAlreadyPublic
                ? "调整自动下线时间和首页排序。"
                : "选择发布时间；其他选项可按需设置。"}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5 py-1">
            {!isAlreadyPublic && (
              <fieldset className="space-y-2">
                <legend className="text-sm font-medium">发布时间</legend>
                <div className="grid gap-2 sm:grid-cols-2">
                  {(
                    [
                      ...(selectedLifecycle === "scheduled"
                        ? [["draft", "取消排期"] as const]
                        : []),
                      ["immediate", "立即发布"],
                      ["scheduled", "定时发布"],
                    ] as const
                  ).map(([value, label]) => (
                    <label
                      key={value}
                      className={`flex cursor-pointer items-center gap-2 rounded-lg border p-3 ${
                        form.publicationMode === value
                          ? "border-foreground bg-accent"
                          : ""
                      }`}
                    >
                      <input
                        type="radio"
                        name="dialogPublicationMode"
                        value={value}
                        checked={form.publicationMode === value}
                        onChange={() =>
                          setForm((current) => ({
                            ...current,
                            publicationMode: value,
                            publishAt:
                              value === "scheduled" ? current.publishAt : "",
                            sendNotification:
                              value !== "immediate"
                                ? false
                                : current.sendNotification,
                          }))
                        }
                      />
                      <span className="text-sm font-medium">{label}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
            )}

            {scheduledPublication && !isAlreadyPublic && (
              <div className="space-y-2">
                <Label htmlFor="announcement-publish-at">计划发布时间</Label>
                <Input
                  id="announcement-publish-at"
                  name="publishAt"
                  autoComplete="off"
                  type="datetime-local"
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
            )}

            {!notificationAlreadySent &&
              !isAlreadyPublic &&
              selectedLifecycle !== "withdrawn" &&
              form.publicationMode === "immediate" && (
                <label className="flex cursor-pointer items-start gap-3 rounded-lg border p-3">
                  <input
                    type="checkbox"
                    name="sendNotification"
                    className="mt-0.5 size-4"
                    checked={form.sendNotification}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        sendNotification: event.target.checked,
                      }))
                    }
                  />
                  <span>
                    <span className="block text-sm font-medium">
                      发送站内通知
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      每条公告只发送一次。
                    </span>
                  </span>
                </label>
              )}

            <details className="rounded-lg border px-3 py-2">
              <summary className="cursor-pointer text-sm font-medium">
                更多设置
              </summary>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="announcement-expiry">自动下线（可选）</Label>
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
                <div className="space-y-2">
                  <Label htmlFor="announcement-priority">首页排序</Label>
                  <select
                    id="announcement-priority"
                    name="priority"
                    autoComplete="off"
                    className="h-9 w-full rounded-lg border border-input bg-background px-3 text-sm focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                    value={form.priority}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        priority: event.target.value,
                      }))
                    }
                  >
                    {!usesPresetPriority && (
                      <option value={form.priority}>
                        自定义（{form.priority}）
                      </option>
                    )}
                    <option value="0">普通</option>
                    <option value="50">重要</option>
                    <option value="100">置顶</option>
                  </select>
                </div>
              </div>
            </details>

            {!isAlreadyPublic && (
              <p className="rounded-lg bg-muted px-3 py-2 text-sm">
                {form.publicationMode === "draft"
                  ? "将取消排期并保存为草稿。"
                  : scheduledPublication
                    ? formattedSchedule
                      ? `将于 ${formattedSchedule} 发布${form.sendNotification ? "，并发送通知。" : "。"}`
                      : "请选择计划发布时间。"
                    : `确认后立即上线${form.sendNotification ? "，并发送通知。" : "。"}`}
              </p>
            )}
          </div>

          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>
              取消
            </DialogClose>
            <Button
              type="button"
              disabled={
                isPending ||
                (!isAlreadyPublic && scheduledPublication && !formattedSchedule)
              }
              onClick={() => {
                const input = toInput();
                setPublishDialogBaseline(null);
                setPublishDialogOpen(false);
                saveAnnouncement(input);
              }}
            >
              {isAlreadyPublic ? "保存设置" : publishDialogActionLabel}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
    </div>
  );
}
