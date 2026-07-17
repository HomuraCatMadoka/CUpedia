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

type Step = "email" | "reset" | "done";

const OTP_EXPIRY_SECONDS = 600;

function resetErrorMessage(message?: string) {
  const normalized = message?.toLowerCase() ?? "";
  if (normalized.includes("expired")) return "验证码已过期，请重新获取";
  if (normalized.includes("otp")) return "验证码无效，请检查后重试";
  return message ?? "重置失败，请检查验证码";
}

export default function ResetPasswordPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [countdown, setCountdown] = useState(0);

  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [countdown]);

  const sendOtp = useCallback(async () => {
    setError("");
    if (!isAllowedEmail(email)) {
      setError("仅支持 CUHK 邮箱");
      return false;
    }
    setLoading(true);
    try {
      const { error: sendError } =
        await authClient.emailOtp.requestPasswordReset({ email });
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

  async function handleEmailSubmit(e: React.FormEvent) {
    e.preventDefault();
    const ok = await sendOtp();
    if (ok) setStep("reset");
  }

  async function handleResetSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (otp.length !== 6) {
      setError("请输入 6 位验证码");
      return;
    }
    if (password.length < 8) {
      setError("密码至少需要 8 个字符");
      return;
    }
    if (password !== confirmPassword) {
      setError("两次输入的密码不一致");
      return;
    }
    setLoading(true);
    try {
      const { error: resetError } = await authClient.emailOtp.resetPassword({
        email,
        otp,
        password,
      });
      if (resetError) {
        setError(resetErrorMessage(resetError.message));
        return;
      }
      setStep("done");
    } catch {
      setError("重置失败，请稍后重试");
    } finally {
      setLoading(false);
    }
  }

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>重置密码</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {step === "email" && (
          <form onSubmit={handleEmailSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="reset-email">CUHK 邮箱</Label>
              <Input
                id="reset-email"
                type="email"
                placeholder="1155xxxxxx@link.cuhk.edu.hk"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="username"
              />
            </div>
            {error && <p className="text-sm text-red-500">{error}</p>}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "发送中..." : "发送验证码"}
            </Button>
            <p className="text-center text-sm text-muted-foreground">
              想起密码了？
              <Link href="/login" className="text-primary hover:underline">
                返回登录
              </Link>
            </p>
          </form>
        )}

        {step === "reset" && (
          <form onSubmit={handleResetSubmit} className="space-y-4">
            <p className="text-sm text-muted-foreground">
              验证码已发送至 <span className="font-medium">{email}</span>
            </p>
            {/* Hidden username field so password managers update email+password. */}
            <input
              type="email"
              name="email"
              value={email}
              autoComplete="username"
              readOnly
              tabIndex={-1}
              className="sr-only"
              aria-hidden
            />
            <div className="space-y-2">
              <Label htmlFor="reset-otp">验证码</Label>
              <Input
                id="reset-otp"
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
            <div className="space-y-2">
              <Label htmlFor="reset-password">新密码</Label>
              <Input
                id="reset-password"
                type="password"
                placeholder="至少 8 个字符"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                autoComplete="new-password"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="reset-confirm">确认新密码</Label>
              <Input
                id="reset-confirm"
                type="password"
                placeholder="再次输入新密码"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                minLength={8}
                autoComplete="new-password"
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
                  setStep("email");
                  setError("");
                }}
              >
                更换邮箱
              </button>
            </div>
            {error && <p className="text-sm text-red-500">{error}</p>}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "重置中..." : "重置密码"}
            </Button>
          </form>
        )}

        {step === "done" && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              密码已重置，请使用新密码登录。
            </p>
            <Button className="w-full" onClick={() => router.push("/login")}>
              前往登录
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
