"use client";

import { FlagIcon, ShieldAlertIcon } from "lucide-react";
import { useId, useRef, useState, useTransition } from "react";

import {
  hideCampusMapPlaceFeedback,
  reportCampusMapPlaceFeedback,
} from "@/lib/campus-map/place-feedback-actions";
import type { CampusMapReportSignal } from "@/lib/campus-map/moderation-governance";

const REPORT_OPTIONS: Array<{ value: CampusMapReportSignal; label: string }> = [
  { value: "harassment", label: "骚扰或攻击" },
  { value: "spam", label: "垃圾内容" },
  { value: "privacy", label: "隐私问题" },
  { value: "copyright", label: "版权问题" },
  { value: "vandalism", label: "恶意破坏" },
  { value: "other", label: "其他" },
];

export function PlaceFeedbackModerationControls({
  feedbackId,
  placeId,
  isAdmin,
}: {
  feedbackId: string;
  placeId: string;
  isAdmin: boolean;
}) {
  const id = useId();
  const reportDetailsRef = useRef<HTMLTextAreaElement>(null);
  const hideReasonRef = useRef<HTMLTextAreaElement>(null);
  const [signal, setSignal] = useState<CampusMapReportSignal>("other");
  const [details, setDetails] = useState("");
  const [hideReason, setHideReason] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submitReport() {
    if (!details.trim()) {
      setError("请说明举报原因。只有管理员会看到这段说明。");
      reportDetailsRef.current?.focus();
      return;
    }
    setError(null);
    setMessage(null);
    startTransition(async () => {
      try {
        const result = await reportCampusMapPlaceFeedback({
          feedbackId,
          signal,
          details: details.trim(),
          idempotencyKey: crypto.randomUUID(),
        });
        if (result.status === "reported") {
          setDetails("");
          setMessage("举报已提交，管理员会进行复核。");
          return;
        }
        setError(
          result.status === "authentication-required"
            ? "请先登录再举报。"
            : "暂时无法提交举报，请稍后重试。",
        );
      } catch {
        setError("网络连接中断，请稍后重试。");
      }
    });
  }

  function hide() {
    if (!hideReason.trim()) {
      setError("请填写隐藏原因，供审核记录使用。");
      hideReasonRef.current?.focus();
      return;
    }
    setError(null);
    setMessage(null);
    startTransition(async () => {
      try {
        const result = await hideCampusMapPlaceFeedback({
          feedbackId,
          placeId,
          reason: hideReason.trim(),
          idempotencyKey: crypto.randomUUID(),
        });
        if (result.status === "decided") {
          setMessage("评价已隐藏。");
          return;
        }
        setError(
          result.status === "forbidden"
            ? "只有管理员可以隐藏评价。"
            : "暂时无法隐藏评价，请刷新后重试。",
        );
      } catch {
        setError("网络连接中断，请稍后重试。");
      }
    });
  }

  return (
    <div className="mt-3 border-t pt-3 text-sm">
      <details>
        <summary className="inline-flex min-h-11 touch-manipulation cursor-pointer list-none items-center gap-2 rounded-lg px-2 font-medium text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <FlagIcon aria-hidden="true" className="size-4" />
          举报评价
        </summary>
        <div className="mt-2 grid gap-3 rounded-xl bg-muted/60 p-3">
          <label className="grid gap-1 font-medium" htmlFor={`${id}-signal`}>
            问题类型
            <select
              id={`${id}-signal`}
              name="campus-map-place-feedback-report-signal"
              value={signal}
              disabled={pending}
              className="min-h-11 rounded-lg border bg-background px-3 font-normal text-foreground"
              onChange={(event) =>
                setSignal(event.target.value as CampusMapReportSignal)
              }
            >
              {REPORT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 font-medium" htmlFor={`${id}-details`}>
            举报说明
            <textarea
              ref={reportDetailsRef}
              id={`${id}-details`}
              name="campus-map-place-feedback-report-details"
              autoComplete="off"
              value={details}
              disabled={pending}
              rows={3}
              maxLength={2000}
              className="resize-y rounded-lg border bg-background px-3 py-2 font-normal"
              onChange={(event) => {
                setDetails(event.target.value);
                setError(null);
              }}
            />
          </label>
          <button
            type="button"
            disabled={pending}
            className="min-h-11 touch-manipulation justify-self-start rounded-lg border px-3 font-semibold hover:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={submitReport}
          >
            提交举报
          </button>
        </div>
      </details>
      {isAdmin ? (
        <details className="mt-1">
          <summary className="inline-flex min-h-11 touch-manipulation cursor-pointer list-none items-center gap-2 rounded-lg px-2 font-medium text-red-700 hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 dark:text-red-300 dark:hover:bg-red-950/40">
            <ShieldAlertIcon aria-hidden="true" className="size-4" />
            管理员隐藏
          </summary>
          <div className="mt-2 flex flex-col gap-3 rounded-xl border border-red-200 p-3 dark:border-red-900">
            <label
              className="grid gap-1 font-medium"
              htmlFor={`${id}-hide-reason`}
            >
              隐藏原因
              <textarea
                ref={hideReasonRef}
                id={`${id}-hide-reason`}
                name="campus-map-place-feedback-hide-reason"
                autoComplete="off"
                value={hideReason}
                disabled={pending}
                rows={2}
                maxLength={2000}
                className="resize-y rounded-lg border bg-background px-3 py-2 font-normal"
                onChange={(event) => {
                  setHideReason(event.target.value);
                  setError(null);
                }}
              />
            </label>
            <button
              type="button"
              disabled={pending}
              className="min-h-11 touch-manipulation self-start rounded-lg bg-red-700 px-3 font-semibold text-white hover:bg-red-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 focus-visible:ring-offset-2"
              onClick={hide}
            >
              隐藏整条评价
            </button>
          </div>
        </details>
      ) : null}
      {error ? (
        <p
          role="alert"
          className="mt-2 font-medium text-red-700 dark:text-red-300"
        >
          {error}
        </p>
      ) : null}
      <p
        aria-live="polite"
        className="mt-2 text-emerald-800 dark:text-emerald-300"
      >
        {pending ? "正在处理。" : message}
      </p>
    </div>
  );
}
