"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { usePathname, useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useMounted } from "@/hooks/use-mounted";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { BellIcon, SparklesIcon, UserRoundIcon } from "lucide-react";
import { CommandSearch } from "@/components/layout/command-search";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { MobileProductMenu } from "./mobile-product-menu";
import { AchievementAvatar } from "@/components/user/achievement-avatar";
import { DESKTOP_PRODUCT_NAVIGATION } from "@/lib/product-navigation";
import { cn } from "@/lib/utils";

const NotificationCenter = dynamic(() =>
  import("@/components/layout/notification-center").then(
    (module) => module.NotificationCenter,
  ),
);

const accountSlotClassName =
  "flex size-11 shrink-0 items-center justify-end md:h-8 md:w-[4.5rem] xl:w-40";

export function Navbar({ leading }: { leading?: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { data: session } = authClient.useSession();
  // `useSession` reads a cookie-backed session snapshot synchronously on the
  // client, so the first client render can already know the user while the
  // server rendered the logged-out state — a hydration mismatch (React #418)
  // that regenerates the whole layout on hydrate. Gate the auth-dependent
  // branch on mount so the server output and the first client render agree on
  // fixed-size placeholders; the real session UI swaps in right after mount.
  const mounted = useMounted();
  const [activeOverlay, setActiveOverlay] = useState<
    "search" | "notifications" | "account" | "products" | null
  >(null);
  const sessionUserId = session?.user?.id ?? session?.user?.email;
  const [nicknameOpen, setNicknameOpen] = useState(false);
  const [nickname, setNickname] = useState("");
  const [nicknameError, setNicknameError] = useState("");
  const [saving, setSaving] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [achievementNotice, setAchievementNotice] = useState<{
    userId: string | undefined;
    count: number;
  }>({ userId: undefined, count: 0 });
  const achievementNoticeCount =
    achievementNotice.userId === sessionUserId ? achievementNotice.count : 0;
  const sessionDisplayName = session?.user
    ? ((session.user as Record<string, unknown>).nickname as string) ||
      session.user.email
    : "";

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;

    const desktopViewport = window.matchMedia("(min-width: 768px)");
    const closeMobileProductMenu = () => {
      if (!desktopViewport.matches) return;
      setActiveOverlay((current) => (current === "products" ? null : current));
    };

    closeMobileProductMenu();
    desktopViewport.addEventListener("change", closeMobileProductMenu);
    return () =>
      desktopViewport.removeEventListener("change", closeMobileProductMenu);
  }, []);

  useEffect(() => {
    if (!mounted || !sessionUserId) return;
    let cancelled = false;
    const handleNoticesSeen = () => {
      cancelled = true;
      setAchievementNotice({ userId: sessionUserId, count: 0 });
    };
    window.addEventListener("achievement-notices-seen", handleNoticesSeen);
    // A passive Server Action can apply a stale route tree if it finishes after
    // the user navigates. Keep this badge refresh on an ordinary HTTP request.
    void fetch("/api/achievement-notices/count", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok)
          throw new Error("Achievement notice count unavailable");
        const payload: unknown = await response.json();
        if (
          typeof payload !== "object" ||
          payload === null ||
          !("count" in payload) ||
          typeof payload.count !== "number"
        ) {
          throw new Error("Invalid achievement notice count response");
        }
        return payload.count;
      })
      .then((count) => {
        if (!cancelled) setAchievementNotice({ userId: sessionUserId, count });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
      window.removeEventListener("achievement-notices-seen", handleNoticesSeen);
    };
  }, [mounted, pathname, sessionUserId]);

  async function handleSignOut() {
    setSigningOut(true);
    try {
      const { error } = await authClient.signOut();
      if (error) {
        toast.error(error.message ?? "登出失败，请稍后重试");
        return;
      }
      router.push("/login");
      router.refresh();
    } catch {
      toast.error("登出失败，请稍后重试");
    } finally {
      setSigningOut(false);
    }
  }

  async function handleNicknameSave(e: React.FormEvent) {
    e.preventDefault();
    setNicknameError("");
    setSaving(true);
    try {
      const res = await fetch("/api/auth/nickname", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nickname }),
      });
      const data = await res.json();
      if (!res.ok) {
        setNicknameError(data.error || "保存失败");
        return;
      }
      setNicknameOpen(false);
    } finally {
      setSaving(false);
    }
  }

  function openNicknameDialog() {
    setNickname(
      ((session?.user as Record<string, unknown>)?.nickname as string) || "",
    );
    setNicknameError("");
    setNicknameOpen(true);
  }

  return (
    <>
      <header
        data-testid="global-header"
        className="sticky top-0 z-30 h-[var(--navbar-height)] border-b bg-background/95 backdrop-blur-md supports-backdrop-filter:bg-background/85"
      >
        <div className="grid h-full grid-cols-[minmax(0,1fr)_auto] items-center pt-[var(--safe-area-top)] pr-[calc(var(--safe-area-right)+0.5rem)] pl-[calc(var(--safe-area-left)+0.5rem)] md:flex md:gap-4 md:pr-[calc(var(--safe-area-right)+1rem)] md:pl-[calc(var(--safe-area-left)+1rem)]">
          <div className="flex min-w-0 items-center md:shrink-0">
            {leading}
            <Link
              href="/"
              className="flex min-h-11 min-w-0 touch-manipulation items-center rounded-md px-1 text-lg font-bold tracking-[-0.035em] transition-[background-color,transform] active:scale-[0.98] active:bg-accent focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 motion-reduce:transition-none md:min-h-0 md:px-0"
            >
              CUpedia
            </Link>
          </div>
          <nav
            aria-label="产品导航"
            className="hidden min-w-0 flex-1 items-center gap-3 md:flex"
          >
            {DESKTOP_PRODUCT_NAVIGATION.map((item) => (
              <Link
                key={item.id}
                href={item.href}
                aria-label={
                  item.status
                    ? `${item.desktopLabel ?? item.label} · ${item.status}`
                    : undefined
                }
                className="flex min-h-8 shrink-0 touch-manipulation items-center gap-1.5 rounded-md text-sm text-muted-foreground transition-[background-color,color,transform] hover:text-foreground active:scale-[0.98] active:bg-accent active:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 motion-reduce:transition-none"
              >
                <span aria-hidden={item.status ? "true" : undefined}>
                  {item.desktopLabel ?? item.label}
                </span>
                {item.status && (
                  <span className="rounded-full bg-[#5b2a73]/10 px-1.5 py-0.5 text-[10px] leading-none font-semibold text-[#5b2a73] dark:bg-purple-300/15 dark:text-purple-200">
                    <span aria-hidden="true">{item.status}</span>
                  </span>
                )}
              </Link>
            ))}
          </nav>
          <nav
            aria-label="全局操作"
            className="col-start-2 flex shrink-0 items-center gap-0 md:gap-1"
          >
            <Link
              href="/updates"
              aria-label="产品更新"
              className="hidden min-h-8 touch-manipulation items-center gap-1.5 rounded-md px-2 text-sm font-medium text-emerald-700 transition-[background-color,color,transform] hover:bg-emerald-950/5 hover:text-emerald-900 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 motion-reduce:transition-none md:flex dark:text-emerald-300 dark:hover:bg-emerald-200/10 dark:hover:text-emerald-200"
            >
              <SparklesIcon className="size-4" aria-hidden="true" />
              <span className="hidden lg:inline">产品更新</span>
            </Link>
            <span className="hidden md:block">
              <ThemeToggle />
            </span>
            <CommandSearch
              open={activeOverlay === "search"}
              onOpenChange={(open) => setActiveOverlay(open ? "search" : null)}
            />
            {mounted && session?.user ? (
              <>
                <span className="flex size-11 shrink-0 items-center justify-center md:size-8">
                  <NotificationCenter
                    open={activeOverlay === "notifications"}
                    onOpenChange={(open) =>
                      setActiveOverlay(open ? "notifications" : null)
                    }
                  />
                </span>
                <span
                  data-testid="account-slot"
                  className={accountSlotClassName}
                >
                  <DropdownMenu
                    open={activeOverlay === "account"}
                    onOpenChange={(open) =>
                      setActiveOverlay(open ? "account" : null)
                    }
                  >
                    <DropdownMenuTrigger
                      aria-label={sessionDisplayName}
                      className="flex size-11 touch-manipulation items-center justify-center gap-2 rounded-md text-sm transition-[background-color,transform] hover:bg-accent active:scale-[0.98] active:bg-accent focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 motion-reduce:transition-none md:h-8 md:w-auto md:min-w-11 md:px-1"
                    >
                      <span className="relative">
                        <AchievementAvatar
                          image={session.user.image}
                          size="xs"
                        />
                        {achievementNoticeCount > 0 && (
                          <span
                            data-testid="achievement-notice-badge"
                            aria-label={`${achievementNoticeCount} 个未读成就提醒`}
                            className="absolute -top-1 -right-1 flex min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] leading-4 font-semibold text-white tabular-nums"
                          >
                            {achievementNoticeCount > 9
                              ? "9+"
                              : achievementNoticeCount}
                          </span>
                        )}
                      </span>
                      <span className="hidden max-w-32 truncate xl:inline">
                        {sessionDisplayName}
                      </span>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        onClick={() => router.push("/courses/my-reviews")}
                      >
                        我的测评
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => router.push("/courses/achievements")}
                      >
                        我的成就
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={openNicknameDialog}>
                        修改昵称
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        disabled={signingOut}
                        onClick={handleSignOut}
                      >
                        {signingOut ? "登出中..." : "登出"}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </span>
              </>
            ) : mounted ? (
              <>
                <Link
                  href="/login"
                  aria-label="登录后可读取通知"
                  className="flex size-11 shrink-0 touch-manipulation items-center justify-center rounded-md text-muted-foreground transition-[background-color,color,transform] hover:bg-accent hover:text-foreground active:scale-[0.98] focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 motion-reduce:transition-none md:size-8"
                  data-testid="notification-slot"
                >
                  <BellIcon aria-hidden="true" className="size-5" />
                </Link>
                <span
                  data-testid="account-slot"
                  className={accountSlotClassName}
                >
                  <Link
                    href="/login"
                    aria-label="登录"
                    className={cn(
                      buttonVariants({ size: "sm", variant: "default" }),
                      "size-11 touch-manipulation px-0 active:scale-[0.98] motion-reduce:transition-none md:h-8 md:w-auto md:min-w-11 md:px-3",
                    )}
                  >
                    <UserRoundIcon
                      aria-hidden="true"
                      className="size-4 md:hidden"
                    />
                    <span className="hidden md:inline">登录</span>
                  </Link>
                </span>
              </>
            ) : (
              <>
                <button
                  type="button"
                  disabled
                  aria-label="正在加载通知"
                  className="flex size-11 shrink-0 items-center justify-center rounded-md text-muted-foreground md:size-8"
                  data-testid="notification-slot"
                >
                  <BellIcon aria-hidden="true" className="size-5" />
                </button>
                <span
                  data-testid="account-slot"
                  className={accountSlotClassName}
                >
                  <button
                    type="button"
                    disabled
                    aria-label="正在加载账户"
                    data-testid="account-hydration-placeholder"
                    className="flex size-11 shrink-0 items-center justify-center rounded-md text-muted-foreground md:h-8 md:w-11"
                  >
                    <UserRoundIcon aria-hidden="true" className="size-4" />
                  </button>
                </span>
              </>
            )}
            <MobileProductMenu
              open={activeOverlay === "products"}
              onOpenChange={(open) =>
                setActiveOverlay(open ? "products" : null)
              }
            />
          </nav>
        </div>
      </header>

      <Dialog open={nicknameOpen} onOpenChange={setNicknameOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>修改昵称</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleNicknameSave} className="space-y-4">
            <Input
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              placeholder="输入新昵称"
              minLength={2}
              maxLength={20}
              disabled={saving}
            />
            {nicknameError && (
              <p className="text-sm text-red-500">{nicknameError}</p>
            )}
            <Button type="submit" className="w-full" disabled={saving}>
              {saving ? "保存中..." : "保存"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
