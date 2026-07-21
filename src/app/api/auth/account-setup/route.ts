import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { users } from "@/db/schema";
import { requireAuth } from "@/lib/auth-guard";
import { getContributorSetup } from "@/lib/contributor-account";
import { validateNickname } from "@/lib/nickname";

function hasAuthErrorCode(error: unknown, code: string) {
  if (!error || typeof error !== "object") return false;
  const candidate = error as {
    code?: string;
    message?: string;
    body?: { code?: string };
  };
  return (
    candidate.code === code ||
    candidate.body?.code === code ||
    candidate.message?.includes(code) === true
  );
}

export async function GET() {
  const user = await requireAuth();
  const needs = await getContributorSetup(user);
  return NextResponse.json({
    complete: !needs.nickname && !needs.password,
    needs,
  });
}

export async function POST(request: Request) {
  const user = await requireAuth();
  const needs = await getContributorSetup(user);
  let body: { nickname?: unknown; password?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "请求格式不正确" }, { status: 400 });
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "请求格式不正确" }, { status: 400 });
  }

  let nickname: string | undefined;
  if (needs.nickname) {
    const result = validateNickname(
      typeof body.nickname === "string" ? body.nickname : "",
    );
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    nickname = result.nickname;
  }

  if (
    needs.password &&
    (typeof body.password !== "string" || body.password.length < 8)
  ) {
    return NextResponse.json(
      { error: "密码至少需要 8 个字符" },
      { status: 400 },
    );
  }
  if (needs.password && (body.password as string).length > 128) {
    return NextResponse.json({ error: "密码最多 128 个字符" }, { status: 400 });
  }

  if (needs.password) {
    try {
      await auth.api.setPassword({
        body: { newPassword: body.password as string },
        headers: await headers(),
      });
    } catch (error) {
      if (!hasAuthErrorCode(error, "PASSWORD_ALREADY_SET")) throw error;
      const concurrentNeeds = await getContributorSetup(user);
      if (concurrentNeeds.password) throw error;
    }
  }

  if (nickname !== undefined) {
    await db
      .update(users)
      .set({ nickname, updatedAt: new Date() })
      .where(eq(users.id, user.id));
  }

  const freshUser = await db.query.users.findFirst({
    where: eq(users.id, user.id),
    columns: { id: true, nickname: true },
  });
  if (!freshUser) {
    return NextResponse.json({ error: "账号不存在" }, { status: 404 });
  }
  const finalNeeds = await getContributorSetup(freshUser);
  return NextResponse.json({
    complete: !finalNeeds.nickname && !finalNeeds.password,
    needs: finalNeeds,
  });
}
