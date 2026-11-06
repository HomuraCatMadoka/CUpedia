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
  const [email, setEmail] = useState("");
  const [nickname, setNickname] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
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
        setError(
          signupError.code === "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL"
            ? "这个邮箱已有账号，请登录或找回密码"
            : (signupError.message ?? "注册失败，请稍后重试"),
        );
        return;
      }
      router.push("/");
      router.refresh();
    } catch {
      setError("注册失败，请稍后重试");
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
          {error && (
            <p role="alert" className="text-sm text-red-500">
              {error}
            </p>
          )}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "注册中..." : "注册"}
          </Button>
          <p className="text-center text-sm text-muted-foreground">
            已有账号？
            <Link href="/login" className="text-primary hover:underline">
              登录
            </Link>
            <span aria-hidden="true" className="mx-2">
              ·
            </span>
            <Link
              href="/reset-password"
              className="text-primary hover:underline"
            >
              找回密码
            </Link>
          </p>
        </form>
      </CardContent>
    </Card>
  );
}
