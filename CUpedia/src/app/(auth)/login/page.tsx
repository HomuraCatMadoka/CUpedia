"use client";

import { signIn } from "next-auth/react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { isAllowedEmail } from "@/lib/email";

const NEUTRAL_MSG = "如果该邮箱可以登录，登录链接将发送至你的邮箱";

async function fetchJson(url: string, body: unknown) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok && res.status >= 500) {
    return { ok: false, code: "INTERNAL_ERROR" };
  }
  try {
    return await res.json();
  } catch {
    return { ok: false, code: "INTERNAL_ERROR" };
  }
}

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [sentMessage, setSentMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (!isAllowedEmail(email)) {
      setError("仅支持 CUHK 邮箱注册");
      return;
    }

    setLoading(true);
    try {
      const preflight = await fetchJson("/api/auth/magic-link/preflight", {
        email,
      });

      if (!preflight.ok) {
        switch (preflight.code) {
          case "INVALID_EMAIL":
            setError("请输入有效邮箱地址");
            return;
          case "INVALID_EMAIL_DOMAIN":
            setError("仅支持 CUHK 邮箱注册");
            return;
          case "RATE_LIMITED":
            setError(
              `发送过于频繁，请 ${preflight.retryAfterSeconds} 秒后重试`
            );
            return;
          case "SUPPRESSED":
            setSentMessage(NEUTRAL_MSG);
            setSent(true);
            return;
          default:
            setError("发送失败，请稍后重试");
            return;
        }
      }

      const result = await signIn("email", { email, redirect: false });

      if (result?.error) {
        const recheck = await fetchJson("/api/auth/magic-link/preflight", {
          email,
        });

        if (!recheck.ok && recheck.code === "RATE_LIMITED") {
          setError(
            `发送过于频繁，请 ${recheck.retryAfterSeconds} 秒后重试`
          );
        } else {
          setSentMessage(NEUTRAL_MSG);
          setSent(true);
        }
      } else {
        setSentMessage(`登录链接已发送至 ${email}，点击链接即可登录。`);
        setSent(true);
      }
    } catch {
      setError("发送失败，请稍后重试");
    } finally {
      setLoading(false);
    }
  }

  if (sent) {
    return (
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>查看你的邮箱</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">{sentMessage}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>登录 CUpedia</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">CUHK 邮箱</Label>
            <Input
              id="email"
              type="email"
              placeholder="sid@link.cuhk.edu.hk"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          {error && <p className="text-sm text-red-500">{error}</p>}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "发送中..." : "发送登录链接"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
