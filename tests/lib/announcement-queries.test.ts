import { PgDialect } from "drizzle-orm/pg-core";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  whereClauses: [] as unknown[],
}));

vi.mock("@/db", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: (clause: unknown) => {
          mocks.whereClauses.push(clause);
          return {
            orderBy: () => ({
              limit: () => ({ offset: async () => [] }),
            }),
            limit: async () => [],
            then: (resolve: (value: unknown[]) => unknown) => resolve([]),
          };
        },
      }),
    }),
  },
}));

import {
  getPublicAnnouncement,
  listPublicAnnouncements,
} from "@/lib/announcement-queries";

function queryText(clause: unknown): string {
  return new PgDialect().sqlToQuery(clause as never).sql;
}

beforeEach(() => {
  mocks.whereClauses.length = 0;
});

describe("public announcement visibility", () => {
  it("excludes withdrawn announcements from the archive", async () => {
    await listPublicAnnouncements();

    expect(mocks.whereClauses.map(queryText).join(" ")).toContain(
      '"announcements"."withdrawn_at" is null',
    );
  });

  it("excludes withdrawn announcements from direct detail access", async () => {
    await getPublicAnnouncement("00000000-0000-4000-a100-000000000001");

    expect(queryText(mocks.whereClauses.at(-1))).toContain(
      '"announcements"."withdrawn_at" is null',
    );
  });
});
