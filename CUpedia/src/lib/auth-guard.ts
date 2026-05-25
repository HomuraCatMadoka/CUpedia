import { auth } from "@/lib/auth";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { getWikiEditRoleFresh } from "@/lib/site-settings";

export async function requireAuth() {
  const session = await auth();
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
  const session = await auth();
  return session?.user ?? null;
}
