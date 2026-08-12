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

  const returning = vi.fn(async () => []);
  const where = vi.fn((clause: unknown) => {
    whereClauses.push(clause);
    return { returning };
  });
  const set = vi.fn(() => ({ where }));
  const update = vi.fn(() => ({ set }));
  const tx = { update, execute: vi.fn() };

  return {
    dueRows,
    whereClauses,
    limit: selectQuery.limit as ReturnType<typeof vi.fn>,
    select: vi.fn(() => selectQuery),
    transaction: vi.fn(async (callback: (value: typeof tx) => unknown) =>
      callback(tx),
    ),
    returning,
  };
});

vi.mock("@/db", () => ({
  db: {
    select: () => mocks.select(),
    transaction: (callback: (value: unknown) => unknown) =>
      mocks.transaction(callback as never),
  },
}));

import { broadcastDueAnnouncements } from "@/lib/announcement-broadcast";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.whereClauses.length = 0;
});

function queryText(clause: unknown): string {
  return new PgDialect().sqlToQuery(clause as never).sql;
}

describe("broadcastDueAnnouncements", () => {
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
