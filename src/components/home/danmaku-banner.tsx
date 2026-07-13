"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  distributeDanmakuToTracks,
  messagesForFlyover,
  type DanmakuMessage,
} from "@/lib/danmaku-types";
import "./danmaku.css";

function danmakuErrorMessage(code: string): string {
  if (code === "INVALID_DANMAKU") return "弹幕须为 1–100 字纯文本。";
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
}: {
  initialMessages: DanmakuMessage[];
  viewer: ViewerState;
}) {
  const [messages, setMessages] = useState(initialMessages);
  const [content, setContent] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const tracks = useMemo(
    () => distributeDanmakuToTracks(messagesForFlyover(messages), 3),
    [messages],
  );

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch("/api/danmaku", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content }),
        });
        const data = (await res.json()) as {
          message?: DanmakuMessage & { createdAt: string };
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
    <section className="relative space-y-4" aria-label="本月弹幕">
      <div className="text-center">
        <h2 className="text-lg font-semibold">本月弹幕</h2>
      </div>

      <div className="danmaku-track-layer relative h-24 overflow-hidden rounded-xl border bg-muted/30 md:h-28">
        {tracks.map((track, trackIndex) => (
          <div
            key={trackIndex}
            className="absolute left-0 flex h-8 w-full items-center gap-8"
            style={{ top: `${trackIndex * 2.25 + 0.5}rem` }}
          >
            {track.map((msg, i) => (
              <span
                key={msg.id}
                className="danmaku-item text-foreground"
                style={{
                  animationDuration: `${18 + ((trackIndex + i) % 5) * 4}s`,
                  animationDelay: `${(trackIndex * 2 + i) * 1.5}s`,
                }}
              >
                {msg.content}
                <span className="ml-2 text-xs text-muted-foreground">
                  — {msg.authorNickname}
                </span>
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
          messages.map((msg) => (
            <li key={msg.id}>
              <span className="font-medium">{msg.authorNickname}</span>
              <span className="text-muted-foreground">：</span>
              {msg.content}
            </li>
          ))
        )}
      </ul>

      <div className="relative z-10 mx-auto max-w-md">
        {viewer.kind === "guest" ? (
          <p className="text-center text-sm text-muted-foreground">
            <Link href="/login" className="underline underline-offset-2">
              登录
            </Link>
            后即可发送弹幕
          </p>
        ) : viewer.kind === "banned" ? (
          <p className="text-center text-sm text-destructive" role="alert">
            账号已封禁，无法发送弹幕
          </p>
        ) : (
          <form onSubmit={handleSubmit} className="flex gap-2">
            <Input
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="说点什么…"
              maxLength={100}
              disabled={pending}
              aria-label="弹幕内容"
            />
            <Button type="submit" disabled={pending || !content.trim()}>
              {pending ? "发送中…" : "发送"}
            </Button>
          </form>
        )}
        {error ? (
          <p className="mt-2 text-center text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </section>
  );
}
