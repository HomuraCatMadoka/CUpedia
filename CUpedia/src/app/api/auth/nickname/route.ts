import { requireAuth } from "@/lib/auth-guard";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { validateNickname } from "@/lib/nickname";

export async function POST(req: Request) {
  let user;
  try {
    user = await requireAuth();
  } catch {
    return NextResponse.json({}, { status: 401 });
  }

  const { nickname: raw } = await req.json();
  const result = validateNickname(raw ?? "");
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  await db
    .update(users)
    .set({ nickname: result.nickname, updatedAt: new Date() })
    .where(eq(users.id, user.id));

  return NextResponse.json({ ok: true });
}
