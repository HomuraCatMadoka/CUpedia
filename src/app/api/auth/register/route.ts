import { auth } from "@/lib/auth";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { isAllowedEmail } from "@/lib/email";
import { isEmailRegistered } from "@/lib/auth-guard";
import { validateNickname } from "@/lib/nickname";
import { headers as nextHeaders } from "next/headers";
import { NextResponse } from "next/server";

// better-auth's session_data cache cookie (and its __Secure- / chunked
// variants). Matched by name, not substring, so a token value containing the
// text can't be mis-filtered. Assumes the default "better-auth" cookiePrefix.
function isSessionDataCookie(setCookie: string): boolean {
  const name = setCookie.split("=", 1)[0].trim();
  return /^(?:__Secure-)?better-auth\.session_data(?:\.\d+)?$/.test(name);
}

export async function POST(req: Request) {
  const { email, otp, password, nickname } = await req.json();

  if (
    typeof email !== "string" ||
    typeof otp !== "string" ||
    typeof password !== "string" ||
    typeof nickname !== "string"
  ) {
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

  // Registration is for new accounts only. An existing credential account must
  // log in or reset its password — re-registering would overwrite the nickname
  // and silently discard the new password. Bail before signInEmailOTP so no
  // session is created and no OTP is consumed.
  if (await isEmailRegistered(email)) {
    return NextResponse.json(
      { error: "该邮箱已注册，请直接登录" },
      { status: 409 },
    );
  }

  // signInEmailOTP creates the user + session, but its Set-Cookie lives on this
  // internal response — capture it (returnHeaders) for the steps below.
  const hdrs = await nextHeaders();
  let setCookies: string[];
  let userId: string;
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
    userId = otpResult.user.id;
  } catch {
    return NextResponse.json({ error: "验证码无效或已过期" }, { status: 400 });
  }

  // setPassword needs the just-created session — the incoming request carries
  // no session cookie yet. The email is unregistered (checked above), so this
  // creates the credential account; any throw is a real failure.
  const sessionCookie = setCookies.map((c) => c.split(";")[0]).join("; ");
  try {
    await auth.api.setPassword({
      body: { newPassword: password },
      headers: new Headers({ cookie: sessionCookie }),
    });
  } catch {
    return NextResponse.json({ error: "注册失败，请重试" }, { status: 500 });
  }

  await db
    .update(users)
    .set({ nickname: nicknameResult.nickname, updatedAt: new Date() })
    .where(eq(users.id, userId));

  // Forward the session cookies so registration logs the user in. Skip the
  // session_data cache cookie — it was minted before the nickname update and
  // would serve a stale user object for its 5-minute lifetime.
  const res = NextResponse.json({ ok: true });
  for (const cookie of setCookies) {
    if (!isSessionDataCookie(cookie)) {
      res.headers.append("set-cookie", cookie);
    }
  }
  return res;
}
