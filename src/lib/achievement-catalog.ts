export const ACHIEVEMENT_CATALOG_FACULTIES = [
  "arts",
  "business",
  "education",
  "engineering",
  "law",
  "medicine",
  "science",
  "social-science",
  "other",
] as const;

export type AchievementCatalogFaculty =
  (typeof ACHIEVEMENT_CATALOG_FACULTIES)[number];
export type AchievementTier = "bronze" | "silver" | "gold";

type SubjectGroup = { subjectCodes: string[]; requiredCount: number };

export type NormalizedCatalogRule = {
  programmeKey: string;
  ruleKey: string;
  version: number;
  tier: AchievementTier;
  displayName: string;
  description: string;
  badgeCode: string;
  subjectCodes: string[];
  subjectGroups: SubjectGroup[];
  requiredCount: number;
  prerequisiteRuleKey: string | null;
  catalogEnabled: boolean;
};

export type NormalizedAchievementCatalog = {
  version: number;
  sourceLabel: string;
  programmeCount: number;
  facultyCounts: Record<string, number>;
  rules: NormalizedCatalogRule[];
};

function asRecord(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label}格式无效`);
  }
  return value as Record<string, unknown>;
}

function requiredString(value: unknown, label: string, max = 120) {
  if (typeof value !== "string" || !value.trim() || value.trim().length > max) {
    throw new Error(`${label}格式无效`);
  }
  return value.trim();
}

function normalizeSubjectGroups(value: unknown, label: string) {
  if (!Array.isArray(value) || value.length === 0 || value.length > 8) {
    throw new Error(`${label}须包含 1 至 8 个学科组`);
  }
  return value.map((rawGroup, groupIndex) => {
    const group = asRecord(rawGroup, `${label}第 ${groupIndex + 1} 组`);
    if (!Array.isArray(group.subjectCodes) || group.subjectCodes.length === 0) {
      throw new Error(`${label}第 ${groupIndex + 1} 组缺少学科代码`);
    }
    const subjectCodes = [
      ...new Set(
        group.subjectCodes.map((rawCode) => {
          const code = requiredString(rawCode, "学科代码", 6);
          if (!/^[A-Z]{2,6}$/.test(code)) {
            throw new Error(`学科代码 ${code} 须为 2 至 6 位大写字母`);
          }
          return code;
        }),
      ),
    ];
    const requiredCount = group.requiredCount;
    if (!Number.isInteger(requiredCount) || Number(requiredCount) < 1) {
      throw new Error(`${label}第 ${groupIndex + 1} 组门数无效`);
    }
    return { subjectCodes, requiredCount: Number(requiredCount) };
  });
}

export function parseAchievementCatalogJson(
  rawJson: string,
): NormalizedAchievementCatalog {
  if (typeof rawJson !== "string" || rawJson.length > 1_000_000) {
    throw new Error("目录 JSON 过大或格式无效");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson);
  } catch {
    throw new Error("目录不是有效的 JSON");
  }
  return validateAchievementCatalog(parsed);
}

export function validateAchievementCatalog(
  input: unknown,
): NormalizedAchievementCatalog {
  const catalog = asRecord(input, "目录");
  if (!Number.isInteger(catalog.version) || Number(catalog.version) < 1) {
    throw new Error("目录版本须为正整数");
  }
  const version = Number(catalog.version);
  const sourceLabel = requiredString(catalog.sourceLabel, "目录来源", 160);
  if (
    !Array.isArray(catalog.programmes) ||
    catalog.programmes.length === 0 ||
    catalog.programmes.length > 200
  ) {
    throw new Error("目录须包含 1 至 200 个专业");
  }

  const programmeKeys = new Set<string>();
  const ruleKeys = new Set<string>();
  const facultyCounts: Record<string, number> = {};
  const rules: NormalizedCatalogRule[] = [];

  for (const [programmeIndex, rawProgramme] of catalog.programmes.entries()) {
    const label = `第 ${programmeIndex + 1} 个专业`;
    const programme = asRecord(rawProgramme, label);
    const programmeKey = requiredString(
      programme.programmeKey,
      `${label}标识`,
      64,
    ).toLowerCase();
    if (!/^[a-z0-9][a-z0-9-]{1,63}$/.test(programmeKey)) {
      throw new Error(`${label}标识格式无效`);
    }
    if (programmeKeys.has(programmeKey)) {
      throw new Error(`专业标识 ${programmeKey} 重复`);
    }
    programmeKeys.add(programmeKey);

    const badgeCode = requiredString(programme.badgeCode, `${label}代码`, 4);
    if (!/^[A-Z]{4}$/.test(badgeCode)) {
      throw new Error(`${label}代码须为四位大写字母`);
    }
    const faculty = requiredString(programme.faculty, `${label}学院`, 32);
    if (
      !(ACHIEVEMENT_CATALOG_FACULTIES as readonly string[]).includes(faculty)
    ) {
      throw new Error(`${label}学院无效`);
    }
    facultyCounts[faculty] = (facultyCounts[faculty] ?? 0) + 1;
    const catalogEnabled = programme.enabled !== false;

    if (!Array.isArray(programme.tiers) || programme.tiers.length === 0) {
      throw new Error(`${label}缺少等级规则`);
    }
    const tiers = programme.tiers.map((rawTier, tierIndex) => {
      const tierRule = asRecord(rawTier, `${label}第 ${tierIndex + 1} 级`);
      const tier = requiredString(
        tierRule.tier,
        "称号等级",
        8,
      ) as AchievementTier;
      if (!["bronze", "silver", "gold"].includes(tier)) {
        throw new Error(`${label}称号等级无效`);
      }
      const subjectGroups = normalizeSubjectGroups(
        tierRule.subjectGroups,
        `${label}${tier}`,
      );
      const requiredCount = subjectGroups.reduce(
        (sum, group) => sum + group.requiredCount,
        0,
      );
      return {
        tier,
        displayName: requiredString(
          tierRule.displayName,
          `${label}称号名称`,
          80,
        ),
        description:
          typeof tierRule.description === "string"
            ? tierRule.description.trim().slice(0, 240)
            : "",
        subjectGroups,
        requiredCount,
      };
    });

    const tierOrder = tiers.map((tier) => tier.tier).join(",");
    if (!/^(bronze(,silver(,gold)?)?|silver(,gold)?)$/.test(tierOrder)) {
      throw new Error(`${label}等级必须按铜、银、金顺序且不能跳过中间等级`);
    }
    for (const [tierIndex, tierRule] of tiers.entries()) {
      const expectedCount =
        tierIndex === 0 && tierRule.tier === "silver" ? 8 : 4;
      if (tierRule.requiredCount !== expectedCount) {
        throw new Error(
          `${label}${tierRule.tier}须配置 ${expectedCount} 门课程，当前为 ${tierRule.requiredCount} 门`,
        );
      }
      const ruleKey = `${programmeKey}-${tierRule.tier}`;
      if (ruleKeys.has(ruleKey)) throw new Error(`规则标识 ${ruleKey} 重复`);
      ruleKeys.add(ruleKey);
      const prerequisiteRuleKey =
        tierIndex > 0 ? `${programmeKey}-${tiers[tierIndex - 1].tier}` : null;
      rules.push({
        programmeKey,
        ruleKey,
        version,
        tier: tierRule.tier,
        displayName: tierRule.displayName,
        description: tierRule.description,
        badgeCode,
        subjectCodes: [
          ...new Set(
            tierRule.subjectGroups.flatMap((group) => group.subjectCodes),
          ),
        ],
        subjectGroups: tierRule.subjectGroups,
        requiredCount: tierRule.requiredCount,
        prerequisiteRuleKey,
        catalogEnabled,
      });
    }
  }

  return {
    version,
    sourceLabel,
    programmeCount: programmeKeys.size,
    facultyCounts,
    rules,
  };
}
