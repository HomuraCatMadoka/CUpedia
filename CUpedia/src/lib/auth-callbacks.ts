import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { isAllowedEmail, normalizeEmail } from "@/lib/email";

export async function checkSignIn(user: { id?: string; email?: string | null }): Promise<boolean> {
  if (!user.email || !isAllowedEmail(user.email)) return false;

  const normalized = normalizeEmail(user.email);
  const existing = await db.query.users.findFirst({
    where: eq(users.email, normalized),
    columns: { banned: true },
  });
  if (existing?.banned) return false;

  return true;
}

export async function refreshTokenFromDb(
  token: Record<string, any>,
  trigger: string | undefined
): Promise<Record<string, any>> {
  if (trigger !== "update" || !token.sub) return token;

  const dbUser = await db.query.users.findFirst({
    where: eq(users.id, token.sub),
    columns: { nickname: true, role: true, banned: true },
  });
  if (dbUser) {
    token.nickname = dbUser.nickname;
    token.role = dbUser.role;
    token.banned = dbUser.banned;
  }

  return token;
}
