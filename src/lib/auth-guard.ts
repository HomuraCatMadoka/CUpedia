import { auth } from "@/lib/auth";
import { db } from "@/db";
import { users, accounts } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { getWikiEditRoleFresh } from "@/lib/site-settings";
import { normalizeEmail } from "@/lib/email";
import { headers } from "next/headers";

/** True if the email already has a password (credential) account — i.e. it
 * completed registration. OTP-only sign-ins create a user row but no
 * credential account, so they are not "registered" for this purpose. */
export async function isEmailRegistered(email: string): Promise<boolean> {
  const rows = await db
    .select({ id: accounts.id })
    .from(accounts)
    .innerJoin(users, eq(accounts.userId, users.id))
    .where(
      and(
        eq(users.email, normalizeEmail(email)),
        eq(accounts.providerId, "credential"),
      ),
    )
    .limit(1);
  return rows.length > 0;
}

export async function requireAuth() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });
  if (!session?.user?.id) redirect("/login");

  const dbUser = await db.query.users.findFirst({
    where: eq(users.id, session.user.id),
    columns: {
      id: true,
      email: true,
      nickname: true,
      role: true,
      banned: true,
    },
  });

  if (!dbUser || dbUser.banned) redirect("/login?error=banned");

  return {
    id: dbUser.id,
    email: dbUser.email ?? session.user.email,
    name: session.user.name,
    image: session.user.image,
    role: dbUser.role,
    nickname: dbUser.nickname,
    banned: dbUser.banned,
  };
}

export async function requireAdmin() {
  const user = await requireAuth();
  if (user.role !== "admin") redirect("/");
  return user;
}

export async function requireEditor() {
  const user = await requireAuth();
  const editRole = await getWikiEditRoleFresh();
  if (editRole === "admin" && user.role !== "admin") {
    throw new Error("EDIT_PERMISSION_DENIED");
  }
  return user;
}

export async function requireEditorOrRedirect() {
  const user = await requireAuth();
  const editRole = await getWikiEditRoleFresh();
  if (editRole === "admin" && user.role !== "admin") {
    redirect("/wiki");
  }
  return user;
}

export async function getOptionalUser() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });
  return session?.user ?? null;
}
