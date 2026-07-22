"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useMounted } from "@/hooks/use-mounted";
import {
  DANMAKU_SCROLL_DURATION_SEC,
  DANMAKU_TRACK_COUNT,
  scheduleScrollingDanmaku,
  type ScheduledDanmaku,
} from "@/lib/danmaku-schedule";
import {
  messagesForFlyover,
  type PublicDanmakuMessage,
} from "@/lib/danmaku-types";
import { cn } from "@/lib/utils";
import "./danmaku.css";
import { useContributorSetup } from "@/components/auth/contributor-setup-provider";

function danmakuErrorMessage(code: string): string {
  if (code === "INVALID_DANMAKU") return "弹幕须为 1–100 字纯文本。";
  if (code === "DANMAKU_BLOCKED" || code === "SENSITIVE_CONTENT") {
    return "内容含违规或引流信息，请修改后重试。";
  }
  if (code === "DANMAKU_RATE_LIMIT_EXCEEDED") {
    return "发送过于频繁，请稍后再试。";
  }
  if (code === "UNAUTHORIZED") return "请登录后发送弹幕。";
  if (code === "USER_BANNED") return "账号已封禁，无法发送弹幕。";
  return "发送失败，请重试。";
}

type ViewerState =
  | { kind: "guest" }
  | { kind: "banned" }
  | { kind: "member"; userId: string; nickname: string };

export function DanmakuBanner({
  initialMessages,
  viewer,
  title = "本月弹幕",
  apiPath = "/api/danmaku",
  trackCount = DANMAKU_TRACK_COUNT,
}: {
  initialMessages: PublicDanmakuMessage[];
  viewer: ViewerState;
  title?: string;
  /** POST endpoint for this banner's danmaku store (hub vs per-canteen). */
  apiPath?: string;
  /** Parallel flyover lanes (hub default 5; canteen detail often fewer). */
  trackCount?: number;
}) {
  const [messages, setMessages] = useState(initialMessages);
  const [content, setContent] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [screenWidth, setScreenWidth] = useState(720);
  const mounted = useMounted();
  const layerRef = useRef<HTMLDivElement>(null);
  const { ensureContributorSetup } = useContributorSetup();

  useEffect(() => {
    const el = layerRef.current;
    if (!el) return;
    const update = () => setScreenWidth(Math.max(320, el.clientWidth));
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const flyItems = useMemo(() => messagesForFlyover(messages), [messages]);

  const scheduled = useMemo(
    () =>
      scheduleScrollingDanmaku(
        flyItems.map((m) => ({ id: m.id, content: m.content })),
        {
          trackCount,
          screenWidth,
          duration: DANMAKU_SCROLL_DURATION_SEC,
        },
      ),
    [flyItems, screenWidth, trackCount],
  );

  const byTrack = useMemo(() => {
    const tracks: ScheduledDanmaku[][] = Array.from(
      { length: trackCount },
      () => [],
    );
    for (const item of scheduled) {
      tracks[item.track]?.push(item);
    }
    return tracks;
  }, [scheduled, trackCount]);

  /** Wider flyover on desktop → taller layer and more vertical track spacing. */
  const compact = trackCount <= 3;
  const trackStepRem = screenWidth >= 640
    ? compact ? 2.6 : 3.0
    : compact ? 2.0 : 2.2;
  const trackOffsetRem = screenWidth >= 640
    ? compact ? 0.4 : 0.5
    : compact ? 0.3 : 0.35;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      try {
        if (!(await ensureContributorSetup())) return;
        const res = await fetch(apiPath, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content }),
        });
        const data = (await res.json()) as {
          message?: PublicDanmakuMessage & { createdAt: string };
          error?: string;
        };
        if (!res.ok) {
          setError(danmakuErrorMessage(data.error ?? "FAILED"));
          return;
        }
        const created = data.message!;
        setMessages((prev) => [
          ...prev,
          {
            ...created,
            createdAt: new Date(created.createdAt),
          },
        ]);
        setContent("");
      } catch {
        setError("发送失败，请重试。");
      }
    });
  }

  return (
    <section className="relative space-y-2 sm:space-y-4" aria-label={title}>
      <div className="text-center">
        <h2 className="text-sm font-semibold sm:text-lg">{title}</h2>
      </div>

      <div
        ref={layerRef}
        className={cn(
          "danmaku-track-layer relative overflow-hidden rounded-lg border bg-muted/30 sm:rounded-xl",
          compact ? "h-32 sm:h-40" : "h-48 sm:h-60",
        )}
        data-ready={mounted ? "true" : undefined}
      >
        {byTrack.map((track, trackIndex) => (
          <div
            key={trackIndex}
            className="danmaku-track"
            style={{
              top: `${trackIndex * trackStepRem + trackOffsetRem}rem`,
            }}
          >
            {track.map((item) => (
              <span
                key={item.id}
                className="danmaku-item text-foreground"
                style={{
                  animationDuration: `${item.duration}s`,
                  animationDelay: `${-item.start}s`,
                }}
              >
                {item.content}
              </span>
            ))}
          </div>
        ))}
      </div>

      <ul
        className="danmaku-static-list max-h-40 space-y-1 overflow-y-auto rounded-lg border bg-muted/20 p-3 text-sm"
        aria-label="弹幕列表（减少动画模式）"
      >
        {messages.length === 0 ? (
          <li className="text-muted-foreground">暂无弹幕，来发第一条吧</li>
        ) : (
          messages.map((msg) => <li key={msg.id}>{msg.content}</li>)
        )}
      </ul>

      <div className="relative z-10 mx-auto max-w-md">
        {viewer.kind === "guest" ? (
          <p className="text-center text-xs text-muted-foreground sm:text-sm">
            <Link href="/login" className="underline underline-offset-2">
              登录
            </Link>
            后即可发送弹幕
          </p>
        ) : viewer.kind === "banned" ? (
          <p className="text-center text-xs text-destructive sm:text-sm" role="alert">
            账号已封禁，无法发送弹幕
          </p>
        ) : (
          <form onSubmit={handleSubmit} className="flex gap-1.5 sm:gap-2">
            <Input
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="发个友善的弹幕见证当下"
              maxLength={100}
              disabled={pending}
              aria-label="弹幕内容"
              className="h-9 border-[rgba(26,35,50,0.32)] bg-[var(--canteen-surface)] placeholder:text-[var(--canteen-muted)] focus-visible:border-[var(--canteen-purple)] sm:h-10"
            />
            <Button
              type="submit"
              disabled={pending || !content.trim()}
              className="h-9 px-3 sm:h-10 sm:px-4"
            >
              {pending ? "发送中…" : "发送"}
            </Button>
          </form>
        )}
        {error ? (
          <p className="mt-1.5 text-center text-xs text-destructive sm:mt-2 sm:text-sm" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </section>
  );
}
