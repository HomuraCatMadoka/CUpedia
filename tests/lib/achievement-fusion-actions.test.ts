import { beforeEach, describe, expect, it, vi } from "vitest";

const { queue, chain, transaction, requireAdmin, requireAuth, revalidatePath } =
  vi.hoisted(() => {
    const rows: unknown[] = [];
    const query: Record<string, unknown> = {};
    for (const method of [
      "from",
      "where",
      "limit",
      "orderBy",
      "innerJoin",
      "values",
      "set",
      "returning",
    ]) {
      query[method] = vi.fn(() => query);
    }
    query.then = (resolve: (value: unknown) => unknown) =>
      Promise.resolve(rows.length ? rows.shift() : []).then(resolve);
    return {
      queue: rows,
      chain: query,
      transaction: vi.fn(),
      requireAdmin: vi.fn(),
      requireAuth: vi.fn(),
      revalidatePath: vi.fn(),
    };
  });

vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("@/lib/auth-guard", () => ({
  requireAdmin: (...args: unknown[]) => requireAdmin(...args),
  requireAuth: (...args: unknown[]) => requireAuth(...args),
}));
vi.mock("@/lib/achievement-profile", () => ({
  ensureAchievementProfile: vi.fn(),
}));
vi.mock("@/db", () => ({
  db: {
    select: () => chain,
    transaction: (callback: (tx: unknown) => unknown) => transaction(callback),
  },
}));

import {
  createPersonTitleRecipe,
  dismantlePersonTitle,
  fusePersonTitle,
} from "@/lib/achievement-fusion-actions";

const tx = {
  select: () => chain,
  insert: () => chain,
  update: () => chain,
  delete: () => chain,
  execute: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
  queue.length = 0;
  requireAdmin.mockResolvedValue({ id: "admin" });
  requireAuth.mockResolvedValue({ id: "user" });
  transaction.mockImplementation(async (callback) => callback(tx));
});

describe("person-title recipes", () => {
  it("stores a versioned dual-bronze recipe and generic person target", async () => {
    queue.push(
      [
        { ruleKey: "math-bronze", tier: "bronze" },
        { ruleKey: "phys-bronze", tier: "bronze" },
      ],
      [],
      [],
      [{ id: "target-rule" }],
      [{ id: "recipe" }],
    );

    await createPersonTitleRecipe({
      recipeKey: "newton",
      version: 1,
      kind: "dual_bronze",
      displayName: "牛顿",
      badgeCode: "NEWT",
      sourceRuleKeys: ["math-bronze", "phys-bronze"],
      enabled: true,
    });

    expect(chain.values).toHaveBeenCalledWith(
      expect.objectContaining({
        category: "person",
        tier: "gold",
        displayName: "牛顿",
      }),
    );
    expect(chain.values).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "dual_bronze",
        sourceRuleKeys: ["math-bronze", "phys-bronze"],
      }),
    );
  });

  it("rejects duplicate bronze sources before writing", async () => {
    await expect(
      createPersonTitleRecipe({
        recipeKey: "newton",
        version: 1,
        kind: "dual_bronze",
        displayName: "牛顿",
        badgeCode: "NEWT",
        sourceRuleKeys: ["math-bronze", "math-bronze"],
      }),
    ).rejects.toThrow(/两个不同来源/);
    expect(transaction).not.toHaveBeenCalled();
  });

  it("stores a same-profession conversion only for an enabled gold source", async () => {
    queue.push(
      [{ ruleKey: "math-gold", tier: "gold" }],
      [{ id: "target-rule" }],
      [{ id: "recipe" }],
    );

    await createPersonTitleRecipe({
      recipeKey: "gauss",
      version: 1,
      kind: "same_profession_gold",
      displayName: "高斯",
      badgeCode: "GAUS",
      sourceRuleKeys: ["math-gold"],
    });

    expect(chain.values).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "same_profession_gold",
        sourceRuleKeys: ["math-gold"],
      }),
    );
  });
});

describe("person-title fusion lifecycle", () => {
  const recipeId = "00000000-0000-4000-a000-000000000371";

  it("atomically consumes two sources and records reversible ownership", async () => {
    queue.push(
      [
        {
          id: recipeId,
          kind: "dual_bronze",
          sourceRuleKeys: ["math-bronze", "phys-bronze"],
          targetRuleId: "target-rule",
          targetRuleKey: "person-newton",
        },
      ],
      [
        { id: "math", ruleKey: "math-bronze" },
        { id: "phys", ruleKey: "phys-bronze" },
      ],
      [],
      [],
      [],
      [{ id: "newton" }],
      [],
      [],
      [],
      [],
    );

    await fusePersonTitle(recipeId, true);

    expect(chain.values).toHaveBeenCalledWith([
      { fusionAchievementId: "newton", sourceAchievementId: "math" },
      { fusionAchievementId: "newton", sourceAchievementId: "phys" },
    ]);
    expect(chain.set).toHaveBeenCalledWith({ status: "superseded" });
    expect(chain.set).toHaveBeenCalledWith(
      expect.objectContaining({ primaryAchievementId: "newton" }),
    );
  });

  it("rejects fusion when another gold slot is active", async () => {
    queue.push(
      [
        {
          id: recipeId,
          kind: "dual_bronze",
          sourceRuleKeys: ["math-bronze", "phys-bronze"],
          targetRuleId: "target-rule",
          targetRuleKey: "person-newton",
        },
      ],
      [
        { id: "math", ruleKey: "math-bronze" },
        { id: "phys", ruleKey: "phys-bronze" },
      ],
      [{ id: "other-gold" }],
    );

    await expect(fusePersonTitle(recipeId, false)).rejects.toThrow(/金标/);
  });

  it("rejects duplicate versions of one source instead of consuming them twice", async () => {
    queue.push(
      [
        {
          id: recipeId,
          kind: "dual_bronze",
          sourceRuleKeys: ["math-bronze", "phys-bronze"],
          targetRuleId: "target-rule",
          targetRuleKey: "person-newton",
        },
      ],
      [
        { id: "math-v1", ruleKey: "math-bronze" },
        { id: "math-v2", ruleKey: "math-bronze" },
      ],
    );

    await expect(fusePersonTitle(recipeId, false)).rejects.toThrow(
      /来源称号已变化/,
    );
  });

  it("dismantles atomically and restores all sources", async () => {
    const achievementId = "00000000-0000-4000-a000-000000000372";
    queue.push(
      [{ id: achievementId }],
      [{ id: "math" }, { id: "phys" }],
      [],
      [],
      [],
      [],
    );

    await dismantlePersonTitle(achievementId);

    expect(chain.set).toHaveBeenCalledWith(
      expect.objectContaining({ status: "revoked" }),
    );
    expect(chain.set).toHaveBeenCalledWith(
      expect.objectContaining({ status: "active" }),
    );
    expect(chain.set).toHaveBeenCalledWith(
      expect.objectContaining({ primaryAchievementId: "math" }),
    );
  });
});
