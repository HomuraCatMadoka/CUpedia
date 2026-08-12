import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";

const { requireAuth, queue, select, update, chain } = vi.hoisted(() => {
  const rows: unknown[] = [];
  const query: Record<string, unknown> = {};
  for (const method of [
    "from",
    "leftJoin",
    "where",
    "orderBy",
    "limit",
    "offset",
    "set",
  ]) {
    query[method] = vi.fn(() => query);
  }
  query.then = (
    onFulfilled: (value: unknown) => unknown,
    onRejected?: (reason: unknown) => unknown,
  ) =>
    Promise.resolve(rows.length ? rows.shift() : []).then(
      onFulfilled,
      onRejected,
    );
  return {
    requireAuth: vi.fn(),
    queue: rows,
    select: vi.fn(() => query),
    update: vi.fn(() => query),
    chain: query,
  };
});

vi.mock("@/lib/auth-guard", () => ({
  requireAuth: (...args: unknown[]) => requireAuth(...args),
}));

vi.mock("@/db", () => ({
  db: {
    select: () => select(),
    update: () => update(),
  },
}));

import {
  getNotifications,
  getUnreadNotificationCount,
  markAllNotificationsRead,
  markNotificationRead,
} from "@/lib/notification-actions";

const where = () => chain.where as Mock;
const offset = () => chain.offset as Mock;
const set = () => chain.set as Mock;

function queryText(clause: unknown): string {
  return new PgDialect().sqlToQuery(clause as never).sql;
}

function sqlValues(value: unknown): unknown[] {
  if (Array.isArray(value)) return value.flatMap(sqlValues);
  if (!value || typeof value !== "object") return [value];
  const chunk = value as { queryChunks?: unknown[]; value?: unknown };
  if (chunk.queryChunks) return sqlValues(chunk.queryChunks);
  return Object.hasOwn(chunk, "value") ? sqlValues(chunk.value) : [];
}

beforeEach(() => {
  vi.clearAllMocks();
  queue.length = 0;
  requireAuth.mockResolvedValue({ id: "recipient", role: "user" });
});

describe("notification reads", () => {
  it("counts only the signed-in user's unread notifications", async () => {
    queue.push([{ value: 7 }]);

    await expect(getUnreadNotificationCount()).resolves.toBe(7);

    expect(sqlValues(where().mock.calls[0][0])).toContain("recipient");
    expect(queryText(where().mock.calls[0][0])).toContain(
      '"announcements"."withdrawn_at" is null',
    );
  });

  it("returns 10 newest notifications with current actor identity and no reply body", async () => {
    queue.push(
      Array.from({ length: 11 }, (_, index) => ({
        id: `notification-${index + 1}`,
        kind: "course_review_reply",
        metadata: {
          courseCode: "CSCI3150",
          reviewId: "review-1",
          replyId: `reply-${index + 1}`,
        },
        readAt: index === 0 ? null : new Date("2026-07-27T10:30:00Z"),
        createdAt: new Date(
          `2026-07-27T10:${String(29 - index).padStart(2, "0")}:00Z`,
        ),
        actorNickname: "Current Alice",
        actorAvatarUrl: "/current-avatar.png",
      })),
    );

    const result = await getNotifications(0);

    expect(result.hasMore).toBe(true);
    expect(result.notifications).toHaveLength(10);
    expect(result.notifications[0]).toEqual({
      id: "notification-1",
      kind: "course_review_reply",
      actorNickname: "Current Alice",
      actorAvatarUrl: "/current-avatar.png",
      courseCode: "CSCI3150",
      createdAt: "2026-07-27T10:29:00.000Z",
      href: "/courses/CSCI3150?review=review-1&reply=reply-1",
      read: false,
    });
    expect(result.notifications[0]).not.toHaveProperty("content");
    expect(result.notifications[0]).not.toHaveProperty("achievements");
    expect(offset()).toHaveBeenCalledWith(0);
  });

  it("maps announcement notifications to their announcement detail page", async () => {
    queue.push([
      {
        id: "notification-announcement",
        kind: "announcement_published",
        metadata: {
          announcementId: "announcement-1",
          title: "迎新资料已更新",
        },
        readAt: null,
        createdAt: new Date("2026-08-12T10:00:00Z"),
        actorNickname: "Admin",
        actorAvatarUrl: null,
      },
    ]);

    await expect(getNotifications()).resolves.toEqual({
      notifications: [
        {
          id: "notification-announcement",
          kind: "announcement_published",
          title: "迎新资料已更新",
          createdAt: "2026-08-12T10:00:00.000Z",
          href: "/announcements/announcement-1",
          read: false,
        },
      ],
      hasMore: false,
    });
    expect(queryText(where().mock.calls.at(-1)?.[0])).toContain(
      '"announcements"."withdrawn_at" is null',
    );
  });

  it("normalizes an invalid pagination offset to the first page", async () => {
    queue.push([]);

    await getNotifications(Number.NaN);

    expect(offset()).toHaveBeenCalledWith(0);
  });
});

describe("notification read state", () => {
  it("marks one notification read only within the signed-in user's inbox", async () => {
    queue.push([]);

    await markNotificationRead("notification-1");

    expect(set()).toHaveBeenCalledWith({ readAt: expect.any(Date) });
    expect(sqlValues(where().mock.calls[0][0])).toEqual(
      expect.arrayContaining(["notification-1", "recipient"]),
    );
  });

  it("marks every unread notification for the signed-in user, including unloaded rows", async () => {
    queue.push([]);

    await markAllNotificationsRead();

    expect(set()).toHaveBeenCalledWith({ readAt: expect.any(Date) });
    expect(sqlValues(where().mock.calls[0][0])).toContain("recipient");
  });
});
