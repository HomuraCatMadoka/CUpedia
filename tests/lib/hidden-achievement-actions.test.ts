import { beforeEach, describe, expect, it, vi } from "vitest";

const { queue, chain } = vi.hoisted(() => {
  const rows: unknown[] = [];
  const query: Record<string, unknown> = {};
  for (const method of ["from", "innerJoin", "where", "limit"]) {
    query[method] = vi.fn(() => query);
  }
  query.then = (resolve: (value: unknown) => unknown) =>
    Promise.resolve(rows.length ? rows.shift() : []).then(resolve);
  return { queue: rows, chain: query };
});

vi.mock("@/db", () => ({
  db: {
    select: () => chain,
  },
}));
vi.mock("@/lib/auth-guard", () => ({ requireAuth: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("server-only", () => ({}));

import { getHiddenAchievementGroupsForUser } from "@/lib/hidden-achievement";

beforeEach(() => {
  vi.clearAllMocks();
  queue.length = 0;
});

describe("hidden achievement groups", () => {
  it("shows only owned gold prerequisites and groups person-name options", async () => {
    queue.push(
      [
        {
          recipeId: "ramanujan",
          sourceRuleKeys: ["math-gold"],
          displayName: "拉马努金",
        },
        {
          recipeId: "yau",
          sourceRuleKeys: ["math-gold"],
          displayName: "丘成桐",
        },
        {
          recipeId: "turing",
          sourceRuleKeys: ["csci-gold"],
          displayName: "图灵",
        },
      ],
      [{ ruleKey: "math-gold", badgeCode: "MATH" }],
      [],
    );

    await expect(getHiddenAchievementGroupsForUser("user-1")).resolves.toEqual([
      {
        sourceRuleKey: "math-gold",
        badgeCode: "MATH",
        displayName: "MATH 传说",
        claimable: true,
        equipped: false,
        selectedRecipeId: null,
        options: [
          { recipeId: "ramanujan", displayName: "拉马努金" },
          { recipeId: "yau", displayName: "丘成桐" },
        ],
      },
    ]);
  });

  it("marks an already selected title as equipped without a claim dot", async () => {
    queue.push(
      [
        {
          recipeId: "ramanujan",
          sourceRuleKeys: ["math-gold"],
          displayName: "拉马努金",
        },
      ],
      [{ ruleKey: "math-gold", badgeCode: "MATH" }],
      [
        {
          sourceRuleKey: "math-gold",
          selectedRecipeId: "ramanujan",
          equipped: true,
        },
      ],
    );

    const [group] = await getHiddenAchievementGroupsForUser("user-1");
    expect(group).toMatchObject({
      claimable: false,
      equipped: true,
      selectedRecipeId: "ramanujan",
    });
  });
});
