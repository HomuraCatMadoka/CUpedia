"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type CSSProperties,
} from "react";
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
  if (code === "INVALID_DANMAKU") return "弹幕须为 1-100 字纯文本。";
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

/** One-shot overlay so a just-sent bullet flies now without reshaping the queue. */
type LiveShot = {
  id: string;
  content: string;
  track: number;
  nonce: number;
};

export function DanmakuBanner({
  initialMessages,
  initialFlyMessages,
  viewer,
  title = "本月弹幕",
  apiPath = "/api/danmaku",
  trackCount = DANMAKU_TRACK_COUNT,
  appearance = "card",
}: {
  initialMessages: PublicDanmakuMessage[];
  /**
   * Optional pre-shuffled flyover feed (e.g. server-randomized).
   * Defaults to the latest slice of `initialMessages`.
   */
  initialFlyMessages?: PublicDanmakuMessage[];
  viewer: ViewerState;
  title?: string;
  /** POST endpoint for this banner's danmaku store (hub vs per-canteen). */
  apiPath?: string;
  /** Parallel flyover lanes (hub default 5; canteen detail often fewer). */
  trackCount?: number;
  appearance?: "card" | "hero";
}) {
  const [messages, setMessages] = useState(initialMessages);
  const [flyItems, setFlyItems] = useState(
    () => initialFlyMessages ?? messagesForFlyover(initialMessages),
  );
  const [liveShots, setLiveShots] = useState<LiveShot[]>([]);
  const [content, setContent] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [screenWidth, setScreenWidth] = useState(720);
  const mounted = useMounted();
  const layerRef = useRef<HTMLDivElement>(null);
  const liveLaneRef = useRef(0);
  const { ensureContributorSetup } = useContributorSetup();

  useEffect(() => {
    const el = layerRef.current;
    if (!el) return;
    const update = () => setScreenWidth(Math.max(1, el.clientWidth));
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const integrated = appearance === "hero";
  /** Use clamp() max so width estimates never undershoot hero glyphs. */
  const fontPx = integrated ? (screenWidth >= 640 ? 16 : 14) : 14;

  const scheduled = useMemo(
    () =>
      scheduleScrollingDanmaku(
        flyItems.map((m) => ({ id: m.id, content: m.content })),
        {
          trackCount,
          screenWidth,
          duration: DANMAKU_SCROLL_DURATION_SEC,
          fontPx,
        },
      ),
    [flyItems, fontPx, screenWidth, trackCount],
  );

  const cycleEndSec = useMemo(() => {
    if (scheduled.length === 0) return DANMAKU_SCROLL_DURATION_SEC;
    return Math.max(...scheduled.map((s) => s.start + s.duration)) + 0.75;
  }, [scheduled]);

  const [epoch, setEpoch] = useState(0);
  useEffect(() => {
    if (!mounted || scheduled.length === 0) return;
    const id = window.setTimeout(
      () => setEpoch((value) => value + 1),
      cycleEndSec * 1000,
    );
    return () => window.clearTimeout(id);
  }, [mounted, scheduled, cycleEndSec, epoch]);

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
  const trackStepRem =
    screenWidth >= 640
      ? compact
        ? integrated
          ? 3.1
          : 2.6
        : 3.0
      : compact
        ? integrated
          ? 2.4
          : 2.0
        : 2.2;
  const trackOffsetRem =
    screenWidth >= 640 ? (compact ? 0.35 : 0.5) : compact ? 0.25 : 0.35;

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
        const publicMessage: PublicDanmakuMessage = {
          ...created,
          createdAt: new Date(created.createdAt),
        };
        setMessages((prev) => [...prev, publicMessage]);
        // Keep the normal append/cap schedule (same as after refresh). A
        // one-shot live overlay flies immediately for this send only.
        setFlyItems((prev) =>
          messagesForFlyover([
            ...prev.filter((m) => m.id !== publicMessage.id),
            publicMessage,
          ]),
        );
        const track = liveLaneRef.current % trackCount;
        liveLaneRef.current += 1;
        setLiveShots((prev) => [
          ...prev,
          {
            id: publicMessage.id,
            content: publicMessage.content,
            track,
            nonce: Date.now(),
          },
        ]);
        setContent("");
      } catch {
        setError("发送失败，请重试。");
      }
    });
  }

  const liveIds = useMemo(
    () => new Set(liveShots.map((shot) => shot.id)),
    [liveShots],
  );

  return (
    <section
      className={cn(
        "relative",
        integrated ? "danmaku-hero grid gap-1" : "space-y-2 sm:space-y-4",
      )}
      aria-label={title}
    >
      <div className={integrated ? "danmaku-hero-label" : "text-center"}>
        <h2
          className={
            integrated ? undefined : "text-sm font-semibold sm:text-lg"
          }
        >
          {title}
        </h2>
      </div>

      <div
        ref={layerRef}
        className={cn(
          "danmaku-track-layer relative grid place-items-center overflow-hidden",
          integrated
            ? "danmaku-track-layer--hero"
            : "rounded-lg border bg-muted/30 sm:rounded-xl",
          messages.length === 0
            ? integrated
              ? "h-20 sm:h-24"
              : "h-24 sm:h-28"
            : compact
              ? integrated
                ? "h-32 sm:h-40"
                : "h-32 sm:h-40"
              : "h-48 sm:h-60",
        )}
        style={
          {
            "--danmaku-stage": `${screenWidth}px`,
          } as CSSProperties
        }
        data-ready={mounted ? "true" : undefined}
      >
        {messages.length === 0 ? (
          <p className="text-sm text-muted-foreground sm:text-base">
            {integrated
              ? "校园此刻很安静，来发第一条吧"
              : "暂无弹幕，来发第一条吧"}
          </p>
        ) : (
          <>
            {byTrack.map((track, trackIndex) => (
              <div
                key={`${epoch}-track-${trackIndex}`}
                className="danmaku-track"
                style={{
                  top: `${trackIndex * trackStepRem + trackOffsetRem}rem`,
                }}
              >
                {track.map((item) =>
                  liveIds.has(item.id) ? null : (
                    <span
                      key={`${epoch}-${item.id}`}
                      className="danmaku-item text-foreground"
                      style={{
                        animationDuration: `${item.duration}s`,
                        animationDelay: `${item.start}s`,
                      }}
                    >
                      {item.content}
                    </span>
                  ),
                )}
              </div>
            ))}
            {liveShots.map((shot) => (
              <div
                key={`live-${shot.nonce}`}
                className="danmaku-track"
                style={{
                  top: `${shot.track * trackStepRem + trackOffsetRem}rem`,
                }}
              >
                <span
                  data-live-danmaku=""
                  className="danmaku-item text-foreground"
                  style={{
                    animationDuration: `${DANMAKU_SCROLL_DURATION_SEC}s`,
                    animationDelay: "0s",
                  }}
                  onAnimationEnd={() => {
                    setLiveShots((prev) =>
                      prev.filter((s) => s.nonce !== shot.nonce),
                    );
                  }}
                >
                  {shot.content}
                </span>
              </div>
            ))}
          </>
        )}
      </div>

      <ul
        className={cn(
          "danmaku-static-list max-h-40 space-y-1 overflow-y-auto text-sm",
          integrated ? "px-4 py-2" : "rounded-lg border bg-muted/20 p-3",
        )}
        aria-label="弹幕列表（减少动画模式）"
      >
        {messages.length === 0 ? (
          <li className="text-muted-foreground">
            {integrated
              ? "校园此刻很安静，来发第一条吧"
              : "暂无弹幕，来发第一条吧"}
          </li>
        ) : (
          messages.map((msg) => <li key={msg.id}>{msg.content}</li>)
        )}
      </ul>

      <div className="danmaku-composer relative z-10 mx-auto w-full max-w-md">
        {viewer.kind === "guest" ? (
          <div className="danmaku-composer-control relative">
            <Input
              disabled
              aria-label="弹幕内容"
              placeholder="发个友善的弹幕见证当下"
              className="danmaku-input h-11 rounded-[0.625rem] border-[rgba(60,60,67,0.12)] bg-white/55 pr-24 text-sm placeholder:text-[#8e8e93] disabled:cursor-default disabled:bg-white/55 disabled:opacity-100"
            />
            <Link
              href="/login"
              className="absolute inset-y-0 right-1 inline-flex min-h-11 items-center rounded-lg px-2.5 text-[0.8125rem] font-medium whitespace-nowrap text-[var(--canteen-link)] hover:underline"
            >
              登录后发送
            </Link>
          </div>
        ) : viewer.kind === "banned" ? (
          <p
            className="text-center text-xs text-destructive sm:text-sm"
            role="alert"
          >
            账号已封禁，无法发送弹幕
          </p>
        ) : (
          <form onSubmit={handleSubmit} className="flex gap-1.5 sm:gap-2">
            <Input
              name="danmaku"
              autoComplete="off"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="发个友善的弹幕见证当下"
              maxLength={100}
              disabled={pending}
              aria-label="弹幕内容"
              className="danmaku-input h-11 rounded-[0.625rem] border-[rgba(60,60,67,0.12)] bg-white/55 text-sm placeholder:text-[#8e8e93] focus-visible:border-[var(--canteen-focus)]"
            />
            <Button
              type="submit"
              disabled={pending || !content.trim()}
              className="danmaku-send h-11 px-3 text-[0.8125rem] disabled:bg-[rgba(120,120,128,0.12)] disabled:text-[#6e6e73] disabled:opacity-100"
            >
              {pending ? "发送中…" : "发送"}
            </Button>
          </form>
        )}
        {error ? (
          <p
            className="mt-1.5 text-center text-xs text-destructive sm:mt-2 sm:text-sm"
            role="alert"
          >
            {error}
          </p>
        ) : null}
      </div>
    </section>
  );
}
