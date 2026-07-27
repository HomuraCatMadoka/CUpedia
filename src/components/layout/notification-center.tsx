"use client";

import { useEffect, useState } from "react";
import { BellIcon } from "lucide-react";
import { useRouter } from "next/navigation";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  getNotifications,
  getUnreadNotificationCount,
  markAllNotificationsRead,
  markNotificationRead,
  type NotificationView,
} from "@/lib/notification-actions";
import { cn } from "@/lib/utils";

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60_000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  if (minutes < 1) return "刚刚";
  if (minutes < 60) return `${minutes} 分钟前`;
  if (hours < 24) return `${hours} 小时前`;
  if (days < 30) return `${days} 天前`;
  return new Date(iso).toLocaleDateString("zh-CN");
}

export function NotificationCenter() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState<number | null>(null);
  const [notifications, setNotifications] = useState<NotificationView[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function refreshCount() {
    try {
      setUnreadCount(await getUnreadNotificationCount());
    } catch {
      setUnreadCount(null);
    }
  }

  async function load(offset: number, append: boolean) {
    setLoading(true);
    setError("");
    try {
      const page = await getNotifications(offset);
      setNotifications((current) =>
        append ? [...current, ...page.notifications] : page.notifications,
      );
      setHasMore(page.hasMore);
      setLoaded(true);
    } catch {
      setError("通知加载失败");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) void refreshCount();
    });
    const onFocus = () => void refreshCount();
    window.addEventListener("focus", onFocus);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (nextOpen) {
      void refreshCount();
      void load(0, false);
    }
  }

  async function openNotification(notification: NotificationView) {
    setBusy(true);
    setError("");
    try {
      await markNotificationRead(notification.id);
      setNotifications((current) =>
        current.map((item) =>
          item.id === notification.id ? { ...item, read: true } : item,
        ),
      );
      if (!notification.read) {
        setUnreadCount((current) =>
          current === null ? null : Math.max(0, current - 1),
        );
      }
      setOpen(false);
      router.push(notification.href);
    } catch {
      setError("无法打开通知，请重试");
    } finally {
      setBusy(false);
    }
  }

  async function markAllRead() {
    setBusy(true);
    setError("");
    try {
      await markAllNotificationsRead();
      setNotifications((current) =>
        current.map((notification) => ({ ...notification, read: true })),
      );
      setUnreadCount(0);
    } catch {
      setError("标记失败，请重试");
    } finally {
      setBusy(false);
    }
  }

  const badge =
    unreadCount === null || unreadCount === 0
      ? null
      : unreadCount > 9
        ? "9+"
        : String(unreadCount);
  const bellLabel =
    unreadCount && unreadCount > 0 ? `通知，${unreadCount} 条未读` : "通知";

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger
        aria-label={bellLabel}
        className="relative flex size-11 touch-manipulation items-center justify-center rounded-md text-muted-foreground transition-[background-color,color,transform] hover:bg-accent hover:text-foreground active:scale-[0.98] focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none md:size-8"
      >
        <BellIcon aria-hidden="true" className="size-5" />
        {badge && (
          <span
            data-testid="notification-badge"
            className="absolute top-0 right-0 flex min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] leading-4 font-semibold text-white tabular-nums md:-top-1 md:-right-1"
          >
            {badge}
          </span>
        )}
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={8}
        className="max-h-[min(32rem,calc(100dvh-var(--navbar-height)-1rem))] w-[min(22rem,calc(100vw-1rem))] gap-0 overflow-hidden p-0"
      >
        <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
          <PopoverTitle className="text-base">通知</PopoverTitle>
          {(unreadCount ?? 0) > 0 && (
            <button
              type="button"
              disabled={busy || loading}
              onClick={markAllRead}
              className="touch-manipulation rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-50"
            >
              全部标为已读
            </button>
          )}
        </div>

        <div className="max-h-[min(27rem,calc(100dvh-var(--navbar-height)-4.5rem))] overflow-y-auto overscroll-contain">
          {loading && !loaded && (
            <p
              role="status"
              className="px-4 py-8 text-center text-sm text-muted-foreground"
            >
              正在加载通知…
            </p>
          )}
          {error && (
            <div
              role="alert"
              className="flex flex-col items-center gap-3 px-4 py-8 text-center"
            >
              <p className="text-sm text-destructive">{error}</p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={loading}
                onClick={() => load(0, false)}
              >
                重试
              </Button>
            </div>
          )}
          {!error && loaded && notifications.length === 0 && (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">
              暂无通知
            </p>
          )}
          {!error && notifications.length > 0 && (
            <ul className="divide-y">
              {notifications.map((notification) => (
                <li key={notification.id}>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => openNotification(notification)}
                    className="flex w-full touch-manipulation items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-accent/50 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring focus-visible:outline-none disabled:opacity-50"
                  >
                    <Avatar size="sm" className="mt-0.5">
                      {notification.actorAvatarUrl && (
                        <AvatarImage src={notification.actorAvatarUrl} alt="" />
                      )}
                      <AvatarFallback>
                        {notification.actorNickname.slice(0, 1)}
                      </AvatarFallback>
                    </Avatar>
                    <span className="min-w-0 flex-1">
                      <span
                        className={cn(
                          "block text-sm leading-5",
                          !notification.read && "font-semibold",
                        )}
                      >
                        <span className="break-words">
                          {notification.actorNickname}
                        </span>{" "}
                        回复了你在 {notification.courseCode} 的评论
                      </span>
                      <span className="mt-1 block text-xs text-muted-foreground">
                        {timeAgo(notification.createdAt)}
                      </span>
                    </span>
                    {!notification.read && (
                      <span
                        aria-label="未读"
                        className="mt-2 size-2 shrink-0 rounded-full bg-primary"
                      />
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {!error && hasMore && (
            <div className="border-t p-2 text-center">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={loading}
                onClick={() => load(notifications.length, true)}
              >
                加载更多
              </Button>
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
