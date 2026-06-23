import { auth } from "@/lib/auth";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { headers } from "next/headers";

export type AdminApiUser = {
  id: string;
  email: string;
  nickname: string;
  role: string;
};

/** For API routes: returns null when caller is not an admin (no redirect). */
export async function getAdminUserForApi(): Promise<AdminApiUser | null> {
  const session = await auth.api.getSession({
    headers: await headers(),
  });
  if (!session?.user?.id) return null;

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

  if (!dbUser || dbUser.banned || dbUser.role !== "admin") return null;

  return {
    id: dbUser.id,
    email: dbUser.email,
    nickname: dbUser.nickname,
    role: dbUser.role,
  };
}
