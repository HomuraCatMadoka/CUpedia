"use server";

import { db } from "@/db";
import { users } from "@/db/schema";
import { sql } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth-guard";
import { escapeLikePattern } from "@/lib/utils";
import { revalidatePath } from "next/cache";
import {
  getWikiEditRoleFresh,
  setWikiEditRole as _setWikiEditRole,
} from "@/lib/site-settings";

export async function getUsers({
  page = 1,
  pageSize = 50,
  q,
}: {
  page?: number;
  pageSize?: number;
  q?: string;
}) {
  await requireAdmin();

  pageSize = Math.min(Math.max(pageSize, 1), 100);
  page = Math.max(page, 1);
  const offset = (page - 1) * pageSize;

  let whereClause = sql`1=1`;
  if (q) {
    const trimmed = q.trim().slice(0, 100);
    if (trimmed) {
      const pattern = `%${escapeLikePattern(trimmed)}%`;
      whereClause = sql`(${users.email} ILIKE ${pattern} ESCAPE '\\' OR ${users.nickname} ILIKE ${pattern} ESCAPE '\\')`;
    }
  }

  const countResult = await db.execute(
    sql`SELECT count(*)::int as count FROM ${users} WHERE ${whereClause}`,
  );
  const total =
    (countResult.rows?.[0] as Record<string, number> | undefined)?.count ?? 0;

  const result = await db.execute(
    sql`SELECT id, email, nickname, role, banned, created_at, updated_at
        FROM ${users}
        WHERE ${whereClause}
        ORDER BY created_at DESC
        LIMIT ${pageSize} OFFSET ${offset}`,
  );
  const rows = result.rows ?? result;

  return { users: rows, total, page, pageSize };
}

export async function setUserBanned(
  userId: string,
  banned: boolean,
  expectedUpdatedAt?: string,
) {
  const admin = await requireAdmin();

  if (admin.id === userId) {
    throw new Error("SELF_BAN");
  }

  return db.transaction(async (tx) => {
    const result = await tx.execute(
      sql`SELECT id, role, banned, updated_at FROM ${users} WHERE id = ${userId} FOR UPDATE`,
    );
    const rows = (result.rows ?? result) as {
      id: string;
      role: string;
      banned: boolean;
      updated_at: string | Date;
    }[];

    if (!rows || rows.length === 0) {
      throw new Error("USER_NOT_FOUND");
    }

    const target = rows[0];

    if (
      expectedUpdatedAt &&
      new Date(target.updated_at).toISOString() !== expectedUpdatedAt
    ) {
      throw new Error("STALE_USER_ROW");
    }

    if (banned && target.role === "admin" && !target.banned) {
      const acResult = await tx.execute(
        sql`SELECT count(*)::int as count FROM ${users} WHERE role = 'admin' AND banned = false`,
      );
      const acRows = (acResult.rows ?? acResult) as Record<string, number>[];
      if (acRows[0]?.count <= 1) {
        throw new Error("LAST_ADMIN");
      }
    }

    const now = new Date();
    await tx.execute(
      sql`UPDATE ${users} SET banned = ${banned}, updated_at = ${now} WHERE id = ${userId}`,
    );

    revalidatePath("/admin/users");
  });
}

export async function getWikiEditRoleSetting() {
  await requireAdmin();
  return getWikiEditRoleFresh();
}

export async function updateWikiEditRole(role: "admin" | "user") {
  if (role !== "admin" && role !== "user") {
    throw new Error("INVALID_ROLE");
  }
  await requireAdmin();
  await _setWikiEditRole(role);
  revalidatePath("/admin/settings");
}
