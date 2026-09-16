"use client";

import { LocateFixedIcon, Share2Icon } from "lucide-react";
import { useState } from "react";

export function CampusMapCardActions({
  name,
  href,
  locateLabel,
  onLocate,
  locateFeedback = null,
}: {
  name: string;
  href: string;
  locateLabel: string | null;
  onLocate: () => void;
  locateFeedback?: { message: string; revision: number } | null;
}) {
  const [status, setStatus] = useState("");
  const [sharing, setSharing] = useState(false);
  const visibleStatus = status || locateFeedback?.message || "";
  const visibleStatusKey = status
    ? `share:${status}`
    : locateFeedback
      ? `locate:${locateFeedback.revision}`
      : "empty";

  async function share() {
    if (sharing) return;
    setSharing(true);
    setStatus("");
    const url = new URL(href, window.location.origin).href;
    try {
      if (navigator.share) {
        await navigator.share({ title: name, url });
        setStatus("分享完成");
        return;
      }
      await navigator.clipboard.writeText(url);
      setStatus("链接已复制");
    } catch (error) {
      if (
        error &&
        typeof error === "object" &&
        "name" in error &&
        error.name === "AbortError"
      ) {
        setStatus("已取消分享");
      } else {
        setStatus("分享失败，可打开稳定链接后复制地址");
      }
    } finally {
      setSharing(false);
    }
  }

  return (
    <div className="shrink-0 px-5 pb-5">
      <div role="group" aria-label="地图操作" className="flex flex-wrap gap-2">
        {locateLabel ? (
          <button
            type="button"
            onClick={() => {
              setStatus("");
              onLocate();
            }}
            className="inline-flex min-h-11 items-center justify-center gap-[7px] rounded-full bg-[#235741] px-5 text-sm font-medium text-white hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 dark:bg-[#b2dfc2] dark:text-[#143c28]"
          >
            <LocateFixedIcon
              aria-hidden="true"
              className="size-[17px] shrink-0"
            />
            {locateLabel}
          </button>
        ) : null}
        <button
          type="button"
          disabled={sharing}
          onClick={share}
          className="inline-flex min-h-11 items-center justify-center gap-[7px] rounded-full border border-border px-[15px] text-sm font-medium text-[#235741] hover:bg-muted disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 dark:text-[#a9ddbc]"
        >
          <Share2Icon aria-hidden="true" className="size-[17px] shrink-0" />
          分享
        </button>
      </div>
      {visibleStatus ? (
        <p
          key={visibleStatusKey}
          role="status"
          aria-live="polite"
          data-campus-map-locate-feedback={
            locateFeedback && !status ? "true" : undefined
          }
          className="mt-2 text-xs leading-5 text-muted-foreground"
        >
          {visibleStatus}
          {status.startsWith("分享失败") ? (
            <a
              href={href}
              className="ml-1 inline-flex min-h-11 items-center underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              稳定链接
            </a>
          ) : null}
        </p>
      ) : null}
    </div>
  );
}
