"use client";

import { useState, useEffect, useCallback, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { isAllowedEmail } from "@/lib/email";
import { safeFoodleLoginReturnPath } from "@/lib/food-map/pending-intent";

type Tab = "password" | "otp";
type OtpStep = "email" | "code";

const OTP_EXPIRY_SECONDS = 600;
const subscribeToLocation = () => () => undefined;
const noFoodleReturn = () => false;

function hasFoodleReturn() {
  return safeFoodleLoginReturnPath(
    new URLSearchParams(window.location.search).get("next"),
  ).startsWith("/food-map");
}

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
  const returningToFoodle = useSyncExternalStore(
    subscribeToLocation,
    hasFoodleReturn,
    noFoodleReturn,
  );

  function finishLogin() {
    const next = safeFoodleLoginReturnPath(
      new URLSearchParams(window.location.search).get("next"),
    );
    router.push(next);
    router.refresh();
  }

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
        rememberMe: true,
      });
      if (authError) {
        setError(authError.message ?? "登录失败，请检查邮箱和密码");
      } else {
        finishLogin();
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
        finishLogin();
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
    `min-h-11 flex-1 px-2 text-center text-sm font-medium ${returningToFoodle ? "transition-none" : "transition-colors"} ${
      tab === t
        ? "border-b-2 border-primary text-primary"
        : "text-muted-foreground hover:text-foreground"
    }`;

  const submitClass = `h-11 w-full ${returningToFoodle ? "transition-none" : ""}`;

  return (
    <Card
      className={
        returningToFoodle
          ? "w-full max-w-md [--primary-foreground:#fff] [--primary:#672d7e] dark:[--primary-foreground:#211225] dark:[--primary:#c48fda]"
          : "w-full max-w-md"
      }
    >
      <CardHeader>
        {returningToFoodle ? (
          <p className="text-xs font-semibold tracking-[0.16em] text-[#672d7e] uppercase dark:text-[#c48fda]">
            Foodle Match
          </p>
        ) : null}
        <CardTitle>
          <h1>{returningToFoodle ? "登录后继续" : "登录 CUpedia"}</h1>
        </CardTitle>
        {returningToFoodle ? (
          <p className="text-sm text-muted-foreground">完成后回到刚才的餐厅</p>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex border-b" role="tablist" aria-label="登录方式">
          <button
            type="button"
            role="tab"
            id="password-login-tab"
            aria-controls="password-login-panel"
            aria-selected={tab === "password"}
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
            role="tab"
            id="otp-login-tab"
            aria-controls="otp-login-panel"
            aria-selected={tab === "otp"}
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
          <form
            id="password-login-panel"
            role="tabpanel"
            aria-label="登录表单"
            onSubmit={handlePasswordLogin}
            className="space-y-4"
          >
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
                className="h-11"
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
                className="h-11"
              />
            </div>
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            <Button
              type="submit"
              className={submitClass}
              style={
                returningToFoodle
                  ? {
                      backgroundColor: "var(--primary)",
                      color: "var(--primary-foreground)",
                    }
                  : undefined
              }
              disabled={loading}
            >
              {loading ? "登录中..." : "登录"}
            </Button>
            <Link
              href="/reset-password"
              className="inline-flex min-h-11 w-full items-center justify-center text-center text-sm text-muted-foreground hover:text-primary"
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
          <form
            id="otp-login-panel"
            role="tabpanel"
            aria-label="登录表单"
            onSubmit={handleOtpEmailSubmit}
            className="space-y-4"
          >
            <div className="space-y-2">
              <Label htmlFor="otp-email">CUHK 邮箱</Label>
              <Input
                id="otp-email"
                type="email"
                placeholder="1155xxxxxx@link.cuhk.edu.hk"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="h-11"
              />
            </div>
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            <Button
              type="submit"
              className={submitClass}
              style={
                returningToFoodle
                  ? {
                      backgroundColor: "var(--primary)",
                      color: "var(--primary-foreground)",
                    }
                  : undefined
              }
              disabled={loading}
            >
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
          <form
            id="otp-login-panel"
            role="tabpanel"
            aria-label="登录表单"
            onSubmit={handleOtpVerify}
            className="space-y-4"
          >
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
                className="h-11"
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
                  className="min-h-11 px-2 text-primary hover:underline"
                  onClick={sendOtp}
                  disabled={loading}
                >
                  重新发送
                </button>
              )}
              <button
                type="button"
                className="min-h-11 px-2 text-muted-foreground hover:text-foreground"
                onClick={() => {
                  setOtpStep("email");
                  setOtp("");
                  setError("");
                }}
              >
                更换邮箱
              </button>
            </div>
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            <Button
              type="submit"
              className={submitClass}
              style={
                returningToFoodle
                  ? {
                      backgroundColor: "var(--primary)",
                      color: "var(--primary-foreground)",
                    }
                  : undefined
              }
              disabled={loading}
            >
              {loading ? "验证中..." : "登录"}
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
