"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { isAllowedEmail } from "@/lib/email";
import { validateNickname } from "@/lib/nickname";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function RegisterPage() {
  const router = useRouter();
  const [step, setStep] = useState<"profile" | "otp">("profile");
  const [email, setEmail] = useState("");
  const [nickname, setNickname] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSignup(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    if (!isAllowedEmail(email)) {
      setError("仅支持 CUHK 邮箱注册");
      return;
    }
    const nicknameResult = validateNickname(nickname);
    if (!nicknameResult.ok) {
      setError(nicknameResult.error);
      return;
    }
    if (password.length < 8) {
      setError("密码至少需要 8 个字符");
      return;
    }
    if (password.length > 128) {
      setError("密码最多 128 个字符");
      return;
    }
    if (password !== confirmPassword) {
      setError("两次输入的密码不一致");
      return;
    }

    setLoading(true);
    try {
      const { error: signupError } = await authClient.signUp.email({
        email,
        password,
        name: nicknameResult.nickname,
        nickname: nicknameResult.nickname,
      });
      if (signupError) {
        setError(signupError.message ?? "注册失败，请稍后重试");
        return;
      }
      setStep("otp");
    } catch {
      setError("注册失败，请稍后重试");
    } finally {
      setLoading(false);
    }
  }

  async function handleVerification(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    if (!/^\d{6}$/.test(otp)) {
      setError("请输入 6 位验证码");
      return;
    }
    setLoading(true);
    try {
      const { error: verificationError } =
        await authClient.emailOtp.verifyEmail({
          email,
          otp,
        });
      if (verificationError) {
        setError("验证码无效或已过期");
        return;
      }
      router.push("/");
      router.refresh();
    } catch {
      setError("验证失败，请稍后重试");
    } finally {
      setLoading(false);
    }
  }

  async function handleResend() {
    setError("");
    setLoading(true);
    try {
      const { error: resendError } =
        await authClient.emailOtp.sendVerificationOtp({
          email,
          type: "email-verification",
        });
      if (resendError) {
        setError(resendError.message ?? "验证码发送失败，请稍后重试");
      }
    } catch {
      setError("验证码发送失败，请稍后重试");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>注册 CUpedia</CardTitle>
      </CardHeader>
      <CardContent>
        {step === "profile" ? (
          <form className="space-y-4" onSubmit={handleSignup}>
            <div className="space-y-2">
              <Label htmlFor="reg-email">CUHK 邮箱</Label>
              <Input
                id="reg-email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
                autoComplete="username"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="reg-nickname">昵称</Label>
              <Input
                id="reg-nickname"
                value={nickname}
                onChange={(event) => setNickname(event.target.value)}
                required
                minLength={2}
                maxLength={20}
                autoComplete="nickname"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="reg-password">密码</Label>
              <Input
                id="reg-password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
                minLength={8}
                maxLength={128}
                autoComplete="new-password"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="reg-confirm">确认密码</Label>
              <Input
                id="reg-confirm"
                type="password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                required
                minLength={8}
                maxLength={128}
                autoComplete="new-password"
              />
            </div>
            {error && <p className="text-sm text-red-500">{error}</p>}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "注册中..." : "注册"}
            </Button>
            <p className="text-center text-sm text-muted-foreground">
              已有账号？
              <Link href="/login" className="text-primary hover:underline">
                登录
              </Link>
            </p>
          </form>
        ) : (
          <form className="space-y-4" onSubmit={handleVerification}>
            <p className="text-sm text-muted-foreground">
              验证码已发送至 <span className="font-medium">{email}</span>
            </p>
            <div className="space-y-2">
              <Label htmlFor="reg-otp">验证码</Label>
              <Input
                id="reg-otp"
                inputMode="numeric"
                pattern="[0-9]{6}"
                maxLength={6}
                value={otp}
                onChange={(event) =>
                  setOtp(event.target.value.replace(/\D/g, "").slice(0, 6))
                }
                required
              />
            </div>
            {error && <p className="text-sm text-red-500">{error}</p>}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "验证中..." : "验证并登录"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="w-full"
              disabled={loading}
              onClick={handleResend}
            >
              重新发送
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
