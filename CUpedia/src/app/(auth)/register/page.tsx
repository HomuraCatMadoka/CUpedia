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
import { validateNickname } from "@/lib/nickname";

type Step = "email" | "otp" | "profile";

const OTP_EXPIRY_SECONDS = 300;

export default function RegisterPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [nickname, setNickname] = useState("");
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
      setError("仅支持 CUHK 邮箱注册");
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

  async function handleEmailSubmit(e: React.FormEvent) {
    e.preventDefault();
    const ok = await sendOtp();
    if (ok) setStep("otp");
  }

  function handleOtpSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (otp.length !== 6) {
      setError("请输入 6 位验证码");
      return;
    }
    setStep("profile");
  }

  async function handleProfileSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    const nicknameResult = validateNickname(nickname);
    if (!nicknameResult.ok) {
      setError(nicknameResult.error);
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
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          otp,
          password,
          nickname: nicknameResult.nickname,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "注册失败");
        if (data.error?.includes("验证码") || data.error?.includes("过期")) {
          setStep("otp");
        }
        return;
      }
      router.push("/wiki");
      router.refresh();
    } catch {
      setError("注册失败，请稍后重试");
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
        <CardTitle>注册 CUpedia</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {step === "email" && (
          <form onSubmit={handleEmailSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="reg-email">CUHK 邮箱</Label>
              <Input
                id="reg-email"
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
              已有账号？
              <Link href="/login" className="text-primary hover:underline">
                登录
              </Link>
            </p>
          </form>
        )}

        {step === "otp" && (
          <form onSubmit={handleOtpSubmit} className="space-y-4">
            <p className="text-sm text-muted-foreground">
              验证码已发送至 <span className="font-medium">{email}</span>
            </p>
            <div className="space-y-2">
              <Label htmlFor="reg-otp">验证码</Label>
              <Input
                id="reg-otp"
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
                  setStep("email");
                  setError("");
                }}
              >
                更换邮箱
              </button>
            </div>
            {error && <p className="text-sm text-red-500">{error}</p>}
            <Button type="submit" className="w-full">
              下一步
            </Button>
          </form>
        )}

        {step === "profile" && (
          <form onSubmit={handleProfileSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="reg-nickname">昵称</Label>
              <Input
                id="reg-nickname"
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                placeholder="中英文、数字、下划线，2-20 字符"
                required
                minLength={2}
                maxLength={20}
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="reg-password">密码</Label>
              <Input
                id="reg-password"
                type="password"
                placeholder="至少 8 个字符"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="reg-confirm">确认密码</Label>
              <Input
                id="reg-confirm"
                type="password"
                placeholder="再次输入密码"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                minLength={8}
              />
            </div>
            {error && <p className="text-sm text-red-500">{error}</p>}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "注册中..." : "注册"}
            </Button>
            <button
              type="button"
              className="block w-full text-center text-sm text-muted-foreground hover:text-foreground"
              onClick={() => {
                setStep("otp");
                setError("");
              }}
            >
              返回上一步
            </button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
