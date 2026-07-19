import { beforeEach, describe, expect, it, vi } from "vitest";

const { queue, chain, execute, insert, update, remove } = vi.hoisted(() => {
  const rows: unknown[] = [];
  const query: Record<string, unknown> = {};
  for (const method of ["from", "where", "innerJoin", "set", "values"]) {
    query[method] = vi.fn(() => query);
  }
  query.then = (resolve: (value: unknown) => unknown) =>
    Promise.resolve(rows.length ? rows.shift() : []).then(resolve);
  return {
    queue: rows,
    chain: query,
    execute: vi.fn(),
    insert: vi.fn(() => query),
    update: vi.fn(() => query),
    remove: vi.fn(() => query),
  };
});

vi.mock("@/db", () => ({ db: { transaction: vi.fn() } }));

import {
  rebindFallbackAchievementEvidenceAfterRatingChange,
  recomputeAchievementsBeforeRatingDeletion,
} from "@/lib/achievement-recompute-db";

const tx = {
  select: () => chain,
  insert,
  update,
  delete: remove,
  execute,
};

const mathAchievement = {
  id: "math",
  tier: "bronze",
  status: "superseded",
  ruleKey: "math-bronze",
  prerequisiteRuleKey: null,
  subjectCodes: ["MATH"],
  subjectGroups: [{ subjectCodes: ["MATH"], requiredCount: 4 }],
  requiredCount: 4,
};
const physicsAchievement = {
  id: "phys",
  tier: "bronze",
  status: "superseded",
  ruleKey: "phys-bronze",
  prerequisiteRuleKey: null,
  subjectCodes: ["PHYS"],
  subjectGroups: [{ subjectCodes: ["PHYS"], requiredCount: 4 }],
  requiredCount: 4,
};
const personAchievement = {
  id: "newton",
  tier: "gold",
  status: "active",
  ruleKey: "person-newton",
  prerequisiteRuleKey: null,
  subjectCodes: [],
  subjectGroups: [],
  requiredCount: 1,
};
const evidence = [
  ...[1, 2, 3, 4].map((number) => ({
    achievementId: "math",
    ratingId: `m${number}`,
  })),
  ...[1, 2, 3, 4].map((number) => ({
    achievementId: "phys",
    ratingId: `p${number}`,
  })),
];
const ratings = [
  ...[1, 2, 3, 4].map((number) => ({
    id: `m${number}`,
    courseCode: `MATH${number}000`,
    subject: "MATH",
  })),
  ...[1, 2, 3, 4].map((number) => ({
    id: `p${number}`,
    courseCode: `PHYS${number}000`,
    subject: "PHYS",
  })),
];
const links = [
  { fusionAchievementId: "newton", sourceAchievementId: "math" },
  { fusionAchievementId: "newton", sourceAchievementId: "phys" },
];

beforeEach(() => {
  vi.clearAllMocks();
  queue.length = 0;
});

describe("fusion recovery after rating deletion", () => {
  it("previews dismantling without mutating persisted state", async () => {
    queue.push(
      [mathAchievement, physicsAchievement, personAchievement],
      evidence,
      ratings,
      links,
    );

    await expect(
      recomputeAchievementsBeforeRatingDeletion(
        tx as never,
        "user",
        "m1",
        false,
      ),
    ).resolves.toEqual({ kind: "dismantled", nextTier: null });
    expect(execute).toHaveBeenCalledOnce();
    expect(update).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
  });

  it("dismantles the person title, restores the valid source, and moves primary", async () => {
    queue.push(
      [mathAchievement, physicsAchievement, personAchievement],
      evidence,
      ratings,
      links,
      [],
      [],
      [],
      [],
      [],
      [],
    );

    await expect(
      recomputeAchievementsBeforeRatingDeletion(
        tx as never,
        "user",
        "m1",
        true,
      ),
    ).resolves.toEqual({ kind: "dismantled", nextTier: null });
    expect(chain.set).toHaveBeenCalledWith(
      expect.objectContaining({ status: "revoked" }),
    );
    expect(chain.set).toHaveBeenCalledWith(
      expect.objectContaining({ status: "active" }),
    );
    expect(chain.set).toHaveBeenCalledWith(
      expect.objectContaining({ primaryAchievementId: "phys" }),
    );
    expect(remove).toHaveBeenCalledTimes(2);
  });

  it("rewrites source evidence and keeps the fusion when an alternative exists", async () => {
    const ratingsWithAlternative = [
      ...ratings,
      { id: "m5", courseCode: "MATH5000", subject: "MATH" },
    ];
    queue.push(
      [mathAchievement, physicsAchievement, personAchievement],
      evidence,
      ratingsWithAlternative,
      links,
      [],
      [],
    );

    await expect(
      recomputeAchievementsBeforeRatingDeletion(
        tx as never,
        "user",
        "m1",
        true,
      ),
    ).resolves.toEqual({ kind: "preserved", nextTier: "bronze" });
    expect(chain.values).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ achievementId: "math", ratingId: "m5" }),
      ]),
    );
    expect(update).not.toHaveBeenCalled();
    expect(remove).toHaveBeenCalledOnce();
  });
});

describe("ESTR fallback evidence rebinding", () => {
  const engineeringAchievement = {
    id: "engineering",
    tier: "bronze",
    status: "active",
    ruleKey: "csci-bronze",
    prerequisiteRuleKey: null,
    subjectCodes: ["CSCI", "ENGG", "ESTR"],
    subjectGroups: [
      { subjectCodes: ["CSCI", "ENGG", "ESTR"], requiredCount: 4 },
    ],
    requiredCount: 4,
  };
  const engineeringRatings = [
    { id: "c1", courseCode: "CSCI1000", subject: "CSCI" },
    { id: "c2", courseCode: "CSCI2000", subject: "CSCI" },
    { id: "e1", courseCode: "ENGG1000", subject: "ENGG" },
    { id: "e2", courseCode: "ENGG2000", subject: "ENGG" },
    { id: "s1", courseCode: "ESTR1000", subject: "ESTR" },
  ];

  it("releases ESTR when a regular engineering rating becomes available", async () => {
    queue.push(
      [engineeringAchievement],
      [
        { achievementId: "engineering", ratingId: "c1" },
        { achievementId: "engineering", ratingId: "c2" },
        { achievementId: "engineering", ratingId: "e1" },
        { achievementId: "engineering", ratingId: "s1" },
      ],
      engineeringRatings,
      [],
      [],
    );

    await expect(
      rebindFallbackAchievementEvidenceAfterRatingChange(tx as never, "user"),
    ).resolves.toBe(1);
    expect(chain.values).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ ratingId: "e2" })]),
    );
    const insertedRows = (chain.values as ReturnType<typeof vi.fn>).mock
      .calls[0][0] as Array<{ ratingId: string }>;
    expect(insertedRows.map((row) => row.ratingId)).not.toContain("s1");
  });

  it("does not rewrite evidence when the chain is not using ESTR", async () => {
    queue.push(
      [engineeringAchievement],
      [
        { achievementId: "engineering", ratingId: "c1" },
        { achievementId: "engineering", ratingId: "c2" },
        { achievementId: "engineering", ratingId: "e1" },
        { achievementId: "engineering", ratingId: "e2" },
      ],
      engineeringRatings,
    );

    await expect(
      rebindFallbackAchievementEvidenceAfterRatingChange(tx as never, "user"),
    ).resolves.toBe(0);
    expect(remove).not.toHaveBeenCalled();
    expect(insert).not.toHaveBeenCalled();
  });
});
