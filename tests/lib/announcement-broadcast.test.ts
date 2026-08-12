import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";

const mocks = vi.hoisted(() => {
  const dueRows = Array.from({ length: 10 }, (_, index) => ({
    id: `00000000-0000-4000-a000-${String(index + 1).padStart(12, "0")}`,
  }));
  const whereClauses: unknown[] = [];
  const selectQuery: Record<string, unknown> = {};
  for (const method of ["from", "orderBy"]) {
    selectQuery[method] = vi.fn(() => selectQuery);
  }
  selectQuery.where = vi.fn((clause: unknown) => {
    whereClauses.push(clause);
    return selectQuery;
  });
  selectQuery.limit = vi.fn(async () => dueRows);

  const returning = vi.fn<() => Promise<unknown[]>>(async () => []);
  const where = vi.fn((clause: unknown) => {
    whereClauses.push(clause);
    return { returning };
  });
  const set = vi.fn(() => ({ where }));
  const update = vi.fn(() => ({ set }));
  const execute = vi.fn();
  const tx = { update, execute };

  return {
    dueRows,
    whereClauses,
    limit: selectQuery.limit as ReturnType<typeof vi.fn>,
    select: vi.fn(() => selectQuery),
    transaction: vi.fn(async (callback: (value: typeof tx) => unknown) =>
      callback(tx),
    ),
    returning,
    execute,
    tx,
  };
});

vi.mock("@/db", () => ({
  db: {
    select: () => mocks.select(),
    transaction: (callback: (value: unknown) => unknown) =>
      mocks.transaction(callback as never),
  },
}));

import {
  broadcastAnnouncementIfDue,
  broadcastDueAnnouncements,
} from "@/lib/announcement-broadcast";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.whereClauses.length = 0;
});

function queryText(clause: unknown): string {
  return new PgDialect().sqlToQuery(clause as never).sql;
}

describe("broadcastDueAnnouncements", () => {
  it("limits delayed broadcasts to users present at first publication", async () => {
    const publishedAt = new Date("2026-08-12T10:00:00Z");
    mocks.returning.mockResolvedValueOnce([
      {
        id: "00000000-0000-4000-a000-000000000001",
        title: "延迟公告",
        actorId: "00000000-0000-4000-a000-000000000002",
        publishedAt,
      },
    ]);

    await broadcastAnnouncementIfDue(
      mocks.tx as never,
      "00000000-0000-4000-a000-000000000001",
      new Date("2026-08-12T11:00:00Z"),
    );

    const insertQuery = new PgDialect().sqlToQuery(
      mocks.execute.mock.calls[0]?.[0] as never,
    );
    expect(insertQuery.sql).toContain('"users"."created_at" <=');
    expect(insertQuery.params).toContain(publishedAt);
  });

  it("limits and serializes each cron batch", async () => {
    await expect(broadcastDueAnnouncements()).resolves.toBe(0);

    expect(mocks.limit).toHaveBeenCalledWith(10);
    expect(mocks.transaction).toHaveBeenCalledTimes(10);
    for (
      let index = 1;
      index < mocks.transaction.mock.invocationCallOrder.length;
      index += 1
    ) {
      expect(mocks.transaction.mock.invocationCallOrder[index]).toBeGreaterThan(
        mocks.transaction.mock.invocationCallOrder[index - 1],
      );
    }
    expect(mocks.whereClauses).toHaveLength(11);
    for (const clause of mocks.whereClauses) {
      const sql = queryText(clause);
      expect(sql).toContain('"announcements"."expires_at" is null');
      expect(sql).toContain('"announcements"."expires_at" >');
    }
  });
});
