import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";

const mocks = vi.hoisted(() => {
  const whereClauses: unknown[] = [];
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
    whereClauses,
    returning,
    execute,
    tx,
  };
});

vi.mock("@/db", () => ({
  db: {},
}));

import { broadcastAnnouncementIfDue } from "@/lib/announcement-broadcast";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.whereClauses.length = 0;
});

describe("broadcastAnnouncementIfDue", () => {
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
});
