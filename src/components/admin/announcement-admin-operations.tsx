"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

import { ANNOUNCEMENT_DATE_FORMATTER } from "@/components/admin/announcement-admin-presentation";
import {
  EMPTY_ANNOUNCEMENT_FORM,
  type AnnouncementAdminEditorController,
  type AnnouncementFormState,
} from "@/components/admin/use-announcement-admin-editor";
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
import type { AnnouncementLifecycle } from "@/lib/announcement-lifecycle";
import type {
  AdminAnnouncement,
  AnnouncementInput,
} from "@/lib/announcement-types";

function formatDateTime(value: string): string | null {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? null
    : ANNOUNCEMENT_DATE_FORMATTER.format(date);
}

export function useAnnouncementAdminOperations({
  selected,
  lifecycle,
  lifecycleNow,
  editor,
  onRefresh,
  onDeletedSelection,
}: {
  selected: AdminAnnouncement | null;
  lifecycle: AnnouncementLifecycle;
  lifecycleNow: Date;
  editor: AnnouncementAdminEditorController;
  onRefresh: () => void;
  onDeletedSelection: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [deleteTarget, setDeleteTarget] = useState<AdminAnnouncement | null>(
    null,
  );
  const [withdrawTarget, setWithdrawTarget] =
    useState<AdminAnnouncement | null>(null);
  const [publishDialogOpen, setPublishDialogOpen] = useState(false);
  const [publishDialogBaseline, setPublishDialogBaseline] =
    useState<AnnouncementFormState | null>(null);
  const { form, setForm } = editor;
  const isAlreadyPublic = lifecycle === "published" || lifecycle === "expired";
  const canDelete = selected !== null && selected.publishedAt === null;
  const canWithdraw = selected !== null && isAlreadyPublic;

  function toInput(publicationMode = form.publicationMode): AnnouncementInput {
    return {
      title: form.title,
      content: form.content,
      priority: Number(form.priority),
      publishAt:
        publicationMode === "scheduled" && form.publishAt
          ? new Date(form.publishAt).toISOString()
          : null,
      expiresAt: form.expiresAt ? new Date(form.expiresAt).toISOString() : null,
      published: publicationMode !== "draft",
      sendNotification:
        publicationMode === "immediate" && form.sendNotification,
    };
  }

  function save(input: AnnouncementInput) {
    editor.setError(null);
    startTransition(async () => {
      try {
        if (selected) {
          await updateAnnouncement(selected.id, input);
          toast.success("公告已更新");
          editor.markSaved(
            input.published
              ? form
              : {
                  ...form,
                  publishAt: "",
                  sendNotification: false,
                  publicationMode: "draft",
                },
          );
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
        onRefresh();
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
    save(
      toInput(
        isAlreadyPublic || lifecycle === "scheduled"
          ? form.publicationMode
          : "draft",
      ),
    );
  }

  function withdraw() {
    if (!withdrawTarget) return;
    startTransition(async () => {
      try {
        await updateAnnouncement(withdrawTarget.id, toInput("draft"));
        editor.markSaved({
          ...form,
          publicationMode: "draft",
          publishAt: "",
          expiresAt: "",
        });
        setWithdrawTarget(null);
        toast.success("公告已撤回");
        onRefresh();
      } catch (error) {
        editor.reportError(error, "撤回失败");
      }
    });
  }

  function remove() {
    if (!deleteTarget) return;
    startTransition(async () => {
      try {
        await deleteAnnouncement(deleteTarget.id);
        if (selected?.id === deleteTarget.id) {
          editor.markSaved(EMPTY_ANNOUNCEMENT_FORM);
          editor.close();
          onDeletedSelection();
        }
        setDeleteTarget(null);
        toast.success("公告已删除");
        onRefresh();
      } catch (error) {
        editor.reportError(error, "删除失败");
      }
    });
  }

  return {
    isPending,
    isAlreadyPublic,
    canDelete,
    canWithdraw,
    handleSubmit,
    openSettings: () => {
      setPublishDialogBaseline(form);
      setPublishDialogOpen(true);
    },
    requestDelete: () => {
      if (canDelete) setDeleteTarget(selected);
    },
    requestWithdraw: () => {
      if (canWithdraw) setWithdrawTarget(selected);
    },
    dialogs: (
      <AnnouncementAdminOperationDialogs
        selected={selected}
        lifecycle={lifecycle}
        editor={editor}
        isPending={isPending}
        isAlreadyPublic={isAlreadyPublic}
        publishDialogOpen={publishDialogOpen}
        publishDialogBaseline={publishDialogBaseline}
        setPublishDialogOpen={setPublishDialogOpen}
        setPublishDialogBaseline={setPublishDialogBaseline}
        deleteTarget={deleteTarget}
        setDeleteTarget={setDeleteTarget}
        withdrawTarget={withdrawTarget}
        setWithdrawTarget={setWithdrawTarget}
        toInput={toInput}
        save={save}
        withdraw={withdraw}
        remove={remove}
      />
    ),
  };
}

function AnnouncementAdminOperationDialogs({
  selected,
  lifecycle,
  editor,
  isPending,
  isAlreadyPublic,
  publishDialogOpen,
  publishDialogBaseline,
  setPublishDialogOpen,
  setPublishDialogBaseline,
  deleteTarget,
  setDeleteTarget,
  withdrawTarget,
  setWithdrawTarget,
  toInput,
  save,
  withdraw,
  remove,
}: {
  selected: AdminAnnouncement | null;
  lifecycle: AnnouncementLifecycle;
  editor: AnnouncementAdminEditorController;
  isPending: boolean;
  isAlreadyPublic: boolean;
  publishDialogOpen: boolean;
  publishDialogBaseline: AnnouncementFormState | null;
  setPublishDialogOpen: (open: boolean) => void;
  setPublishDialogBaseline: (form: AnnouncementFormState | null) => void;
  deleteTarget: AdminAnnouncement | null;
  setDeleteTarget: (target: AdminAnnouncement | null) => void;
  withdrawTarget: AdminAnnouncement | null;
  setWithdrawTarget: (target: AdminAnnouncement | null) => void;
  toInput: () => AnnouncementInput;
  save: (input: AnnouncementInput) => void;
  withdraw: () => void;
  remove: () => void;
}) {
  const { form, setForm } = editor;
  const scheduled = form.publicationMode === "scheduled";
  const formattedSchedule = form.publishAt
    ? formatDateTime(form.publishAt)
    : null;
  const actionLabel =
    form.publicationMode === "draft"
      ? "保存为草稿"
      : scheduled
        ? "确认排期"
        : "确认发布";
  const presetPriority = ["0", "50", "100"].includes(form.priority);

  return (
    <>
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
                      ...(lifecycle === "scheduled"
                        ? [["draft", "取消排期"] as const]
                        : []),
                      ["immediate", "立即发布"],
                      ["scheduled", "定时发布"],
                    ] as const
                  ).map(([value, label]) => (
                    <label
                      key={value}
                      className={`flex cursor-pointer items-center gap-2 rounded-lg border p-3 ${form.publicationMode === value ? "border-foreground bg-accent" : ""}`}
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
                              value === "immediate"
                                ? current.sendNotification
                                : false,
                          }))
                        }
                      />
                      <span className="text-sm font-medium">{label}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
            )}
            {scheduled && !isAlreadyPublic && (
              <div className="space-y-2">
                <Label htmlFor="announcement-publish-at">计划发布时间</Label>
                <Input
                  id="announcement-publish-at"
                  name="publishAt"
                  type="datetime-local"
                  autoComplete="off"
                  value={form.publishAt}
                  aria-invalid={editor.error?.field === "publishAt"}
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
            {!selected?.notificationSentAt &&
              !isAlreadyPublic &&
              lifecycle !== "withdrawn" &&
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
                    type="datetime-local"
                    autoComplete="off"
                    value={form.expiresAt}
                    aria-invalid={editor.error?.field === "expiresAt"}
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
                    {!presetPriority && (
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
                  : scheduled
                    ? formattedSchedule
                      ? `将于 ${formattedSchedule} 发布。`
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
                (!isAlreadyPublic && scheduled && !formattedSchedule)
              }
              onClick={() => {
                const input = toInput();
                setPublishDialogBaseline(null);
                setPublishDialogOpen(false);
                save(input);
              }}
            >
              {isAlreadyPublic ? "保存设置" : actionLabel}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
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
            <AlertDialogAction disabled={isPending} onClick={remove}>
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog
        open={withdrawTarget !== null}
        onOpenChange={(open) => !open && setWithdrawTarget(null)}
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
            <AlertDialogAction disabled={isPending} onClick={withdraw}>
              确认撤回
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
