import { auth } from "@/lib/auth";
import { db } from "@/db";
import { users, accounts } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { getWikiEditRoleFresh, getOwnerUserId } from "@/lib/site-settings";
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

/** The site Owner: an admin recorded in siteSettings.owner_user_id. Both the
 * role (via requireAuth) and the owner id are read fresh from the DB, so a
 * just-promoted/transferred Owner is recognized without session-cache lag. */
export async function requireOwner() {
  const user = await requireAdmin();
  const ownerId = await getOwnerUserId();
  if (!ownerId || user.id !== ownerId) redirect("/");
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

/** One session + user fetch for canteen voting hot paths. */
export async function getSessionVoterUser(): Promise<{
  id: string;
  banned: boolean;
} | null> {
  const session = await auth.api.getSession({
    headers: await headers(),
  });
  if (!session?.user?.id) return null;

  if (process.env.CANTEEN_MOCK_DATA === "true") {
    return { id: session.user.id, banned: false };
  }

  const dbUser = await db.query.users.findFirst({
    where: eq(users.id, session.user.id),
    columns: { id: true, banned: true },
  });
  if (!dbUser) return null;
  return { id: dbUser.id, banned: dbUser.banned };
}

/** Logged-in user eligible to write dish comments (not banned). */
export async function requireCommentAuth(): Promise<{
  id: string;
  nickname: string;
}> {
  const session = await auth.api.getSession({
    headers: await headers(),
  });
  if (!session?.user?.id) redirect("/login");

  // Mock demo: session-only auth + nickname from session fields (no DB users
  // lookup), aligned with getSessionVoterUser mock behaviour.
  if (process.env.CANTEEN_MOCK_DATA === "true") {
    const nickname =
      session.user.name?.trim() ||
      session.user.email?.split("@")[0] ||
      "用户";
    return { id: session.user.id, nickname };
  }

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

  return { id: dbUser.id, nickname: dbUser.nickname };
}

/** Logged-in voter eligible to write (not banned). Anonymous callers get null. */
export async function getVoteEligibleUser(): Promise<{ id: string } | null> {
  const user = await getSessionVoterUser();
  if (!user || user.banned) return null;
  return { id: user.id };
}

/** Session present but user is banned — block even anonymous fallback voting. */
export async function isBannedSessionUser(): Promise<boolean> {
  const user = await getSessionVoterUser();
  return user?.banned ?? false;
}

/** For API routes: returns null when caller is not an admin (no redirect). */
export async function getAdminUserForApi() {
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
