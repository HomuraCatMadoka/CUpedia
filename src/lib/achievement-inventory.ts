import "server-only";

import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import {
  achievementEvidence,
  achievementRules,
  courseRatings,
  courses,
  userAchievements,
} from "@/db/schema";
import { evaluateSubjectCountRule } from "@/lib/achievement-evaluator";
import { requireAuth } from "@/lib/auth-guard";

export type ProfessionalAchievementTier = "bronze" | "silver" | "gold";

export type ProfessionalAchievementInventoryTier = {
  tier: ProfessionalAchievementTier;
  ruleId: string;
  status: "completed" | "current" | "locked";
};

export type ProfessionalAchievementGroupProgress = {
  subjectCodes: string[];
  matchedCount: number;
  requiredCount: number;
};

export type ProfessionalAchievementInventoryCurrent = {
  achievementId: string;
  ruleId: string;
  tier: ProfessionalAchievementTier;
};

export type ProfessionalAchievementInventoryNext = {
  ruleId: string;
  tier: ProfessionalAchievementTier;
  displayName: string;
  description: string;
  subjectGroups: ProfessionalAchievementGroupProgress[];
  matchedCount: number;
  requiredCount: number;
  eligible: boolean;
  prerequisiteSatisfied: boolean;
  slotAvailable: boolean;
  action: "claim" | "upgrade";
};

export type ProfessionalAchievementInventoryProgramme = {
  programmeKey: string;
  badgeCode: string;
  displayName: string;
  description: string;
  tiers: ProfessionalAchievementInventoryTier[];
  current: ProfessionalAchievementInventoryCurrent | null;
  next: ProfessionalAchievementInventoryNext | null;
};

export type ProfessionalAchievementInventoryItem =
  ProfessionalAchievementInventoryProgramme;

type SubjectGroup = { subjectCodes: string[]; requiredCount: number };

type RuleRow = {
  id: string;
  programmeKey: string | null;
  ruleKey: string;
  version: number;
  displayName: string;
  description: string;
  badgeCode: string;
  tier: string;
  subjectCodes: string[];
  subjectGroups: SubjectGroup[];
  requiredCount: number;
  prerequisiteRuleKey: string | null;
};

type OwnedRow = RuleRow & {
  achievementId: string;
  ruleId: string;
  category: string;
  status: string;
};

const TIER_RANK: Record<ProfessionalAchievementTier, number> = {
  bronze: 0,
  silver: 1,
  gold: 2,
};

function toTier(value: string): ProfessionalAchievementTier {
  if (value === "silver" || value === "gold") return value;
  return "bronze";
}

function programmeKeyFor(row: Pick<RuleRow, "programmeKey" | "ruleKey">) {
  return row.programmeKey ?? row.ruleKey.replace(/-(bronze|silver|gold)$/, "");
}

function subjectGroupsFor(rule: RuleRow): SubjectGroup[] {
  return rule.subjectGroups.length > 0
    ? rule.subjectGroups
    : [
        {
          subjectCodes: rule.subjectCodes,
          requiredCount: rule.requiredCount,
        },
      ];
}

function programmeDisplayName(rule: RuleRow) {
  const colonIndex = rule.description.search(/[:：]/u);
  if (colonIndex > 0) {
    const prefix = rule.description.slice(0, colonIndex).trim();
    if (prefix) return prefix;
  }
  const withoutCode = rule.displayName
    .replace(new RegExp(`\\b${rule.badgeCode}\\b`, "giu"), "")
    .trim();
  return (
    withoutCode
      .replace(/\s*(?:(?:铜|银|金)(?:标|级)?|bronze|silver|gold)\s*$/iu, "")
      .trim() || rule.displayName
  );
}

export async function getMyProfessionalAchievementInventory(): Promise<
  ProfessionalAchievementInventoryProgramme[]
> {
  const user = await requireAuth();
  return getProfessionalAchievementInventoryForUser(user.id);
}

