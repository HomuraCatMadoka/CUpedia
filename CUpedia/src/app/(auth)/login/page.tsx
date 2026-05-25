"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { isAllowedEmail } from "@/lib/email";

type Tab = "password" | "otp";

export default function LoginPage() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handlePasswordLogin(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (!isAllowedEmail(email)) {
      setError("仅支持 CUHK 邮箱注册");
      return;
    }

    setLoading(true);
    try {
      const { error: authError } = await authClient.signIn.email({
        email,
        password,
      });
      if (authError) {
        setError(authError.message ?? "登录失败，请检查邮箱和密码");
      } else {
        router.push("/wiki");
        router.refresh();
      }
    } catch {
      setError("登录失败，请稍后重试");
    } finally {
      setLoading(false);
    }
  }

  const tabClass = (t: Tab) =>
    `flex-1 py-2 text-center text-sm font-medium transition-colors ${
      tab === t
        ? "border-b-2 border-primary text-primary"
        : "text-muted-foreground hover:text-foreground"
    }`;

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>登录 CUpedia</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex border-b">
          <button
            type="button"
            className={tabClass("password")}
            onClick={() => {
              setTab("password");
              setError("");
            }}
          >
            密码登录
          </button>
          <button
            type="button"
            className={tabClass("otp")}
            onClick={() => {
              setTab("otp");
              setError("");
            }}
          >
            验证码登录
          </button>
        </div>

        {tab === "password" ? (
          <form onSubmit={handlePasswordLogin} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">CUHK 邮箱</Label>
              <Input
                id="email"
                type="email"
                placeholder="1155xxxxxx@link.cuhk.edu.hk"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">密码</Label>
              <Input
                id="password"
                type="password"
                placeholder="输入密码"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
              />
            </div>
            {error && <p className="text-sm text-red-500">{error}</p>}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "登录中..." : "登录"}
            </Button>
            <p className="text-center text-sm text-muted-foreground">
              还没有账号？
              <Link href="/register" className="text-primary hover:underline">
                注册
              </Link>
            </p>
          </form>
        ) : (
          <div className="py-8 text-center text-sm text-muted-foreground">
            验证码登录即将上线，敬请期待
          </div>
        )}
      </CardContent>
    </Card>
  );
}
