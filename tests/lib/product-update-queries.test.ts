import { PgDialect } from "drizzle-orm/pg-core";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  whereClauses: [] as unknown[],
  orderByClauses: [] as unknown[],
  select: vi.fn(),
}));

vi.mock("@/db", () => ({
  db: {
    select: mocks.select,
  },
}));

import {
  getPublicProductUpdate,
  listPublicProductUpdates,
} from "@/lib/product-update-queries";

function queryText(clause: unknown): string {
  return new PgDialect().sqlToQuery(clause as never).sql;
}

function createSelectChain() {
  const chain = {
    from: vi.fn(),
    where: vi.fn(),
    orderBy: vi.fn(),
    limit: vi.fn(),
    then: (resolve: (value: unknown[]) => unknown) => resolve([]),
  };
  chain.from.mockReturnValue(chain);
  chain.where.mockImplementation((clause: unknown) => {
    mocks.whereClauses.push(clause);
    return chain;
  });
  chain.orderBy.mockImplementation((...clauses: unknown[]) => {
    mocks.orderByClauses.push(...clauses);
    return chain;
  });
  chain.limit.mockResolvedValue([]);
  return chain;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.whereClauses.length = 0;
  mocks.orderByClauses.length = 0;
  mocks.select.mockImplementation(() => createSelectChain());
});

describe("public product update queries", () => {
  it("lists only published updates in reverse publication order", async () => {
    await listPublicProductUpdates();

    expect(queryText(mocks.whereClauses[0])).toContain(
      '"product_updates"."published_at" <=',
    );
    expect(mocks.orderByClauses.map(queryText)).toEqual([
      '"product_updates"."published_at" desc',
      '"product_updates"."id" desc',
    ]);
  });

  it("filters direct detail access by publication time", async () => {
    await getPublicProductUpdate("00000000-0000-4000-a100-000000000001");

    const clause = queryText(mocks.whereClauses[0]);
    expect(clause).toContain('"product_updates"."id" =');
    expect(clause).toContain('"product_updates"."published_at" <=');
  });

  it("short-circuits invalid permanent IDs before querying", async () => {
    await expect(getPublicProductUpdate("not-a-uuid")).resolves.toBeNull();
    expect(mocks.select).not.toHaveBeenCalled();
  });
});
