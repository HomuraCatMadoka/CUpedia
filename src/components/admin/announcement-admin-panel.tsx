"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { AnnouncementAdminEditor } from "@/components/admin/announcement-admin-editor";
import { AnnouncementAdminList } from "@/components/admin/announcement-admin-list";
import {
  ANNOUNCEMENT_DATE_FORMATTER,
  announcementLifecycleOf,
} from "@/components/admin/announcement-admin-presentation";
import {
  EMPTY_ANNOUNCEMENT_FORM,
  announcementToFormState,
  useAnnouncementAdminEditor,
  type AnnouncementFormState,
} from "@/components/admin/use-announcement-admin-editor";
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
import {
  createAnnouncement,
  deleteAnnouncement,
  updateAnnouncement,
} from "@/lib/announcement-actions";
import {
  type AdminAnnouncement,
  type AnnouncementInput,
} from "@/lib/announcement-types";

function formatDateTime(value: string): string | null {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? null
    : ANNOUNCEMENT_DATE_FORMATTER.format(date);
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
    ? announcementToFormState(initialAnnouncement, new Date(serverNow))
    : EMPTY_ANNOUNCEMENT_FORM;
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
  const [withdrawTarget, setWithdrawTarget] =
    useState<AdminAnnouncement | null>(null);
  const [publishDialogOpen, setPublishDialogOpen] = useState(false);
  const [publishDialogBaseline, setPublishDialogBaseline] =
    useState<AnnouncementFormState | null>(null);
  const editor = useAnnouncementAdminEditor({
    initialForm,
    initiallyOpen: initialAnnouncement !== null,
  });
  const { form, setForm } = editor;
  const lifecycleNow = new Date(lifecycleNowMs);
  const selected = announcements.find((item) => item.id === selectedId) ?? null;
  const selectedLifecycle = selected
    ? announcementLifecycleOf(selected, lifecycleNow)
    : "draft";
  const isAlreadyPublic =
    selectedLifecycle === "published" || selectedLifecycle === "expired";
  const { confirmDiscardChanges } = useUnsavedAnnouncementNavigation({
    isDirty: editor.isDirty,
  });
  const editorOpen = editor.mobileEditing || selected !== null;

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
    const nextForm = announcementToFormState(announcement, lifecycleNow);
    setSelectedId(announcement.id);
    editor.open(nextForm);
    const url = new URL(window.location.href);
    url.searchParams.set("announcement", announcement.id);
    window.history.replaceState(window.history.state, "", url);
  }

  function startNewAnnouncement() {
    if (!confirmDiscardChanges()) return;
    setSelectedId(null);
    editor.open(EMPTY_ANNOUNCEMENT_FORM);
    const url = new URL(window.location.href);
    url.searchParams.delete("announcement");
    window.history.replaceState(window.history.state, "", url);
  }

  function returnToList() {
    if (!confirmDiscardChanges()) return;
    editor.close();
    const url = new URL(window.location.href);
    url.searchParams.delete("announcement");
    window.history.replaceState(window.history.state, "", url);
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
    editor.setError(null);
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
          editor.markSaved(savedForm);
        } else {
          await createAnnouncement(input);
          toast.success(
            input.published
              ? input.publishAt && new Date(input.publishAt) > lifecycleNow
                ? "公告已排期"
                : "公告已发布"
              : "草稿已保存",
          );
          editor.markSaved(EMPTY_ANNOUNCEMENT_FORM);
          editor.close();
        }
        router.refresh();
      } catch (error) {
        editor.reportError(error, "保存失败");
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
        const withdrawnForm: AnnouncementFormState = {
          ...form,
          publicationMode: "draft",
          publishAt: "",
          expiresAt: "",
        };
        editor.markSaved(withdrawnForm);
        setWithdrawTarget(null);
        toast.success("公告已撤回");
        router.refresh();
      } catch (error) {
        editor.reportError(error, "撤回失败");
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
          editor.markSaved(EMPTY_ANNOUNCEMENT_FORM);
          editor.close();
        }
        setDeleteTarget(null);
        toast.success("公告已删除");
        router.refresh();
      } catch (error) {
        editor.reportError(error, "删除失败");
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
          hiddenOnMobile={editor.mobileEditing}
          onSelect={chooseAnnouncement}
        />

        <AnnouncementAdminEditor
          selected={selected}
          lifecycle={selectedLifecycle}
          isAlreadyPublic={isAlreadyPublic}
          isPending={isPending}
          editor={editor}
          onSubmit={handleSubmit}
          onReturnToList={returnToList}
          onOpenSettings={() => {
            setPublishDialogBaseline(form);
            setPublishDialogOpen(true);
          }}
          onDelete={() => selected && setDeleteTarget(selected)}
          onWithdraw={() => selected && setWithdrawTarget(selected)}
        />

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
                  aria-invalid={editor.error?.field === "publishAt"}
                  value={form.publishAt}
                  onChange={(event) => {
                    editor.clearFieldError("publishAt");
                    setForm((current) => ({
                      ...current,
                      publishAt: event.target.value,
                    }));
                  }}
                />
                {editor.error?.field === "publishAt" && (
                  <p className="text-sm text-destructive" role="alert">
                    {editor.error.message}
                  </p>
                )}
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
                    aria-invalid={editor.error?.field === "expiresAt"}
                    value={form.expiresAt}
                    onChange={(event) => {
                      editor.clearFieldError("expiresAt");
                      setForm((current) => ({
                        ...current,
                        expiresAt: event.target.value,
                      }));
                    }}
                  />
                  {editor.error?.field === "expiresAt" && (
                    <p className="text-sm text-destructive" role="alert">
                      {editor.error.message}
                    </p>
                  )}
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
