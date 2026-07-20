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

  const response = NextResponse.json({ ok: true });

  // The cached session user still contains the previous nickname. Expire only
  // that cache (including secure and chunked variants) so the next session
  // read uses the updated database row without signing the user out.
  for (const cookie of (req.headers.get("cookie") ?? "").split(";")) {
    const name = cookie.split("=", 1)[0].trim();
    if (/^(?:__Secure-)?better-auth\.session_data(?:\.\d+)?$/.test(name)) {
      response.cookies.set({
        name,
        value: "",
        expires: new Date(0),
        path: "/",
        secure: name.startsWith("__Secure-"),
      });
    }
  }

  return response;
}
