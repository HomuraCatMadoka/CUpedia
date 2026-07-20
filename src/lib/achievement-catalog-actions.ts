"use server";

import { and, desc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/db";
import { achievementCatalogs, achievementRules } from "@/db/schema";
import { parseAchievementCatalogJson } from "@/lib/achievement-catalog";
import { requireAdmin } from "@/lib/auth-guard";

const ADMIN_PATH = "/admin/achievement-rules";

async function assertNewCatalogVersion(version: number) {
  const [latest] = await db
    .select({ version: achievementCatalogs.version })
    .from(achievementCatalogs)
    .orderBy(desc(achievementCatalogs.version))
    .limit(1);
  if (latest && version <= latest.version) {
    throw new Error(`目录版本须高于现有 v${latest.version}`);
  }
}

export async function previewAchievementCatalog(rawJson: string) {
  await requireAdmin();
  const catalog = parseAchievementCatalogJson(rawJson);
  await assertNewCatalogVersion(catalog.version);
  return {
    version: catalog.version,
    sourceLabel: catalog.sourceLabel,
    programmeCount: catalog.programmeCount,
    ruleCount: catalog.rules.length,
    enabledProgrammeCount: new Set(
      catalog.rules
        .filter((rule) => rule.catalogEnabled)
        .map((rule) => rule.programmeKey),
    ).size,
    facultyCounts: catalog.facultyCounts,
  };
}

export async function publishAchievementCatalog(rawJson: string) {
  const admin = await requireAdmin();
  const catalog = parseAchievementCatalogJson(rawJson);

  const result = await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(428367)`);
    const [latest] = await tx
      .select({ version: achievementCatalogs.version })
      .from(achievementCatalogs)
      .orderBy(desc(achievementCatalogs.version))
      .limit(1);
    if (latest && catalog.version <= latest.version) {
      throw new Error(`目录版本须高于现有 v${latest.version}`);
    }

    await tx
      .update(achievementCatalogs)
      .set({ status: "superseded" })
      .where(eq(achievementCatalogs.status, "active"));
    await tx
      .update(achievementRules)
      .set({ enabled: false, updatedAt: new Date() })
      .where(isNotNull(achievementRules.catalogId));

    const incomingKeys = catalog.rules.map((rule) => rule.ruleKey);
    await tx
      .update(achievementRules)
      .set({ enabled: false, updatedAt: new Date() })
      .where(
        and(
          inArray(achievementRules.ruleKey, incomingKeys),
          eq(achievementRules.enabled, true),
        ),
      );

    const [created] = await tx
      .insert(achievementCatalogs)
      .values({
        version: catalog.version,
        sourceLabel: catalog.sourceLabel,
        status: "active",
        programmeCount: catalog.programmeCount,
        createdBy: admin.id,
        publishedAt: new Date(),
      })
      .returning({ id: achievementCatalogs.id });

    await tx.insert(achievementRules).values(
      catalog.rules.map((rule) => ({
        ...rule,
        catalogId: created.id,
        category: "professional",
        enabled: rule.catalogEnabled,
        createdBy: admin.id,
      })),
    );
    return { id: created.id, version: catalog.version };
  });

  revalidatePath(ADMIN_PATH);
  revalidatePath("/courses/achievements");
  return result;
}

export async function getAchievementCatalogs() {
  await requireAdmin();
  return db
    .select({
      id: achievementCatalogs.id,
      version: achievementCatalogs.version,
      sourceLabel: achievementCatalogs.sourceLabel,
      status: achievementCatalogs.status,
      programmeCount: achievementCatalogs.programmeCount,
      publishedAt: achievementCatalogs.publishedAt,
    })
    .from(achievementCatalogs)
    .orderBy(desc(achievementCatalogs.version));
}

export async function setAchievementCatalogStatus(
  catalogId: string,
  nextStatus: "active" | "disabled" | "superseded",
) {
  await requireAdmin();
  if (!/^[0-9a-f-]{36}$/i.test(catalogId)) throw new Error("目录无效");

  await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(428367)`);
    const [catalog] = await tx
      .select({ id: achievementCatalogs.id })
      .from(achievementCatalogs)
      .where(eq(achievementCatalogs.id, catalogId))
      .limit(1);
    if (!catalog) throw new Error("目录不存在");

    if (nextStatus === "active") {
      const targetRules = await tx
        .select({ ruleKey: achievementRules.ruleKey })
        .from(achievementRules)
        .where(eq(achievementRules.catalogId, catalogId));
      if (targetRules.length === 0) throw new Error("目录没有可启用的规则");

      await tx
        .update(achievementCatalogs)
        .set({ status: "superseded" })
        .where(eq(achievementCatalogs.status, "active"));
      await tx
        .update(achievementRules)
        .set({ enabled: false, updatedAt: new Date() })
        .where(isNotNull(achievementRules.catalogId));
      await tx
        .update(achievementRules)
        .set({ enabled: false, updatedAt: new Date() })
        .where(
          and(
            inArray(
              achievementRules.ruleKey,
              targetRules.map((rule) => rule.ruleKey),
            ),
            eq(achievementRules.enabled, true),
          ),
        );
      await tx
        .update(achievementCatalogs)
        .set({ status: "active", publishedAt: new Date() })
        .where(eq(achievementCatalogs.id, catalogId));
      await tx
        .update(achievementRules)
        .set({
          enabled: sql`${achievementRules.catalogEnabled}`,
          updatedAt: new Date(),
        })
        .where(eq(achievementRules.catalogId, catalogId));
      return;
    }

    await tx
      .update(achievementCatalogs)
      .set({ status: nextStatus })
      .where(eq(achievementCatalogs.id, catalogId));
    await tx
      .update(achievementRules)
      .set({ enabled: false, updatedAt: new Date() })
      .where(eq(achievementRules.catalogId, catalogId));
  });

  revalidatePath(ADMIN_PATH);
  revalidatePath("/courses/achievements");
}