export async function getProfessionalAchievementInventoryForUser(
  userId: string,
): Promise<ProfessionalAchievementInventoryProgramme[]> {
  const [rules, ratings, occupiedRows, allOwnedRows] = await Promise.all([
    db
      .select({
        id: achievementRules.id,
        programmeKey: achievementRules.programmeKey,
        ruleKey: achievementRules.ruleKey,
        version: achievementRules.version,
        displayName: achievementRules.displayName,
        description: achievementRules.description,
        badgeCode: achievementRules.badgeCode,
        tier: achievementRules.tier,
        subjectCodes: achievementRules.subjectCodes,
        subjectGroups: achievementRules.subjectGroups,
        requiredCount: achievementRules.requiredCount,
        prerequisiteRuleKey: achievementRules.prerequisiteRuleKey,
      })
      .from(achievementRules)
      .where(
        and(
          eq(achievementRules.category, "professional"),
          eq(achievementRules.enabled, true),
        ),
      ),
    db
      .select({
        id: courseRatings.id,
        courseCode: courseRatings.courseCode,
        subject: courses.subject,
      })
      .from(courseRatings)
      .innerJoin(courses, eq(courseRatings.courseCode, courses.code))
      .where(eq(courseRatings.userId, userId)),
    db
      .select({ ratingId: achievementEvidence.ratingId })
      .from(achievementEvidence)
      .innerJoin(
        userAchievements,
        eq(achievementEvidence.achievementId, userAchievements.id),
      )
      .where(eq(userAchievements.userId, userId)),
    db
      .select({
        achievementId: userAchievements.id,
        ruleId: userAchievements.ruleId,
        status: userAchievements.status,
        category: achievementRules.category,
        id: achievementRules.id,
        programmeKey: achievementRules.programmeKey,
        ruleKey: achievementRules.ruleKey,
        version: achievementRules.version,
        displayName: achievementRules.displayName,
        description: achievementRules.description,
        badgeCode: achievementRules.badgeCode,
        tier: achievementRules.tier,
        subjectCodes: achievementRules.subjectCodes,
        subjectGroups: achievementRules.subjectGroups,
        requiredCount: achievementRules.requiredCount,
        prerequisiteRuleKey: achievementRules.prerequisiteRuleKey,
      })
      .from(userAchievements)
      .innerJoin(
        achievementRules,
        eq(userAchievements.ruleId, achievementRules.id),
      )
      .where(eq(userAchievements.userId, userId)),
  ]);

  return buildInventory({
    rules: rules as RuleRow[],
    ratings,
    occupiedRatingIds: new Set(occupiedRows.map((row) => row.ratingId)),
    ownedRows: allOwnedRows as OwnedRow[],
  });
}

