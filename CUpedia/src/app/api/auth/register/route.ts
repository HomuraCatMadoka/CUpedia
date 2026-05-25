import { auth } from "@/lib/auth";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { isAllowedEmail } from "@/lib/email";
import { validateNickname } from "@/lib/nickname";
import { headers as nextHeaders } from "next/headers";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const { email, otp, password, nickname } = await req.json();

  if (!email || !otp || !password || !nickname) {
    return NextResponse.json({ error: "缺少必填字段" }, { status: 400 });
  }

  if (!isAllowedEmail(email)) {
    return NextResponse.json(
      { error: "仅支持 CUHK 邮箱注册" },
      { status: 400 },
    );
  }

  const nicknameResult = validateNickname(nickname);
  if (!nicknameResult.ok) {
    return NextResponse.json({ error: nicknameResult.error }, { status: 400 });
  }

  if (password.length < 8) {
    return NextResponse.json(
      { error: "密码至少需要 8 个字符" },
      { status: 400 },
    );
  }

  // Verify OTP (stored under "sign-in" type since that's what sendVerificationOtp uses)
  const hdrs = await nextHeaders();
  let otpValid = false;
  try {
    const checkResult = await auth.api.signInEmailOTP({
      body: { email, otp },
      headers: hdrs,
    });
    if (checkResult.token) {
      otpValid = true;
    }
  } catch {
    return NextResponse.json({ error: "验证码无效或已过期" }, { status: 400 });
  }

  if (!otpValid) {
    return NextResponse.json({ error: "验证码无效或已过期" }, { status: 400 });
  }

  // signInEmailOTP created the user + session. Now set password and nickname.
  const dbUser = await db.query.users.findFirst({
    where: eq(users.email, email.toLowerCase()),
    columns: { id: true },
  });

  if (!dbUser) {
    return NextResponse.json({ error: "注册失败，请重试" }, { status: 500 });
  }

  // Set password via auth API (user is now authenticated)
  try {
    await auth.api.setPassword({
      body: { newPassword: password },
      headers: hdrs,
    });
  } catch {
    // Password might already be set if user already existed — ignore
  }

  // Update nickname
  await db
    .update(users)
    .set({ nickname: nicknameResult.nickname, updatedAt: new Date() })
    .where(eq(users.id, dbUser.id));

  return NextResponse.json({ ok: true });
}
