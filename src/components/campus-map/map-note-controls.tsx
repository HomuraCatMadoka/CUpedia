"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  commandCampusMapNoteAction,
  setCampusMapNoteSubscriptionAction,
} from "@/lib/campus-map/map-note-actions";
import type {
  CampusMapNoteCommand,
  CampusMapNoteCommandResult,
  CampusMapNoteResolutionReason,
  CampusMapNoteStatus,
} from "@/lib/campus-map/map-notes-contract";

export function CampusMapNoteControls({
  noteId,
  revision,
  status,
  subscribed,
}: {
  noteId: string;
  revision: number;
  status: Exclude<CampusMapNoteStatus, "moderator-hidden">;
  subscribed: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [announcement, setAnnouncement] = useState("");
  const [isConflict, setIsConflict] = useState(false);
  const [subscription, setSubscription] = useState(subscribed);
  const commentRef = useRef<HTMLTextAreaElement>(null);
  const feedbackRef = useRef<HTMLParagraphElement>(null);
  const restoreCommentFocus = useRef(false);

  useEffect(() => {
    if (isConflict) feedbackRef.current?.focus();
  }, [isConflict, announcement]);

  useEffect(() => {
    if (!pending && restoreCommentFocus.current) {
      restoreCommentFocus.current = false;
      commentRef.current?.focus();
    }
  }, [pending]);

  function runCommand(
    command: CampusMapNoteCommand,
    successMessage: string,
    onSuccess?: () => void,
  ) {
    setAnnouncement("");
    setIsConflict(false);
    startTransition(async () => {
      const result = await commandCampusMapNoteAction(command);
      if (isSuccess(result)) {
        onSuccess?.();
        setAnnouncement(successMessage);
        router.refresh();
        return;
      }
      if (result.status === "conflict") {
        setAnnouncement("备注刚被其他人更新，已载入最新状态");
        setIsConflict(true);
        router.refresh();
        return;
      }
      setAnnouncement(resultMessage(result));
    });
  }

  function submitComment(formData: FormData) {
    const comment = String(formData.get("comment") ?? "");
    runCommand(
      {
        kind: "comment",
        idempotencyKey: crypto.randomUUID(),
        noteId,
        comment,
      },
      "评论已发布",
      () => {
        commentRef.current?.form?.reset();
        restoreCommentFocus.current = true;
      },
    );
  }

  function resolveNote(formData: FormData) {
    const resolvedByChangesetId = String(
      formData.get("resolvedByChangesetId") ?? "",
    ).trim();
    const comment = String(formData.get("resolutionComment") ?? "").trim();
    runCommand(
      {
        kind: "resolve",
        idempotencyKey: crypto.randomUUID(),
        noteId,
        expectedRevision: revision,
        resolution: {
          reason: formData.get("reason") as CampusMapNoteResolutionReason,
          resolvedByChangesetId: resolvedByChangesetId || null,
        },
        comment: comment || null,
      },
      "备注已标记为解决",
    );
  }

  function reopenNote(formData: FormData) {
    runCommand(
      {
        kind: "reopen",
        idempotencyKey: crypto.randomUUID(),
        noteId,
        expectedRevision: revision,
        comment: String(formData.get("reopenComment") ?? ""),
      },
      "备注已重新打开",
    );
  }

  function toggleSubscription() {
    setAnnouncement("");
    setIsConflict(false);
    startTransition(async () => {
      const result = await setCampusMapNoteSubscriptionAction(
        noteId,
        !subscription,
      );
      if (result.status === "subscribed" || result.status === "unsubscribed") {
        const next = result.status === "subscribed";
        setSubscription(next);
        setAnnouncement(next ? "已订阅更新" : "已取消订阅");
        return;
      }
      setAnnouncement("无法更新订阅，请重试");
    });
  }

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={toggleSubscription}
          className={secondaryButton}
        >
          {subscription ? "取消订阅" : "订阅更新"}
        </button>
      </div>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          submitComment(new FormData(event.currentTarget));
        }}
        className="grid gap-2"
      >
        <label htmlFor="map-note-comment" className="text-sm font-semibold">
          添加评论
        </label>
        <textarea
          ref={commentRef}
          id="map-note-comment"
          name="comment"
          required
          maxLength={2000}
          rows={4}
          disabled={pending}
          className={fieldClass}
        />
        <button type="submit" disabled={pending} className={primaryButton}>
          发布评论
        </button>
      </form>

      {status === "open" ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            resolveNote(new FormData(event.currentTarget));
          }}
          className="grid gap-3 rounded-2xl border p-4"
        >
          <h2 className="font-semibold">解决备注</h2>
          <label className="grid gap-1 text-sm">
            解决原因
            <select name="reason" defaultValue="fixed" className={fieldClass}>
              <option value="fixed">已修正</option>
              <option value="not-an-issue">不是问题</option>
              <option value="duplicate">重复备注</option>
              <option value="insufficient-information">资料不足</option>
              <option value="other">其他</option>
            </select>
          </label>
          <label className="grid gap-1 text-sm">
            关联 Changeset（可选）
            <input
              name="resolvedByChangesetId"
              inputMode="text"
              className={fieldClass}
            />
          </label>
          <label className="grid gap-1 text-sm">
            说明（可选）
            <textarea
              name="resolutionComment"
              maxLength={2000}
              rows={3}
              className={fieldClass}
            />
          </label>
          <button type="submit" disabled={pending} className={primaryButton}>
            标记为已解决
          </button>
        </form>
      ) : (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            reopenNote(new FormData(event.currentTarget));
          }}
          className="grid gap-2 rounded-2xl border p-4"
        >
          <label htmlFor="map-note-reopen" className="text-sm font-semibold">
            重新打开的原因
          </label>
          <textarea
            id="map-note-reopen"
            name="reopenComment"
            required
            maxLength={2000}
            rows={3}
            className={fieldClass}
          />
          <button type="submit" disabled={pending} className={primaryButton}>
            重新打开备注
          </button>
        </form>
      )}

      <p
        ref={feedbackRef}
        role={isConflict ? "alert" : "status"}
        aria-live={isConflict ? "assertive" : "polite"}
        tabIndex={isConflict ? -1 : undefined}
        className="min-h-6 text-sm font-medium"
      >
        {announcement || (pending ? "正在提交…" : "")}
      </p>
    </div>
  );
}

function isSuccess(result: CampusMapNoteCommandResult) {
  return ["created", "commented", "resolved", "reopened"].includes(
    result.status,
  );
}

function resultMessage(result: CampusMapNoteCommandResult) {
  switch (result.status) {
    case "authentication-required":
      return "请先登录";
    case "forbidden":
      return "你暂时不能修改这条备注";
    case "rate-limited":
      return `操作太频繁，请在 ${result.retryAfter} 秒后重试`;
    case "validation-failed":
      return "内容不符合要求，请检查后重试";
    case "not-found":
      return "备注不存在或已经不可用";
    default:
      return "暂时无法提交，请稍后重试";
  }
}

const fieldClass =
  "min-h-11 rounded-xl border bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50";
const primaryButton =
  "inline-flex min-h-11 items-center justify-center rounded-xl bg-foreground px-4 text-sm font-semibold text-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50";
const secondaryButton =
  "inline-flex min-h-11 items-center justify-center rounded-xl border bg-background px-4 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50";
