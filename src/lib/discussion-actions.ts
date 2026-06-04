"use server";

import { db } from "@/db";
import { discussions, users } from "@/db/schema";
import { eq, and, isNull, asc } from "drizzle-orm";
import { requireAuth } from "@/lib/auth-guard";

export type Discussion = {
  id: string;
  commentMarkId: string;
  content: string;
  resolved: boolean;
  parentId: string | null;
  createdAt: Date;
  user: { id: string; nickname: string };
  replies: Discussion[];
};

export async function getDiscussions(pageId: string): Promise<Discussion[]> {
  const rows = await db
    .select({
      id: discussions.id,
      commentMarkId: discussions.commentMarkId,
      content: discussions.content,
      resolved: discussions.resolved,
      parentId: discussions.parentId,
      createdAt: discussions.createdAt,
      userId: discussions.userId,
      nickname: users.nickname,
    })
    .from(discussions)
    .innerJoin(users, eq(discussions.userId, users.id))
    .where(eq(discussions.pageId, pageId))
    .orderBy(asc(discussions.createdAt))
    // Auxiliary read path — degrade to empty rather than failing the page.
    .catch((error: unknown) => {
      console.error("getDiscussions: query failed", error);
      return [];
    });

  const map = new Map<string, Discussion>();
  const roots: Discussion[] = [];

  for (const row of rows) {
    const d: Discussion = {
      id: row.id,
      commentMarkId: row.commentMarkId,
      content: row.content,
      resolved: row.resolved,
      parentId: row.parentId,
      createdAt: row.createdAt,
      user: { id: row.userId, nickname: row.nickname },
      replies: [],
    };
    map.set(d.id, d);
    if (!d.parentId) {
      roots.push(d);
    }
  }

  for (const d of map.values()) {
    if (d.parentId) {
      map.get(d.parentId)?.replies.push(d);
    }
  }

  return roots;
}

export async function createDiscussion(
  pageId: string,
  commentMarkId: string,
  content: string,
) {
  const user = await requireAuth();
  const trimmed = content.trim();
  if (!trimmed) throw new Error("Content cannot be empty");

  const [row] = await db
    .insert(discussions)
    .values({
      pageId,
      commentMarkId,
      userId: user.id,
      content: trimmed,
    })
    .returning({ id: discussions.id });

  return row.id;
}

export async function addReply(discussionId: string, content: string) {
  const user = await requireAuth();
  const trimmed = content.trim();
  if (!trimmed) throw new Error("Content cannot be empty");

  const parent = await db.query.discussions.findFirst({
    where: and(eq(discussions.id, discussionId), isNull(discussions.parentId)),
    columns: { id: true, pageId: true, commentMarkId: true },
  });
  if (!parent) throw new Error("Discussion not found");

  const [row] = await db
    .insert(discussions)
    .values({
      pageId: parent.pageId,
      commentMarkId: parent.commentMarkId,
      userId: user.id,
      content: trimmed,
      parentId: parent.id,
    })
    .returning({ id: discussions.id });

  return row.id;
}

export async function resolveDiscussion(discussionId: string) {
  const user = await requireAuth();

  const discussion = await db.query.discussions.findFirst({
    where: and(eq(discussions.id, discussionId), isNull(discussions.parentId)),
    columns: { id: true, userId: true },
  });
  if (!discussion) throw new Error("Discussion not found");

  if (discussion.userId !== user.id && user.role !== "admin") {
    throw new Error("Permission denied");
  }

  await db
    .update(discussions)
    .set({ resolved: true, updatedAt: new Date() })
    .where(eq(discussions.id, discussionId));
}

export async function deleteDiscussion(discussionId: string) {
  const user = await requireAuth();

  const discussion = await db.query.discussions.findFirst({
    where: eq(discussions.id, discussionId),
    columns: { id: true, userId: true },
  });
  if (!discussion) throw new Error("Discussion not found");

  if (discussion.userId !== user.id && user.role !== "admin") {
    throw new Error("Permission denied");
  }

  await db.delete(discussions).where(eq(discussions.id, discussionId));
}
