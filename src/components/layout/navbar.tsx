"use client";

import Link from "next/link";
import { authClient } from "@/lib/auth-client";
import { useState } from "react";
import { useMounted } from "@/hooks/use-mounted";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CommandSearch } from "@/components/layout/command-search";

export function Navbar({ leading }: { leading?: React.ReactNode }) {
  const { data: session } = authClient.useSession();
  // `useSession` reads a cookie-backed session snapshot synchronously on the
  // client, so the first client render can already know the user while the
  // server rendered the logged-out state — a hydration mismatch (React #418)
  // that regenerates the whole layout on hydrate. Gate the auth-dependent
  // branch on mount so the server output and the first client render agree on
  // the logged-out markup; the real session UI swaps in right after mount.
  const mounted = useMounted();
  const [nicknameOpen, setNicknameOpen] = useState(false);
  const [nickname, setNickname] = useState("");
  const [nicknameError, setNicknameError] = useState("");
  const [saving, setSaving] = useState(false);

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
      <header className="sticky top-0 z-30 border-b bg-white">
        <div className="grid h-24 grid-cols-[1fr_auto] grid-rows-[3.5rem_2.5rem] px-4 md:flex md:h-14 md:items-center md:justify-between">
          <div className="flex items-center gap-3">
            {leading}
            <Link href="/wiki" className="text-lg font-bold">
              CUpedia
            </Link>
          </div>
          <div className="col-span-2 row-start-2 flex items-center justify-center gap-4 md:order-none md:col-span-1 md:justify-start md:gap-3">
            <Link
              href="/college-picker"
              className="text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              分院帽
            </Link>
            <Link
              href="/course-tree"
              className="flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              选课技能树
              <Badge variant="secondary" className="h-4 px-1.5 text-[10px]">
                开发中
              </Badge>
            </Link>
            <Link
              href="/courses"
              className="flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              课程测评
              <Badge variant="secondary" className="h-4 px-1.5 text-[10px]">
                开发中
              </Badge>
            </Link>
          </div>
          <nav className="col-start-2 row-start-1 flex items-center gap-4 md:order-none">
            <CommandSearch />
            {mounted && session?.user ? (
              <DropdownMenu>
                <DropdownMenuTrigger className="rounded-md px-3 py-1.5 text-sm hover:bg-accent">
                  {((session.user as Record<string, unknown>)
                    .nickname as string) || session.user.email}
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onSelect={openNicknameDialog}>
                    修改昵称
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => authClient.signOut()}>
                    登出
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <Link href="/login">
                <Button size="sm">登录</Button>
              </Link>
            )}
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