function buildInventory({
  rules,
  ratings,
  occupiedRatingIds,
  ownedRows,
}: {
  rules: RuleRow[];
  ratings: Array<{ id: string; courseCode: string; subject: string }>;
  occupiedRatingIds: ReadonlySet<string>;
  ownedRows: OwnedRow[];
}): ProfessionalAchievementInventoryProgramme[] {
  const professionalOwned = ownedRows.filter(
    (row) => row.category === "professional",
  );
  const activeTierSlots = new Set(
    professionalOwned
      .filter((row) => row.status === "active")
      .map((row) => toTier(row.tier)),
  );
  const activeRuleKeys = new Set(
    professionalOwned
      .filter((row) => row.status === "active")
      .map((row) => row.ruleKey),
  );

  const programmeKeys = new Set([
    ...rules.map(programmeKeyFor),
    ...professionalOwned
      .filter((row) => row.status !== "revoked")
      .map(programmeKeyFor),
  ]);

  return [...programmeKeys]
    .map((programmeKey) => {
      const programmeRules = rules.filter(
        (rule) => programmeKeyFor(rule) === programmeKey,
      );
      const programmeOwned = professionalOwned.filter(
        (row) => programmeKeyFor(row) === programmeKey,
      );
      const nonRevokedOwned = programmeOwned.filter(
        (row) => row.status !== "revoked",
      );
      const active = nonRevokedOwned
        .filter((row) => row.status === "active")
        .sort(
          (a, b) => TIER_RANK[toTier(b.tier)] - TIER_RANK[toTier(a.tier)],
        )[0];
      const superseded = nonRevokedOwned.filter(
        (row) => row.status === "superseded",
      );

      const rulesByTier = new Map<ProfessionalAchievementTier, RuleRow>();
      for (const rule of programmeRules) {
        rulesByTier.set(toTier(rule.tier), rule);
      }
      for (const owned of nonRevokedOwned) {
        const tier = toTier(owned.tier);
        if (!rulesByTier.has(tier)) rulesByTier.set(tier, owned);
      }
      const orderedRules = [...rulesByTier.values()].sort(
        (a, b) => TIER_RANK[toTier(a.tier)] - TIER_RANK[toTier(b.tier)],
      );

      const nextRule = active
        ? programmeRules.find(
            (rule) => rule.prerequisiteRuleKey === active.ruleKey,
          )
        : superseded.length > 0
          ? undefined
          : programmeRules.find((rule) => !rule.prerequisiteRuleKey);
      const representative = active ?? nextRule ?? orderedRules[0];
      if (!representative) return null;

      const current = active
        ? {
            achievementId: active.achievementId,
            ruleId: active.ruleId,
            tier: toTier(active.tier),
          }
        : null;
      const tiers = orderedRules.map((rule) => {
        const tier = toTier(rule.tier);
        const ownedAtTier =
          nonRevokedOwned.find(
            (row) => row.status === "active" && toTier(row.tier) === tier,
          ) ??
          nonRevokedOwned.find(
            (row) => row.status === "superseded" && toTier(row.tier) === tier,
          );
        const status =
          ownedAtTier?.status === "active"
            ? ("current" as const)
            : ownedAtTier?.status === "superseded"
              ? ("completed" as const)
              : ("locked" as const);
        return { tier, ruleId: ownedAtTier?.ruleId ?? rule.id, status };
      });

      let next: ProfessionalAchievementInventoryNext | null = null;
      if (nextRule) {
        const subjectGroups = subjectGroupsFor(nextRule);
        const evaluation = evaluateSubjectCountRule(
          { subjectGroups },
          ratings,
          occupiedRatingIds,
        );
        let slotOffset = 0;
        const groupProgress = subjectGroups.map((group) => {
          const matchedCount = evaluation.evidenceRatingIdsBySlot
            .slice(slotOffset, slotOffset + group.requiredCount)
            .filter(Boolean).length;
          slotOffset += group.requiredCount;
          return {
            subjectCodes: group.subjectCodes,
            matchedCount,
            requiredCount: group.requiredCount,
          };
        });
        const prerequisiteSatisfied =
          !nextRule.prerequisiteRuleKey ||
          activeRuleKeys.has(nextRule.prerequisiteRuleKey);
        const nextTier = toTier(nextRule.tier);
        const slotAvailable =
          nextTier === "bronze" || !activeTierSlots.has(nextTier);
        next = {
          ruleId: nextRule.id,
          tier: nextTier,
          displayName: nextRule.displayName,
          description: nextRule.description,
          subjectGroups: groupProgress,
          matchedCount: evaluation.matchedCount,
          requiredCount: evaluation.requiredCount,
          eligible:
            evaluation.eligible && prerequisiteSatisfied && slotAvailable,
          prerequisiteSatisfied,
          slotAvailable,
          action: current ? "upgrade" : "claim",
        };
      }

      return {
        programmeKey,
        badgeCode: representative.badgeCode,
        displayName: programmeDisplayName(representative),
        description: representative.description,
        tiers,
        current,
        next,
      } satisfies ProfessionalAchievementInventoryProgramme;
    })
    .filter(
      (item): item is ProfessionalAchievementInventoryProgramme =>
        item !== null,
    )
    .sort((a, b) => a.badgeCode.localeCompare(b.badgeCode));
}
