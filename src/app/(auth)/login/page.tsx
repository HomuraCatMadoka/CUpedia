"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { isAllowedEmail } from "@/lib/email";

type Tab = "password" | "otp";
type OtpStep = "email" | "code";

const OTP_EXPIRY_SECONDS = 300;

export default function LoginPage() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [otpStep, setOtpStep] = useState<OtpStep>("email");
  const [countdown, setCountdown] = useState(0);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [countdown]);

  async function handlePasswordLogin(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    // No domain gate on password sign-in: the account must already exist, so
    // there is nothing to abuse. The whitelist guards account creation
    // (register/OTP), enforced server-side in auth.ts.
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

  const sendOtp = useCallback(async () => {
    setError("");
    if (!isAllowedEmail(email)) {
      setError("仅支持 CUHK 邮箱");
      return false;
    }
    setLoading(true);
    try {
      const { error: sendError } =
        await authClient.emailOtp.sendVerificationOtp({
          email,
          type: "sign-in",
        });
      if (sendError) {
        setError(sendError.message ?? "发送验证码失败");
        return false;
      }
      setCountdown(OTP_EXPIRY_SECONDS);
      return true;
    } catch {
      setError("发送验证码失败，请稍后重试");
      return false;
    } finally {
      setLoading(false);
    }
  }, [email]);

  async function handleOtpEmailSubmit(e: React.FormEvent) {
    e.preventDefault();
    const ok = await sendOtp();
    if (ok) setOtpStep("code");
  }

  async function handleOtpVerify(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (otp.length !== 6) {
      setError("请输入 6 位验证码");
      return;
    }
    setLoading(true);
    try {
      const { error: authError } = await authClient.signIn.emailOtp({
        email,
        otp,
      });
      if (authError) {
        setError(authError.message ?? "验证码无效或已过期");
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

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

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

        {tab === "password" && (
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
                autoComplete="username"
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
                autoComplete="current-password"
              />
            </div>
            {error && <p className="text-sm text-red-500">{error}</p>}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "登录中..." : "登录"}
            </Button>
            <Link
              href="/reset-password"
              className="block w-full text-center text-sm text-muted-foreground hover:text-primary"
            >
              忘记密码？
            </Link>
            <p className="text-center text-sm text-muted-foreground">
              还没有账号？
              <Link href="/register" className="text-primary hover:underline">
                注册
              </Link>
            </p>
          </form>
        )}

        {tab === "otp" && otpStep === "email" && (
          <form onSubmit={handleOtpEmailSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="otp-email">CUHK 邮箱</Label>
              <Input
                id="otp-email"
                type="email"
                placeholder="1155xxxxxx@link.cuhk.edu.hk"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            {error && <p className="text-sm text-red-500">{error}</p>}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "发送中..." : "发送验证码"}
            </Button>
            <p className="text-center text-sm text-muted-foreground">
              还没有账号？
              <Link href="/register" className="text-primary hover:underline">
                注册
              </Link>
            </p>
          </form>
        )}

        {tab === "otp" && otpStep === "code" && (
          <form onSubmit={handleOtpVerify} className="space-y-4">
            <p className="text-sm text-muted-foreground">
              验证码已发送至 <span className="font-medium">{email}</span>
            </p>
            <div className="space-y-2">
              <Label htmlFor="otp-code">验证码</Label>
              <Input
                id="otp-code"
                type="text"
                inputMode="numeric"
                pattern="[0-9]{6}"
                maxLength={6}
                placeholder="输入 6 位验证码"
                value={otp}
                onChange={(e) =>
                  setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))
                }
                required
                autoFocus
              />
            </div>
            <div className="flex items-center justify-between text-sm">
              {countdown > 0 ? (
                <span className="text-muted-foreground">
                  {formatTime(countdown)} 后可重新发送
                </span>
              ) : (
                <button
                  type="button"
                  className="text-primary hover:underline"
                  onClick={sendOtp}
                  disabled={loading}
                >
                  重新发送
                </button>
              )}
              <button
                type="button"
                className="text-muted-foreground hover:text-foreground"
                onClick={() => {
                  setOtpStep("email");
                  setOtp("");
                  setError("");
                }}
              >
                更换邮箱
              </button>
            </div>
            {error && <p className="text-sm text-red-500">{error}</p>}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "验证中..." : "登录"}
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
