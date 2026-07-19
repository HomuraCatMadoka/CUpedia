import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";

const { queue, chain, transaction, requireAdmin, revalidatePath } = vi.hoisted(
  () => {
    const rows: unknown[] = [];
    const query: Record<string, unknown> = {};
    for (const method of ["from", "where", "values", "set", "returning"]) {
      query[method] = vi.fn(() => query);
    }
    query.then = (resolve: (value: unknown) => unknown) =>
      Promise.resolve(rows.length ? rows.shift() : []).then(resolve);
    return {
      queue: rows,
      chain: query,
      transaction: vi.fn(),
      requireAdmin: vi.fn(),
      revalidatePath: vi.fn(),
    };
  },
);

vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("@/lib/auth-guard", () => ({
  requireAdmin: (...args: unknown[]) => requireAdmin(...args),
}));
vi.mock("@/db", () => ({
  db: {
    select: () => chain,
    transaction: (callback: (tx: unknown) => unknown) => transaction(callback),
  },
}));

import {
  previewPersonTitleCatalog,
  publishPersonTitleCatalog,
} from "@/lib/person-title-catalog-actions";

const tx = {
  execute: vi.fn(),
  select: () => chain,
  update: () => chain,
  insert: () => chain,
};

const rawCatalog = JSON.stringify({
  version: 1,
  sourceLabel: "approved single-programme titles",
  recipes: [
    {
      recipeKey: "socrates",
      kind: "same_profession_gold",
      displayName: "苏格拉底",
      badgeCode: "SOCR",
      sourceRuleKeys: ["phil-gold"],
    },
  ],
});

beforeEach(() => {
  vi.clearAllMocks();
  queue.length = 0;
  requireAdmin.mockResolvedValue({ id: "admin" });
  transaction.mockImplementation(async (callback) => callback(tx));
});

describe("person-title catalog administration", () => {
  it("previews against active professional source rules", async () => {
    queue.push(
      [],
      [],
      [{ ruleKey: "phil-gold", tier: "gold", category: "professional" }],
    );

    await expect(previewPersonTitleCatalog(rawCatalog)).resolves.toMatchObject({
      version: 1,
      recipeCount: 1,
      sourceCount: 1,
      enabledCount: 1,
    });
    expect(transaction).not.toHaveBeenCalled();
  });

  it("rejects missing or wrong-tier source rules", async () => {
    queue.push([], [], []);

    await expect(previewPersonTitleCatalog(rawCatalog)).rejects.toThrow(
      /不是已启用的金标来源/,
    );
  });

  it("publishes all target rules and recipes atomically", async () => {
    queue.push(
      [],
      [],
      [{ ruleKey: "phil-gold", tier: "gold", category: "professional" }],
      [],
      [],
      [{ id: "target-1", ruleKey: "person-socrates" }],
      [],
    );

    await expect(publishPersonTitleCatalog(rawCatalog)).resolves.toEqual({
      version: 1,
      recipeCount: 1,
    });

    const values = chain.values as Mock;
    expect(values).toHaveBeenCalledWith([
      expect.objectContaining({
        ruleKey: "person-socrates",
        displayName: "苏格拉底",
        enabled: true,
      }),
    ]);
    expect(values).toHaveBeenLastCalledWith([
      expect.objectContaining({
        recipeKey: "socrates",
        targetRuleId: "target-1",
        sourceRuleKeys: ["phil-gold"],
      }),
    ]);
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(revalidatePath).toHaveBeenCalledWith("/courses/achievements");
  });

  it("rejects a version that is not newer for an existing recipe", async () => {
    queue.push(
      [{ recipeKey: "socrates", version: 1 }],
      [],
      [{ ruleKey: "phil-gold", tier: "gold", category: "professional" }],
    );

    await expect(previewPersonTitleCatalog(rawCatalog)).rejects.toThrow(
      /已有 v1 或更高版本/,
    );
  });
});
