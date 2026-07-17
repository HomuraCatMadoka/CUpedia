import { describe, expect, it } from "vitest";

import {
  ACHIEVEMENT_CATALOG_FACULTIES,
  parseAchievementCatalogJson,
  validateAchievementCatalog,
} from "@/lib/achievement-catalog";

const tier = (name: "bronze" | "silver" | "gold", count = 4) => ({
  tier: name,
  displayName: `${name} title`,
  subjectGroups: [{ subjectCodes: ["TEST"], requiredCount: count }],
});

const programme = (programmeKey: string, faculty = "arts") => ({
  programmeKey,
  badgeCode: "TEST",
  faculty,
  tiers: [tier("bronze"), tier("silver"), tier("gold")],
});

describe("achievement catalog validation", () => {
  it("represents 76 programmes across every faculty without course numbers", () => {
    const programmes = Array.from({ length: 76 }, (_, index) =>
      programme(
        `programme-${String(index + 1).padStart(2, "0")}`,
        ACHIEVEMENT_CATALOG_FACULTIES[
          index % ACHIEVEMENT_CATALOG_FACULTIES.length
        ],
      ),
    );

    const result = validateAchievementCatalog({
      version: 1,
      sourceLabel: "approved handbook review",
      programmes,
    });

    expect(result.programmeCount).toBe(76);
    expect(result.rules).toHaveLength(228);
    expect(Object.keys(result.facultyCounts).sort()).toEqual(
      [...ACHIEVEMENT_CATALOG_FACULTIES].sort(),
    );
    expect(result.rules[0]).not.toHaveProperty("courseCodes");
  });

  it("supports mixed and overlapping subject groups", () => {
    const result = validateAchievementCatalog({
      version: 2,
      sourceLabel: "business review",
      programmes: [
        {
          programmeKey: "mixed-business",
          badgeCode: "BUSB",
          faculty: "business",
          tiers: [
            {
              tier: "bronze",
              displayName: "商科铜标",
              subjectGroups: [
                { subjectCodes: ["ACCT", "FINA", "MGNT"], requiredCount: 1 },
                {
                  subjectCodes: ["ACCT", "FINA", "MGNT", "MKTG"],
                  requiredCount: 3,
                },
              ],
            },
          ],
        },
      ],
    });

    expect(result.rules[0]).toMatchObject({
      requiredCount: 4,
      subjectCodes: ["ACCT", "FINA", "MGNT", "MKTG"],
    });
  });

  it("allows an approved programme to start at silver with eight ratings", () => {
    const result = validateAchievementCatalog({
      version: 3,
      sourceLabel: "joint programme review",
      programmes: [
        {
          ...programme("joint-programme", "other"),
          tiers: [tier("silver", 8), tier("gold")],
        },
      ],
    });

    expect(result.rules[0]).toMatchObject({
      tier: "silver",
      requiredCount: 8,
      prerequisiteRuleKey: null,
    });
    expect(result.rules[1].prerequisiteRuleKey).toBe("joint-programme-silver");
  });

  it("rejects duplicate programme keys and invalid tier transitions", () => {
    expect(() =>
      validateAchievementCatalog({
        version: 1,
        sourceLabel: "duplicate",
        programmes: [programme("same-key"), programme("same-key")],
      }),
    ).toThrow(/重复/);

    expect(() =>
      validateAchievementCatalog({
        version: 1,
        sourceLabel: "skipped tier",
        programmes: [
          { ...programme("skip-tier"), tiers: [tier("bronze"), tier("gold")] },
        ],
      }),
    ).toThrow(/不能跳过/);
  });

  it("rejects malformed JSON and the wrong composition total", () => {
    expect(() => parseAchievementCatalogJson("{")).toThrow(/有效的 JSON/);
    expect(() =>
      validateAchievementCatalog({
        version: 1,
        sourceLabel: "wrong total",
        programmes: [
          { ...programme("wrong-total"), tiers: [tier("bronze", 3)] },
        ],
      }),
    ).toThrow(/须配置 4 门/);
  });
});
