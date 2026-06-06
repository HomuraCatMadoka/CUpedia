import { auth } from "@/lib/auth";
import { db } from "@/db";
import { users, accounts } from "@/db/schema";
import { and, eq } from "drizzle-orm";
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

  // Verify OTP (stored under "sign-in" type since that's what sendVerificationOtp
  // uses). signInEmailOTP creates the user + session, but its Set-Cookie lives on
  // this internal response — capture it (returnHeaders) for the steps below.
  const hdrs = await nextHeaders();
  let setCookies: string[];
  try {
    const { headers: otpHeaders, response: otpResult } =
      await auth.api.signInEmailOTP({
        body: { email, otp },
        headers: hdrs,
        returnHeaders: true,
      });
    if (!otpResult.token) {
      return NextResponse.json(
        { error: "验证码无效或已过期" },
        { status: 400 },
      );
    }
    setCookies = otpHeaders.getSetCookie();
  } catch {
    return NextResponse.json({ error: "验证码无效或已过期" }, { status: 400 });
  }

  const dbUser = await db.query.users.findFirst({
    where: eq(users.email, email.toLowerCase()),
    columns: { id: true },
  });

  if (!dbUser) {
    return NextResponse.json({ error: "注册失败，请重试" }, { status: 500 });
  }

  // setPassword needs the just-created session — the incoming request carries
  // no session cookie yet.
  const sessionCookie = setCookies.map((c) => c.split(";")[0]).join("; ");
  try {
    await auth.api.setPassword({
      body: { newPassword: password },
      headers: new Headers({ cookie: sessionCookie }),
    });
  } catch {
    // Throws PASSWORD_ALREADY_SET when an existing user re-registers — the
    // guard below distinguishes that from a real failure.
  }

  const credential = await db.query.accounts.findFirst({
    where: and(
      eq(accounts.userId, dbUser.id),
      eq(accounts.providerId, "credential"),
    ),
    columns: { id: true },
  });
  if (!credential) {
    return NextResponse.json({ error: "注册失败，请重试" }, { status: 500 });
  }

  // Update nickname
  await db
    .update(users)
    .set({ nickname: nicknameResult.nickname, updatedAt: new Date() })
    .where(eq(users.id, dbUser.id));

  // Forward the session cookies so registration logs the user in. Skip the
  // session_data cache cookie — it was minted before the nickname update and
  // would serve a stale user object for its 5-minute lifetime.
  const res = NextResponse.json({ ok: true });
  for (const cookie of setCookies) {
    if (!cookie.includes("session_data")) {
      res.headers.append("set-cookie", cookie);
    }
  }
  return res;
}
