"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { runCampusMapPlaceLifecycleAction } from "@/lib/campus-map/place-lifecycle-actions";

type PlaceLifecycleOperation = "retire" | "restore";

const lifecycleCopy = {
  retire: {
    trigger: "停用地点",
    title: "确认停用这个地点？",
    description:
      "停用后，它会从地图和默认搜索结果中消失；稳定链接和公开编辑记录仍会保留。",
    reasonLabel: "停用原因",
    reasonPlaceholder: "例如：地点已拆除或不再提供这项服务…",
    submit: "确认停用",
    pending: "正在停用…",
  },
  restore: {
    trigger: "恢复地点",
    title: "确认恢复这个地点？",
    description:
      "恢复会追加一条新的公开修订，并让地点重新出现在地图和搜索结果中。",
    reasonLabel: "恢复原因",
    reasonPlaceholder: "例如：现场确认地点已重新开放…",
    submit: "确认恢复",
    pending: "正在恢复…",
  },
} as const;

function lifecycleError(code: string): {
  message: string;
  kind: "reason" | "action";
} {
  switch (code) {
    case "admin-required":
      return { message: "只有管理员可以执行这项操作。", kind: "action" };
    case "base-revision-conflict":
      return {
        message: "地点已被其他人更新。请关闭确认框并刷新后再试。",
        kind: "action",
      };
    case "reason-required":
    case "comment-required":
      return { message: "请填写原因。", kind: "reason" };
    case "comment-too-long":
      return { message: "原因过长，请缩短后再试。", kind: "reason" };
    case "comment-invalid":
      return {
        message: "原因包含无法保存的字符，请修改后再试。",
        kind: "reason",
      };
    case "operation-not-allowed":
    case "place-status-changed":
      return {
        message: "地点状态已经改变。请刷新页面后再试。",
        kind: "action",
      };
    case "authentication-required":
      return {
        message: "登录状态已失效，请重新登录后再试。",
        kind: "action",
      };
    default:
      return { message: "暂时无法完成操作，请稍后重试。", kind: "action" };
  }
}

export function PlaceLifecycleControls({
  operation,
  placeId,
  baseRevisionId,
}: {
  operation: PlaceLifecycleOperation;
  placeId: string;
  baseRevisionId: string;
}) {
  const copy = lifecycleCopy[operation];
  const router = useRouter();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const reasonRef = useRef<HTMLTextAreaElement>(null);
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [idempotencyKey, setIdempotencyKey] = useState<string | null>(null);
  const [error, setError] = useState<{
    message: string;
    kind: "reason" | "action";
  } | null>(null);
  const [pending, startTransition] = useTransition();
  const [refreshVersion, setRefreshVersion] = useState(0);
  const refreshedVersionRef = useRef(0);

  // A Server Action response can carry the revalidated route tree. Starting a
  // second refresh while that response is settling aborts it, so wait until
  // the transition has committed before requesting the defensive refresh.
  useEffect(() => {
    if (pending || refreshVersion <= refreshedVersionRef.current) return;
    refreshedVersionRef.current = refreshVersion;
    router.refresh();
  }, [pending, refreshVersion, router]);

  function changeOpen(nextOpen: boolean) {
    if (pending) return;
    setOpen(nextOpen);
    setError(null);
    if (!nextOpen) {
      setReason("");
      setIdempotencyKey(null);
    }
  }

  function submit() {
    const normalizedReason = reason.trim();
    if (!normalizedReason) {
      setError({ message: "请填写原因。", kind: "reason" });
      reasonRef.current?.focus();
      return;
    }
    const requestKey = idempotencyKey ?? crypto.randomUUID();
    setIdempotencyKey(requestKey);
    setError(null);
    startTransition(async () => {
      try {
        const result = await runCampusMapPlaceLifecycleAction({
          operation,
          placeId,
          baseRevisionId,
          reason: normalizedReason,
          idempotencyKey: requestKey,
        });
        if (result.status === "published") {
          setOpen(false);
          setReason("");
          setIdempotencyKey(null);
          setRefreshVersion((version) => version + 1);
          return;
        }
        setError(lifecycleError(result.code));
      } catch {
        setError({
          message: "网络连接中断，请保持原因不变并重试。",
          kind: "action",
        });
      }
    });
  }

  return (
    <AlertDialog open={open} onOpenChange={changeOpen}>
      <AlertDialogTrigger
        ref={triggerRef}
        className={
          operation === "retire"
            ? "inline-flex min-h-11 items-center justify-center rounded-xl border border-red-300 px-4 text-sm font-semibold text-red-700 hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 focus-visible:ring-offset-2 dark:border-red-900 dark:text-red-300 dark:hover:bg-red-950/40"
            : "inline-flex min-h-11 items-center justify-center rounded-xl bg-emerald-800 px-4 text-sm font-semibold text-white hover:bg-emerald-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 focus-visible:ring-offset-2"
        }
      >
        {copy.trigger}
      </AlertDialogTrigger>
      <AlertDialogContent
        initialFocus={reasonRef}
        finalFocus={triggerRef}
        className="max-h-[calc(100dvh-2rem)] overflow-y-auto overscroll-contain"
      >
        <AlertDialogHeader>
          <AlertDialogTitle>{copy.title}</AlertDialogTitle>
          <AlertDialogDescription>{copy.description}</AlertDialogDescription>
        </AlertDialogHeader>
        <label className="grid gap-2 text-left text-sm font-medium">
          {copy.reasonLabel}
          <textarea
            ref={reasonRef}
            name="place-lifecycle-reason"
            autoComplete="off"
            value={reason}
            required
            rows={4}
            maxLength={2_000}
            aria-invalid={error?.kind === "reason" || undefined}
            aria-describedby={
              error?.kind === "reason" ? "place-lifecycle-error" : undefined
            }
            className="min-h-24 w-full resize-y rounded-xl border bg-background px-3 py-2 font-normal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            placeholder={copy.reasonPlaceholder}
            onChange={(event) => {
              setReason(event.target.value);
              setError(null);
              setIdempotencyKey(null);
            }}
          />
        </label>
        {error ? (
          <p
            id="place-lifecycle-error"
            role="alert"
            className="text-sm font-medium text-red-700 dark:text-red-300"
          >
            {error.message}
          </p>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>取消</AlertDialogCancel>
          <AlertDialogAction
            type="button"
            disabled={pending}
            aria-busy={pending || undefined}
            aria-label={
              pending ? copy.pending : `${copy.submit}：${copy.reasonLabel}`
            }
            className={
              operation === "retire"
                ? "bg-red-700 text-white hover:bg-red-800 focus-visible:ring-red-600"
                : "bg-emerald-800 text-white hover:bg-emerald-900 focus-visible:ring-emerald-700"
            }
            onClick={submit}
          >
            {pending ? copy.pending : copy.submit}
          </AlertDialogAction>
          <span className="sr-only" aria-live="polite">
            {pending ? copy.pending : ""}
          </span>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
