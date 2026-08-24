import {
  pgTable,
  text,
  timestamp,
  date,
  uuid,
  boolean,
  integer,
  numeric,
  real,
  doublePrecision,
  jsonb,
  index,
  unique,
  uniqueIndex,
  primaryKey,
  check,
  foreignKey,
} from "drizzle-orm/pg-core";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";

// ── Better Auth core tables ──

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name"),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  nickname: text("nickname").notNull().default(""),
  role: text("role").notNull().default("user"),
  banned: boolean("banned").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const sessions = pgTable("sessions", {
  id: uuid("id").defaultRandom().primaryKey(),
  expiresAt: timestamp("expires_at").notNull(),
  token: text("token").notNull().unique(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
});

export const accounts = pgTable("accounts", {
  id: uuid("id").defaultRandom().primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at"),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const verifications = pgTable("verifications", {
  id: uuid("id").defaultRandom().primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// ── Application tables ──

export const siteSettings = pgTable("site_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

export const wikiPages = pgTable(
  "wiki_pages",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    title: text("title").notNull(),
    icon: text("icon"),
    content: text("content").notNull().default(""),
    parentId: uuid("parent_id").references((): AnyPgColumn => wikiPages.id),
    sortOrder: integer("sort_order").notNull().default(0),
    deletedAt: timestamp("deleted_at"),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id),
    updatedBy: uuid("updated_by")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
    version: integer("version").default(1).notNull(),
    contentGeneration: integer("content_generation").default(0).notNull(),
  },
  (table) => [index("wiki_pages_parent_id_idx").on(table.parentId)],
);

export const wikiDrafts = pgTable(
  "wiki_drafts",
  {
    id: uuid("id").primaryKey(),
    title: text("title").notNull().default(""),
    icon: text("icon"),
    content: text("content").notNull().default(""),
    // May reference either a public page or another owner-private draft.
    // Publishing validates that the parent is public before promotion.
    parentId: uuid("parent_id"),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
    version: integer("version").default(1).notNull(),
  },
  (table) => [
    index("wiki_drafts_created_by_idx").on(table.createdBy),
    index("wiki_drafts_parent_id_idx").on(table.parentId),
  ],
);

export const wikiRevisions = pgTable(
  "wiki_revisions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    pageId: uuid("page_id")
      .notNull()
      .references(() => wikiPages.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    content: text("content").notNull(),
    editedBy: uuid("edited_by")
      .notNull()
      .references(() => users.id),
    editSummary: text("edit_summary"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [index("wiki_revisions_page_id_idx").on(table.pageId)],
);

export const wikiLinks = pgTable(
  "wiki_links",
  {
    sourceId: uuid("source_id")
      .notNull()
      .references(() => wikiPages.id, { onDelete: "cascade" }),
    targetId: uuid("target_id")
      .notNull()
      .references(() => wikiPages.id, { onDelete: "cascade" }),
  },
  (table) => [
    index("wiki_links_source_id_idx").on(table.sourceId),
    index("wiki_links_target_id_idx").on(table.targetId),
  ],
);

export const discussions = pgTable(
  "discussions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    pageId: uuid("page_id")
      .notNull()
      .references(() => wikiPages.id, { onDelete: "cascade" }),
    commentMarkId: text("comment_mark_id").notNull(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    content: text("content").notNull(),
    resolved: boolean("resolved").notNull().default(false),
    parentId: uuid("parent_id").references((): AnyPgColumn => discussions.id, {
      onDelete: "cascade",
    }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("discussions_page_id_idx").on(table.pageId),
    index("discussions_comment_mark_id_idx").on(table.commentMarkId),
  ],
);

export const discussionsRelations = relations(discussions, ({ one }) => ({
  page: one(wikiPages, {
    fields: [discussions.pageId],
    references: [wikiPages.id],
  }),
  user: one(users, {
    fields: [discussions.userId],
    references: [users.id],
  }),
  parent: one(discussions, {
    fields: [discussions.parentId],
    references: [discussions.id],
  }),
}));

export const wikiLinksRelations = relations(wikiLinks, ({ one }) => ({
  source: one(wikiPages, {
    fields: [wikiLinks.sourceId],
    references: [wikiPages.id],
    relationName: "linkSource",
  }),
  target: one(wikiPages, {
    fields: [wikiLinks.targetId],
    references: [wikiPages.id],
    relationName: "linkTarget",
  }),
}));

export const wikiPagesRelations = relations(wikiPages, ({ one }) => ({
  createdByUser: one(users, {
    fields: [wikiPages.createdBy],
    references: [users.id],
    relationName: "createdBy",
  }),
  updatedByUser: one(users, {
    fields: [wikiPages.updatedBy],
    references: [users.id],
    relationName: "updatedBy",
  }),
}));

export const wikiRevisionsRelations = relations(wikiRevisions, ({ one }) => ({
  editedByUser: one(users, {
    fields: [wikiRevisions.editedBy],
    references: [users.id],
  }),
}));

// ── 课程技能树：课程数据 + 主修骨架（#157 / #161 / #162）──
// 数据来源裁定见 ADR 0005「决议（#157）」。课号为稳定锚点。

export const courses = pgTable(
  "courses",
  {
    code: text("code").primaryKey(),
    subject: text("subject").notNull(),
    title: text("title").notNull(),
    units: numeric("units").notNull(),
    description: text("description").notNull().default(""),
    // 开课季节（如 ["T1","T2"]），严格模式按此匹配学期
    terms: jsonb("terms").$type<string[]>().notNull().default([]),
    requirementsRaw: text("requirements_raw").notNull().default(""),
    // 解析占位列：先修布尔逻辑与排斥课号，由 #164 parseRequirements 填充
    prerequisite: jsonb("prerequisite"),
    exclusions: jsonb("exclusions").$type<string[]>(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [index("courses_subject_idx").on(table.subject)],
);

// Official AQS subject catalog. Names belong to the subject, not to every
// individual course, so keep them normalized in one database-backed catalog.
export const courseSubjects = pgTable("course_subjects", {
  code: text("code").primaryKey(),
  nameEn: text("name_en").notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const majors = pgTable("majors", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  faculty: text("faculty"),
  totalUnits: numeric("total_units"),
  normativeYears: integer("normative_years").notNull().default(4),
  handbookYear: text("handbook_year").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const majorCategories = pgTable(
  "major_categories",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    majorId: uuid("major_id")
      .notNull()
      .references(() => majors.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    kind: text("kind").notNull(), // required | one-of | basket
    unitsRequired: numeric("units_required"),
    pickN: integer("pick_n"),
  },
  (table) => [index("major_categories_major_id_idx").on(table.majorId)],
);

export const categoryCourses = pgTable(
  "category_courses",
  {
    categoryId: uuid("category_id")
      .notNull()
      .references(() => majorCategories.id, { onDelete: "cascade" }),
    // 成员课号；可指向主修树外的课，故不设 FK 到 courses
    courseCode: text("course_code").notNull(),
    // 别名映射未命中、课号在 courses 缺失/改名时为 true（占位 + 黄色告警，不静默隐藏）
    missing: boolean("missing").notNull().default(false),
  },
  (table) => [index("category_courses_category_id_idx").on(table.categoryId)],
);

// 版本对齐：旧课号 → 新课号别名映射（含 DSME→DOTE），摄取/解析前先重映射
export const courseAliases = pgTable("course_aliases", {
  oldCode: text("old_code").primaryKey(),
  newCode: text("new_code").notNull(),
});

export const majorsRelations = relations(majors, ({ many }) => ({
  categories: many(majorCategories),
}));

export const majorCategoriesRelations = relations(
  majorCategories,
  ({ one, many }) => ({
    major: one(majors, {
      fields: [majorCategories.majorId],
      references: [majors.id],
    }),
    courses: many(categoryCourses),
  }),
);

export const categoryCoursesRelations = relations(
  categoryCourses,
  ({ one }) => ({
    category: one(majorCategories, {
      fields: [categoryCourses.categoryId],
      references: [majorCategories.id],
    }),
  }),
);

// ── 课程技能树：用户构筑（#167）──

export const builds = pgTable(
  "builds",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    majorId: uuid("major_id")
      .notNull()
      .references(() => majors.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    mode: text("mode").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("builds_user_id_idx").on(table.userId),
    index("builds_major_id_idx").on(table.majorId),
  ],
);

export const buildItems = pgTable(
  "build_items",
  {
    buildId: uuid("build_id")
      .notNull()
      .references(() => builds.id, { onDelete: "cascade" }),
    courseCode: text("course_code").notNull(),
    term: integer("term"),
  },
  (table) => [primaryKey({ columns: [table.buildId, table.courseCode] })],
);

export const buildsRelations = relations(builds, ({ many }) => ({
  items: many(buildItems),
}));

export const buildItemsRelations = relations(buildItems, ({ one }) => ({
  build: one(builds, {
    fields: [buildItems.buildId],
    references: [builds.id],
  }),
}));

// ── 课程测评：评分 / 评论 / 点赞 ──
// 以课号（text）锚定，不设到 courses 的 FK：courses 由 scraper 重建，硬绑会
// 妨碍导入；课号是稳定锚点（ADR 0005），与 buildItems.courseCode 同策略。

export const courseRatings = pgTable(
  "course_ratings",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    courseCode: text("course_code").notNull(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** 0.5–5 in half-star steps for new submissions; legacy values are scaled. */
    score: real("score").notNull(),
    /** Offering metadata is nullable only for ratings created before #293. */
    academicYear: text("academic_year"),
    term: text("term"),
    professorId: text("professor_id").references(() => professors.id),
    instructorPersonId: text("instructor_person_id").references(
      () => courseInstructors.personId,
      { onDelete: "restrict" },
    ),
    professorNameSnapshot: text("professor_name_snapshot"),
    workload: text("workload"),
    grade: text("grade"),
    enrollment: text("enrollment"),
    attendance: text("attendance"),
    /** Free-form labels only; preset dimensions live in typed columns above. */
    customTags: jsonb("tags").$type<string[]>().notNull().default([]),
    isAnonymous: boolean("is_anonymous").notNull().default(false),
    /** Last time this user rated this course (refreshed on each upsert). */
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  // One rating row per (course, user): a re-rate updates it in place (upsert),
  // so the aggregate is one-vote-per-user. Leading course_code also serves the
  // by-course aggregate lookups, so no separate single-column index is needed.
  (table) => [
    uniqueIndex("course_ratings_course_user_uq").on(
      table.courseCode,
      table.userId,
    ),
    index("course_ratings_instructor_person_id_idx").on(
      table.instructorPersonId,
    ),
    check(
      "course_ratings_term_check",
      sql`${table.term} is null or ${table.term} in ('Term 1', 'Term 2', 'Summer')`,
    ),
    check(
      "course_ratings_workload_check",
      sql`${table.workload} is null or ${table.workload} in ('heavy', 'light')`,
    ),
    check(
      "course_ratings_grade_check",
      sql`${table.grade} is null or ${table.grade} in ('good', 'bad')`,
    ),
    check(
      "course_ratings_enrollment_check",
      sql`${table.enrollment} is null or ${table.enrollment} in ('hard', 'easy')`,
    ),
    check(
      "course_ratings_attendance_check",
      sql`${table.attendance} is null or ${table.attendance} in ('required', 'not_required')`,
    ),
  ],
);

// ── 课程成就：版本化规则 / 已点亮实例 / 内部证据 ──
// 生产规则只存在数据库中；应用代码只解释通用的 subject-count 条件。

export const achievementCatalogs = pgTable(
  "achievement_catalogs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    version: integer("version").notNull(),
    sourceLabel: text("source_label").notNull(),
    status: text("status").notNull().default("disabled"),
    programmeCount: integer("programme_count").notNull(),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    publishedAt: timestamp("published_at"),
  },
  (table) => [
    uniqueIndex("achievement_catalogs_version_uq").on(table.version),
    uniqueIndex("achievement_catalogs_one_active_uq")
      .on(table.status)
      .where(sql`${table.status} = 'active'`),
    check("achievement_catalogs_version_check", sql`${table.version} > 0`),
    check(
      "achievement_catalogs_status_check",
      sql`${table.status} in ('active', 'disabled', 'superseded')`,
    ),
    check(
      "achievement_catalogs_programme_count_check",
      sql`${table.programmeCount} > 0`,
    ),
  ],
);

export const achievementRules = pgTable(
  "achievement_rules",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    catalogId: uuid("catalog_id").references(() => achievementCatalogs.id),
    programmeKey: text("programme_key"),
    ruleKey: text("rule_key").notNull(),
    version: integer("version").notNull(),
    category: text("category").notNull().default("professional"),
    tier: text("tier").notNull().default("bronze"),
    displayName: text("display_name").notNull(),
    description: text("description").notNull().default(""),
    badgeCode: text("badge_code").notNull(),
    subjectCodes: jsonb("subject_codes").$type<string[]>().notNull(),
    requiredCount: integer("required_count").notNull(),
    subjectGroups: jsonb("subject_groups")
      .$type<Array<{ subjectCodes: string[]; requiredCount: number }>>()
      .notNull()
      .default([]),
    prerequisiteRuleKey: text("prerequisite_rule_key"),
    catalogEnabled: boolean("catalog_enabled").notNull().default(true),
    enabled: boolean("enabled").notNull().default(false),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("achievement_rules_key_version_uq").on(
      table.ruleKey,
      table.version,
    ),
    uniqueIndex("achievement_rules_one_enabled_version_uq")
      .on(table.ruleKey)
      .where(sql`${table.enabled} = true`),
    check("achievement_rules_version_check", sql`${table.version} > 0`),
    check(
      "achievement_rules_badge_code_check",
      sql`${table.badgeCode} ~ '^[A-Z]{4}$'`,
    ),
    check(
      "achievement_rules_required_count_check",
      sql`${table.requiredCount} > 0`,
    ),
    check(
      "achievement_rules_tier_check",
      sql`${table.tier} in ('bronze', 'silver', 'gold')`,
    ),
  ],
);

export const userAchievements = pgTable(
  "user_achievements",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    ruleId: uuid("rule_id")
      .notNull()
      .references(() => achievementRules.id),
    tier: text("tier").notNull().default("bronze"),
    status: text("status").notNull().default("active"),
    redeemedAt: timestamp("redeemed_at").defaultNow().notNull(),
    revokedAt: timestamp("revoked_at"),
  },
  (table) => [
    uniqueIndex("user_achievements_user_rule_uq").on(
      table.userId,
      table.ruleId,
    ),
    index("user_achievements_user_status_idx").on(table.userId, table.status),
    uniqueIndex("user_achievements_active_silver_uq")
      .on(table.userId)
      .where(sql`${table.status} = 'active' and ${table.tier} = 'silver'`),
    uniqueIndex("user_achievements_active_gold_uq")
      .on(table.userId)
      .where(sql`${table.status} = 'active' and ${table.tier} = 'gold'`),
    check(
      "user_achievements_status_check",
      sql`${table.status} in ('active', 'superseded', 'revoked')`,
    ),
    check(
      "user_achievements_tier_check",
      sql`${table.tier} in ('bronze', 'silver', 'gold')`,
    ),
  ],
);

export const achievementFusionRecipes = pgTable(
  "achievement_fusion_recipes",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    recipeKey: text("recipe_key").notNull(),
    version: integer("version").notNull(),
    kind: text("kind").notNull(),
    targetRuleId: uuid("target_rule_id")
      .notNull()
      .references(() => achievementRules.id),
    sourceRuleKeys: jsonb("source_rule_keys").$type<string[]>().notNull(),
    enabled: boolean("enabled").notNull().default(false),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("achievement_fusion_recipes_key_version_uq").on(
      table.recipeKey,
      table.version,
    ),
    uniqueIndex("achievement_fusion_recipes_one_enabled_uq")
      .on(table.recipeKey)
      .where(sql`${table.enabled} = true`),
    check(
      "achievement_fusion_recipes_kind_check",
      sql`${table.kind} in ('dual_bronze', 'same_profession_gold')`,
    ),
    check(
      "achievement_fusion_recipes_version_check",
      sql`${table.version} > 0`,
    ),
  ],
);

export const userHiddenAchievements = pgTable(
  "user_hidden_achievements",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    sourceRuleKey: text("source_rule_key").notNull(),
    selectedRecipeId: uuid("selected_recipe_id")
      .notNull()
      .references(() => achievementFusionRecipes.id, { onDelete: "restrict" }),
    equipped: boolean("equipped").notNull().default(false),
    claimedAt: timestamp("claimed_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("user_hidden_achievements_user_source_uq").on(
      table.userId,
      table.sourceRuleKey,
    ),
    uniqueIndex("user_hidden_achievements_one_equipped_uq")
      .on(table.userId)
      .where(sql`${table.equipped} = true`),
  ],
);

export const achievementFusionSources = pgTable(
  "achievement_fusion_sources",
  {
    fusionAchievementId: uuid("fusion_achievement_id")
      .notNull()
      .references(() => userAchievements.id, { onDelete: "cascade" }),
    sourceAchievementId: uuid("source_achievement_id")
      .notNull()
      .references(() => userAchievements.id, { onDelete: "restrict" }),
  },
  (table) => [
    primaryKey({
      columns: [table.fusionAchievementId, table.sourceAchievementId],
    }),
    uniqueIndex("achievement_fusion_sources_source_uq").on(
      table.sourceAchievementId,
    ),
  ],
);

export const achievementEvidence = pgTable(
  "achievement_evidence",
  {
    achievementId: uuid("achievement_id")
      .notNull()
      .references(() => userAchievements.id, { onDelete: "cascade" }),
    ratingId: uuid("rating_id")
      .notNull()
      .references(() => courseRatings.id, { onDelete: "restrict" }),
    courseCode: text("course_code").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.achievementId, table.ratingId] }),
    uniqueIndex("achievement_evidence_rating_uq").on(table.ratingId),
  ],
);

export const achievementProfiles = pgTable(
  "achievement_profiles",
  {
    userId: uuid("user_id")
      .primaryKey()
      .references(() => users.id, { onDelete: "cascade" }),
    showcaseId: uuid("showcase_id").defaultRandom().notNull(),
    primaryAchievementId: uuid("primary_achievement_id").references(
      () => userAchievements.id,
      { onDelete: "set null" },
    ),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("achievement_profiles_showcase_id_uq").on(table.showcaseId),
  ],
);

export const achievementNotices = pgTable(
  "achievement_notices",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    opportunityKey: text("opportunity_key").notNull(),
    kind: text("kind").notNull(),
    targetId: uuid("target_id").notNull(),
    targetTier: text("target_tier").notNull(),
    displayName: text("display_name").notNull(),
    seenAt: timestamp("seen_at"),
    invalidatedAt: timestamp("invalidated_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("achievement_notices_user_opportunity_uq").on(
      table.userId,
      table.opportunityKey,
    ),
    index("achievement_notices_user_current_idx").on(
      table.userId,
      table.invalidatedAt,
      table.seenAt,
    ),
    check(
      "achievement_notices_kind_check",
      sql`${table.kind} in ('professional', 'fusion')`,
    ),
    check(
      "achievement_notices_tier_check",
      sql`${table.targetTier} in ('bronze', 'silver', 'gold')`,
    ),
  ],
);

export const staffPeople = pgTable(
  "staff_people",
  {
    id: text("id").primaryKey(),
    canonicalName: text("canonical_name").notNull(),
    externalId: uuid("external_id").unique(),
    profileUrl: text("profile_url").unique(),
    source: text("source").notNull(),
    identityKind: text("identity_kind").notNull().default("official"),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    isCurrent: boolean("is_current").notNull().default(true),
    missingRuns: integer("missing_runs").notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("staff_people_canonical_name_idx").on(table.canonicalName),
    check(
      "staff_people_identity_kind_check",
      sql`${table.identityKind} in ('official', 'external', 'unverified')`,
    ),
  ],
);

export const staffPersonSources = pgTable(
  "staff_person_sources",
  {
    personId: text("person_id")
      .notNull()
      .references(() => staffPeople.id, { onDelete: "cascade" }),
    source: text("source").notNull(),
    sourceKey: text("source_key").notNull(),
    profileUrl: text("profile_url"),
    imageUrl: text("image_url"),
    roleLabel: text("role_label"),
    appointmentKind: text("appointment_kind"),
    profileVerifiedAt: timestamp("profile_verified_at", { withTimezone: true }),
    sourceUrl: text("source_url").notNull(),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    isCurrent: boolean("is_current").notNull().default(true),
    missingRuns: integer("missing_runs").notNull().default(0),
  },
  (table) => [
    primaryKey({ columns: [table.source, table.sourceKey] }),
    index("staff_person_sources_person_id_idx").on(table.personId),
    index("staff_person_sources_profile_url_idx").on(table.profileUrl),
    check(
      "staff_person_sources_appointment_kind_check",
      sql`${table.appointmentKind} is null or ${table.appointmentKind} in ('regular', 'emeritus', 'visiting', 'part_time', 'adjunct', 'honorary', 'courtesy')`,
    ),
  ],
);

export const staffDepartments = pgTable("staff_departments", {
  id: text("id").primaryKey(),
  faculty: text("faculty").notNull(),
  name: text("name").notNull(),
  profileUrl: text("profile_url").notNull().unique(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const staffOrganisations = pgTable(
  "staff_organisations",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    organisationType: text("organisation_type").notNull(),
    parentId: text("parent_id").references(
      (): AnyPgColumn => staffOrganisations.id,
    ),
    facultyId: text("faculty_id").references(
      (): AnyPgColumn => staffOrganisations.id,
    ),
    profileUrl: text("profile_url").notNull().unique(),
    source: text("source").notNull(),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    isCurrent: boolean("is_current").notNull().default(true),
    missingRuns: integer("missing_runs").notNull().default(0),
  },
  (table) => [
    index("staff_organisations_parent_id_idx").on(table.parentId),
    index("staff_organisations_faculty_id_idx").on(table.facultyId),
    check(
      "staff_organisations_type_check",
      sql`${table.organisationType} in ('faculty', 'department', 'school', 'unit', 'centre', 'programme', 'institute', 'office', 'laboratory', 'other')`,
    ),
  ],
);

export const staffOrganisationAffiliations = pgTable(
  "staff_organisation_affiliations",
  {
    personId: text("person_id")
      .notNull()
      .references(() => staffPeople.id, { onDelete: "cascade" }),
    organisationId: text("organisation_id")
      .notNull()
      .references(() => staffOrganisations.id, { onDelete: "cascade" }),
    sourceUrl: text("source_url").notNull(),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    isCurrent: boolean("is_current").notNull().default(true),
    missingRuns: integer("missing_runs").notNull().default(0),
  },
  (table) => [
    primaryKey({ columns: [table.personId, table.organisationId] }),
    index("staff_organisation_affiliations_org_idx").on(table.organisationId),
  ],
);

export const staffAffiliationTitles = pgTable(
  "staff_affiliation_titles",
  {
    personId: text("person_id").notNull(),
    organisationId: text("organisation_id").notNull(),
    title: text("title").notNull(),
    sourceUrl: text("source_url").notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    isCurrent: boolean("is_current").notNull().default(true),
    missingRuns: integer("missing_runs").notNull().default(0),
  },
  (table) => [
    primaryKey({
      columns: [table.personId, table.organisationId, table.title],
    }),
    foreignKey({
      columns: [table.personId, table.organisationId],
      foreignColumns: [
        staffOrganisationAffiliations.personId,
        staffOrganisationAffiliations.organisationId,
      ],
      name: "staff_affiliation_titles_affiliation_fk",
    }).onDelete("cascade"),
    index("staff_affiliation_titles_org_idx").on(table.organisationId),
  ],
);

export const staffAliases = pgTable(
  "staff_aliases",
  {
    personId: text("person_id")
      .notNull()
      .references(() => staffPeople.id, { onDelete: "cascade" }),
    alias: text("alias").notNull(),
    normalizedAlias: text("normalized_alias").notNull(),
    source: text("source").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.personId, table.alias] }),
    index("staff_aliases_normalized_alias_idx").on(table.normalizedAlias),
  ],
);

export const staffAffiliations = pgTable(
  "staff_affiliations",
  {
    personId: text("person_id")
      .notNull()
      .references(() => staffPeople.id, { onDelete: "cascade" }),
    departmentId: text("department_id")
      .notNull()
      .references(() => staffDepartments.id, { onDelete: "cascade" }),
    relationship: text("relationship").notNull(),
    sourceUrl: text("source_url").notNull(),
    verifiedAt: timestamp("verified_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.personId, table.departmentId, table.relationship],
    }),
    index("staff_affiliations_department_id_idx").on(table.departmentId),
  ],
);

export const professors = pgTable(
  "professors",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    searchText: text("search_text").notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [index("professors_search_text_idx").on(table.searchText)],
);

/** A person who can be selected as an instructor in course reviews. During
 * migration, legacy professor IDs continue to live in `professors` and map
 * to this canonical person role through `professor_staff_identities`. */
export const courseInstructors = pgTable("course_instructors", {
  publicId: uuid("public_id").defaultRandom().notNull().unique(),
  personId: text("person_id")
    .primaryKey()
    .references(() => staffPeople.id, { onDelete: "restrict" }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
}).enableRLS();

export const professorCourses = pgTable(
  "professor_courses",
  {
    professorId: text("professor_id")
      .notNull()
      .references(() => professors.id, { onDelete: "cascade" }),
    instructorPersonId: text("instructor_person_id").references(
      () => courseInstructors.personId,
      { onDelete: "restrict" },
    ),
    courseCode: text("course_code").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.professorId, table.courseCode] }),
    index("professor_courses_instructor_person_id_idx").on(
      table.instructorPersonId,
    ),
  ],
);

/** Professors attached to one student's course experience. The legacy
 * course_ratings.professor_id column remains as the first selected professor
 * for backwards compatibility; this table is the complete multi-select. */
export const courseRatingProfessors = pgTable(
  "course_rating_professors",
  {
    ratingId: uuid("rating_id")
      .notNull()
      .references(() => courseRatings.id, { onDelete: "cascade" }),
    professorId: text("professor_id").references(() => professors.id),
    instructorPersonId: text("instructor_person_id")
      .notNull()
      .references(() => courseInstructors.personId, {
        onDelete: "restrict",
      }),
    professorNameSnapshot: text("professor_name_snapshot").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.ratingId, table.instructorPersonId] }),
    index("course_rating_professors_professor_id_idx").on(table.professorId),
    index("course_rating_professors_instructor_person_id_idx").on(
      table.instructorPersonId,
    ),
  ],
).enableRLS();

export const professorStaffIdentities = pgTable(
  "professor_staff_identities",
  {
    professorId: text("professor_id")
      .primaryKey()
      .references(() => professors.id, { onDelete: "cascade" }),
    personId: text("person_id")
      .notNull()
      .references(() => staffPeople.id, { onDelete: "cascade" }),
    matchMethod: text("match_method").notNull(),
    sourceUrl: text("source_url"),
    verifiedAt: timestamp("verified_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("professor_staff_identities_person_id_idx").on(table.personId),
    check(
      "professor_staff_identities_match_method_check",
      sql`${table.matchMethod} in ('automatic', 'manual_override', 'source_native')`,
    ),
  ],
);

export const staffTeachingAssignments = pgTable(
  "staff_teaching_assignments",
  {
    personId: text("person_id")
      .notNull()
      .references(() => staffPeople.id, { onDelete: "cascade" }),
    academicYear: text("academic_year").notNull(),
    term: text("term").notNull(),
    courseCode: text("course_code").notNull(),
    capturedAt: timestamp("captured_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    primaryKey({
      columns: [
        table.personId,
        table.academicYear,
        table.term,
        table.courseCode,
      ],
    }),
    index("staff_teaching_assignments_course_offering_idx").on(
      table.courseCode,
      table.academicYear,
      table.term,
    ),
    check(
      "staff_teaching_assignments_term_check",
      sql`${table.term} in ('Term 1', 'Term 2', 'Summer')`,
    ),
  ],
);

export const courseEnrollments = pgTable(
  "course_enrollments",
  {
    academicYear: text("academic_year").notNull(),
    term: text("term").notNull(),
    courseCode: text("course_code").notNull(),
    classCode: text("class_code").notNull(),
    classNbr: text("class_nbr").notNull(),
    component: text("component").notNull(),
    section: text("section").notNull(),
    quota: integer("quota").notNull(),
    vacancy: integer("vacancy").notNull(),
    instructors: text("instructors").array().notNull(),
    capturedAt: timestamp("captured_at").notNull(),
  },
  (table) => [
    primaryKey({
      columns: [
        table.academicYear,
        table.term,
        table.classCode,
        table.component,
        table.section,
      ],
    }),
    index("course_enrollments_course_code_idx").on(table.courseCode),
  ],
);

export const courseOfferingInstructors = pgTable(
  "course_offering_instructors",
  {
    academicYear: text("academic_year").notNull(),
    term: text("term").notNull(),
    courseCode: text("course_code").notNull(),
    classCode: text("class_code").notNull(),
    component: text("component").notNull(),
    section: text("section").notNull(),
    instructorName: text("instructor_name").notNull(),
    personId: text("person_id").references(() => staffPeople.id, {
      onDelete: "set null",
    }),
    matchStatus: text("match_status").notNull().default("unverified"),
    evidenceUrl: text("evidence_url"),
    capturedAt: timestamp("captured_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    primaryKey({
      columns: [
        table.academicYear,
        table.term,
        table.classCode,
        table.component,
        table.section,
        table.instructorName,
      ],
    }),
    foreignKey({
      columns: [
        table.academicYear,
        table.term,
        table.classCode,
        table.component,
        table.section,
      ],
      foreignColumns: [
        courseEnrollments.academicYear,
        courseEnrollments.term,
        courseEnrollments.classCode,
        courseEnrollments.component,
        courseEnrollments.section,
      ],
      name: "course_offering_instructors_enrollment_fk",
    }).onDelete("cascade"),
    index("course_offering_instructors_course_idx").on(
      table.courseCode,
      table.academicYear,
      table.term,
    ),
    index("course_offering_instructors_person_idx").on(table.personId),
    check(
      "course_offering_instructors_match_status_check",
      sql`${table.matchStatus} in ('automatic', 'manual', 'external', 'unverified')`,
    ),
  ],
);

export const courseReviews = pgTable(
  "course_reviews",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    courseCode: text("course_code").notNull(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    content: text("content").notNull(),
    professorId: text("professor_id").references(() => professors.id),
    instructorPersonId: text("instructor_person_id").references(
      () => courseInstructors.personId,
      { onDelete: "restrict" },
    ),
    /** Immutable submission snapshot; nullable for legacy comments. */
    professorNameSnapshot: text("professor_name_snapshot"),
    academicYear: text("academic_year"),
    term: text("term"),
    score: real("score"),
    isAnonymous: boolean("is_anonymous").notNull().default(false),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at"),
  },
  (table) => [
    index("course_reviews_course_code_idx").on(table.courseCode),
    index("course_reviews_instructor_person_id_idx").on(
      table.instructorPersonId,
    ),
    check(
      "course_reviews_term_check",
      sql`${table.term} is null or ${table.term} in ('Term 1', 'Term 2', 'Summer')`,
    ),
  ],
);

// One row per (review, user) like. Composite PK makes a double-like a no-op at
// the DB level — no read-modify-write, so concurrent toggles can't lose data.
export const courseReviewLikes = pgTable(
  "course_review_likes",
  {
    reviewId: uuid("review_id")
      .notNull()
      .references(() => courseReviews.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
  },
  (table) => [primaryKey({ columns: [table.reviewId, table.userId] })],
);

export const courseReviewReplies = pgTable(
  "course_review_replies",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    reviewId: uuid("review_id")
      .notNull()
      .references(() => courseReviews.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    content: text("content").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("course_review_replies_review_created_idx").on(
      table.reviewId,
      table.createdAt,
    ),
  ],
);

export const NOTIFICATION_KINDS = ["course_review_reply"] as const;
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];
export type CourseReviewReplyNotificationMetadata = {
  courseCode: string;
  reviewId: string;
  replyId: string;
};

export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    recipientId: uuid("recipient_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    actorId: uuid("actor_id").references(() => users.id, {
      onDelete: "set null",
    }),
    kind: text("kind").$type<NotificationKind>().notNull(),
    metadata: jsonb("metadata")
      .$type<CourseReviewReplyNotificationMetadata>()
      .notNull(),
    readAt: timestamp("read_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("notifications_recipient_created_idx").on(
      table.recipientId,
      table.createdAt,
    ),
    index("notifications_recipient_read_idx").on(
      table.recipientId,
      table.readAt,
    ),
    check(
      "notifications_kind_check",
      sql`${table.kind} in ('course_review_reply')`,
    ),
  ],
);

// ── Campus Map canonical facts (#717) ──

export const CAMPUS_MAP_PIN_TYPES = [
  "toilet",
  "water",
  "printer",
  "common-space",
  "classroom",
] as const;
export type CampusMapPinType = (typeof CAMPUS_MAP_PIN_TYPES)[number];

export const CAMPUS_MAP_CAPABILITIES = ["print", "scan", "copy"] as const;
export type CampusMapCapability = (typeof CAMPUS_MAP_CAPABILITIES)[number];

export const CAMPUS_MAP_GENDERS = [
  "male",
  "female",
  "all-gender",
  "unknown",
] as const;
export type CampusMapGender = (typeof CAMPUS_MAP_GENDERS)[number];

export const CAMPUS_MAP_WHEELCHAIR_ACCESS = [
  "yes",
  "limited",
  "no",
  "unknown",
] as const;
export type CampusMapWheelchairAccess =
  (typeof CAMPUS_MAP_WHEELCHAIR_ACCESS)[number];

export const CAMPUS_MAP_AUDIENCES = [
  "public",
  "cuhk-member",
  "library-member",
  "unknown",
] as const;
export type CampusMapAudience = (typeof CAMPUS_MAP_AUDIENCES)[number];

export const CAMPUS_MAP_CREDENTIAL_REQUIREMENTS = [
  "none",
  "campus-card",
  "library-card",
  "other",
  "unknown",
] as const;
export type CampusMapCredentialRequirement =
  (typeof CAMPUS_MAP_CREDENTIAL_REQUIREMENTS)[number];

export type CampusMapReservationRequirement = "none" | "required" | "unknown";
export type CampusMapTemporaryStatus =
  | "normal"
  | "temporarily-closed"
  | "unknown";
export type CampusMapLocationKind = "building" | "floor" | "outdoor-point";
export type CampusMapPointPrecision = "approximate" | "precise";
export type CampusMapRevisionStatus = "active" | "retired" | "merged";
export type CampusMapPlaceOperation =
  | "create"
  | "update"
  | "retire"
  | "restore"
  | "merge";
export type CampusMapProvenanceKind =
  | "official"
  | "field-observation"
  | "open-data"
  | "provider-candidate"
  | "other";
export type CampusMapRightsStatus =
  | "public-domain"
  | "permission-granted"
  | "original-observation"
  | "restricted"
  | "unknown";
export const CAMPUS_MAP_SOURCE_COORDINATE_CRS = [
  "wgs84",
  "gcj02",
  "hk80",
  "hkpd",
  "other",
] as const;
export type CampusMapSourceCoordinateCrs =
  (typeof CAMPUS_MAP_SOURCE_COORDINATE_CRS)[number];
export const CAMPUS_MAP_COORDINATE_CONVERSION_METHODS = [
  "proj",
  "manual",
  "provider-adapter",
  "other",
] as const;
export type CampusMapCoordinateConversionMethod =
  (typeof CAMPUS_MAP_COORDINATE_CONVERSION_METHODS)[number];

export const CAMPUS_MAP_WEEKDAYS = [
  "mon",
  "tue",
  "wed",
  "thu",
  "fri",
  "sat",
  "sun",
] as const;
export type CampusMapWeekday = (typeof CAMPUS_MAP_WEEKDAYS)[number];

export type CampusMapAccessSchedule =
  | { kind: "unknown" }
  | { kind: "always" }
  | {
      kind: "weekly";
      timezone: "Asia/Hong_Kong";
      intervals: Array<{
        days: CampusMapWeekday[];
        opensAt: string;
        closesAt: string;
      }>;
    };

export const CAMPUS_MAP_FACT_FIELD_KEYS = [
  "name",
  "pinType",
  "capabilities",
  "gender",
  "wheelchairAccess",
  "audience",
  "credentialRequirement",
  "accessSchedule",
  "reservationRequirement",
  "temporaryStatus",
  "location",
] as const;
export type CampusMapFactFieldKey = (typeof CAMPUS_MAP_FACT_FIELD_KEYS)[number];

export type CampusMapFactFieldDefinition =
  | { kind: "text" }
  | { kind: "single-select"; values: string[] }
  | { kind: "multi-select"; values: string[] }
  | {
      kind: "access-schedule";
      variants: Array<CampusMapAccessSchedule["kind"]>;
      timezone: "Asia/Hong_Kong";
      localTimePattern: string;
    }
  | {
      kind: "location";
      variants: CampusMapLocationKind[];
      pointPrecisions: CampusMapPointPrecision[];
      canonicalCrs: "wgs84";
    };

export type CampusMapFactSchemaDefinition = {
  fields: Record<CampusMapFactFieldKey, CampusMapFactFieldDefinition>;
  pinTypes: Record<
    CampusMapPinType,
    {
      applicableFields: CampusMapFactFieldKey[];
      requiredFields: CampusMapFactFieldKey[];
    }
  >;
};

const COMMON_CAMPUS_MAP_FIELDS: CampusMapFactFieldKey[] = [
  "name",
  "pinType",
  "wheelchairAccess",
  "audience",
  "credentialRequirement",
  "accessSchedule",
  "reservationRequirement",
  "temporaryStatus",
  "location",
];

export const CAMPUS_MAP_FACT_SCHEMA_V1: CampusMapFactSchemaDefinition = {
  fields: {
    name: { kind: "text" },
    pinType: { kind: "single-select", values: [...CAMPUS_MAP_PIN_TYPES] },
    capabilities: {
      kind: "multi-select",
      values: [...CAMPUS_MAP_CAPABILITIES],
    },
    gender: {
      kind: "single-select",
      values: [...CAMPUS_MAP_GENDERS],
    },
    wheelchairAccess: {
      kind: "single-select",
      values: [...CAMPUS_MAP_WHEELCHAIR_ACCESS],
    },
    audience: {
      kind: "single-select",
      values: [...CAMPUS_MAP_AUDIENCES],
    },
    credentialRequirement: {
      kind: "single-select",
      values: [...CAMPUS_MAP_CREDENTIAL_REQUIREMENTS],
    },
    accessSchedule: {
      kind: "access-schedule",
      variants: ["unknown", "always", "weekly"],
      timezone: "Asia/Hong_Kong",
      localTimePattern: "^(?:[01]\\d|2[0-3]):[0-5]\\d$",
    },
    reservationRequirement: {
      kind: "single-select",
      values: ["none", "required", "unknown"],
    },
    temporaryStatus: {
      kind: "single-select",
      values: ["normal", "temporarily-closed", "unknown"],
    },
    location: {
      kind: "location",
      variants: ["building", "floor", "outdoor-point"],
      pointPrecisions: ["approximate", "precise"],
      canonicalCrs: "wgs84",
    },
  },
  pinTypes: {
    toilet: {
      applicableFields: [...COMMON_CAMPUS_MAP_FIELDS, "gender"],
      requiredFields: ["name", "pinType", "location"],
    },
    water: {
      applicableFields: [...COMMON_CAMPUS_MAP_FIELDS],
      requiredFields: ["name", "pinType", "location"],
    },
    printer: {
      applicableFields: [...COMMON_CAMPUS_MAP_FIELDS, "capabilities"],
      requiredFields: ["name", "pinType", "location"],
    },
    "common-space": {
      applicableFields: [...COMMON_CAMPUS_MAP_FIELDS],
      requiredFields: ["name", "pinType", "location"],
    },
    classroom: {
      applicableFields: [...COMMON_CAMPUS_MAP_FIELDS],
      requiredFields: ["name", "pinType", "location"],
    },
  },
};

export type CampusMapFactDisplayMetadata = Record<
  string,
  { label: string; valueLabels?: Record<string, string> }
>;

export const CAMPUS_MAP_FACT_DISPLAY_METADATA_V1: CampusMapFactDisplayMetadata =
  {
    name: { label: "名称" },
    pinType: { label: "类型" },
    capabilities: { label: "服务" },
    gender: { label: "性别属性" },
    wheelchairAccess: { label: "无障碍" },
    audience: { label: "开放对象" },
    credentialRequirement: { label: "凭证要求" },
    accessSchedule: { label: "开放时间" },
    reservationRequirement: { label: "预约要求" },
    temporaryStatus: { label: "临时状态" },
    location: { label: "位置" },
  };

export type CampusMapFieldDiff = Record<
  string,
  { before: unknown; after: unknown; label: string }
>;

function campusMapPlaceFactColumns() {
  return {
    name: text("name").notNull(),
    buildingId: uuid("building_id").references(() => campusMapBuildings.id, {
      onDelete: "restrict",
    }),
    floorId: uuid("floor_id"),
    pinType: text("pin_type").$type<CampusMapPinType>().notNull(),
    capabilities: text("capabilities")
      .array()
      .$type<CampusMapCapability[]>()
      .notNull()
      .default(sql`'{}'::text[]`),
    gender: text("gender")
      .$type<CampusMapGender>()
      .notNull()
      .default("unknown"),
    wheelchairAccess: text("wheelchair_access")
      .$type<CampusMapWheelchairAccess>()
      .notNull()
      .default("unknown"),
    audience: text("audience")
      .$type<CampusMapAudience>()
      .notNull()
      .default("unknown"),
    credentialRequirement: text("credential_requirement")
      .$type<CampusMapCredentialRequirement>()
      .notNull()
      .default("unknown"),
    accessSchedule: jsonb("access_schedule")
      .$type<CampusMapAccessSchedule>()
      .notNull()
      .default({ kind: "unknown" }),
    reservationRequirement: text("reservation_requirement")
      .$type<CampusMapReservationRequirement>()
      .notNull()
      .default("unknown"),
    temporaryStatus: text("temporary_status")
      .$type<CampusMapTemporaryStatus>()
      .notNull()
      .default("unknown"),
    locationKind: text("location_kind")
      .$type<CampusMapLocationKind>()
      .notNull(),
    pointPrecision: text("point_precision").$type<CampusMapPointPrecision>(),
    longitude: doublePrecision("longitude"),
    latitude: doublePrecision("latitude"),
    coordinateCrs: text("coordinate_crs").$type<"wgs84">(),
    observedAt: timestamp("observed_at", { withTimezone: true }),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    verifiedByActorIdSnapshot: uuid("verified_by_actor_id_snapshot"),
  };
}

function campusMapFactChecks(
  table: {
    [Key in keyof ReturnType<typeof campusMapPlaceFactColumns>]: AnyPgColumn;
  },
  prefix: string,
) {
  return [
    check(
      `${prefix}_pin_type_check`,
      sql`${table.pinType} in ('toilet', 'water', 'printer', 'common-space', 'classroom')`,
    ),
    check(
      `${prefix}_capabilities_check`,
      sql`${table.capabilities} <@ array['print', 'scan', 'copy']::text[]`,
    ),
    check(
      `${prefix}_gender_check`,
      sql`${table.gender} in ('male', 'female', 'all-gender', 'unknown')`,
    ),
    check(
      `${prefix}_wheelchair_access_check`,
      sql`${table.wheelchairAccess} in ('yes', 'limited', 'no', 'unknown')`,
    ),
    check(
      `${prefix}_audience_check`,
      sql`${table.audience} in ('public', 'cuhk-member', 'library-member', 'unknown')`,
    ),
    check(
      `${prefix}_credential_requirement_check`,
      sql`${table.credentialRequirement} in ('none', 'campus-card', 'library-card', 'other', 'unknown')`,
    ),
    check(
      `${prefix}_schedule_kind_check`,
      sql`(
        ${table.accessSchedule} in ('{"kind":"unknown"}'::jsonb, '{"kind":"always"}'::jsonb)
      ) or (
        jsonb_typeof(${table.accessSchedule}) = 'object'
        and ${table.accessSchedule}->>'kind' = 'weekly'
        and ${table.accessSchedule}->>'timezone' = 'Asia/Hong_Kong'
        and jsonb_typeof(${table.accessSchedule}->'intervals') = 'array'
        and jsonb_array_length(${table.accessSchedule}->'intervals') > 0
        and ${table.accessSchedule} - 'kind' - 'timezone' - 'intervals' = '{}'::jsonb
        and not jsonb_path_exists(
          ${table.accessSchedule},
          '$.intervals[*] ? (
            @.type() != "object"
            || !exists(@.days)
            || @.days.type() != "array"
            || @.days.size() == 0
            || exists(@.days[*] ? (
              @ != "mon" && @ != "tue" && @ != "wed" && @ != "thu"
              && @ != "fri" && @ != "sat" && @ != "sun"
            ))
            || !exists(@.opensAt)
            || !(@.opensAt like_regex "^(?:[01][0-9]|2[0-3]):[0-5][0-9]$")
            || !exists(@.closesAt)
            || !(@.closesAt like_regex "^(?:[01][0-9]|2[0-3]):[0-5][0-9]$")
            || @.opensAt == @.closesAt
            || exists(@.keyvalue() ? (
              @.key != "days" && @.key != "opensAt" && @.key != "closesAt"
            ))
          )'
        )
      )`,
    ),
    check(
      `${prefix}_reservation_requirement_check`,
      sql`${table.reservationRequirement} in ('none', 'required', 'unknown')`,
    ),
    check(
      `${prefix}_temporary_status_check`,
      sql`${table.temporaryStatus} in ('normal', 'temporarily-closed', 'unknown')`,
    ),
    check(
      `${prefix}_verification_check`,
      sql`(
        ${table.verifiedAt} is null
        and ${table.verifiedByActorIdSnapshot} is null
      ) or (
        ${table.verifiedAt} is not null
        and ${table.verifiedByActorIdSnapshot} is not null
      )`,
    ),
    check(
      `${prefix}_location_check`,
      sql`(
        ${table.locationKind} = 'building'
        and ${table.buildingId} is not null
        and ${table.floorId} is null
        and ${table.pointPrecision} is null
        and ${table.longitude} is null
        and ${table.latitude} is null
        and ${table.coordinateCrs} is null
      ) or (
        ${table.locationKind} = 'floor'
        and ${table.buildingId} is not null
        and ${table.floorId} is not null
        and ${table.pointPrecision} is null
        and ${table.longitude} is null
        and ${table.latitude} is null
        and ${table.coordinateCrs} is null
      ) or (
        ${table.locationKind} = 'outdoor-point'
        and ${table.buildingId} is null
        and ${table.floorId} is null
        and ${table.pointPrecision} in ('approximate', 'precise')
        and ${table.longitude} between -180 and 180
        and ${table.latitude} between -90 and 90
        and ${table.coordinateCrs} = 'wgs84'
      )`,
    ),
  ];
}

export const campusMapFactSchemas = pgTable(
  "campus_map_fact_schemas",
  {
    version: integer("version").primaryKey(),
    status: text("status").notNull().default("draft"),
    definition: jsonb("definition")
      .$type<CampusMapFactSchemaDefinition>()
      .notNull(),
    displayMetadata: jsonb("display_metadata")
      .$type<CampusMapFactDisplayMetadata>()
      .notNull(),
    createdBy: uuid("created_by").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("campus_map_fact_schemas_created_by_idx").on(table.createdBy),
    uniqueIndex("campus_map_fact_schemas_one_active_uq")
      .on(table.status)
      .where(sql`${table.status} = 'active'`),
    check("campus_map_fact_schemas_version_check", sql`${table.version} > 0`),
    check(
      "campus_map_fact_schemas_status_check",
      sql`${table.status} in ('draft', 'active', 'superseded')`,
    ),
  ],
);

export const campusMapProvenanceSources = pgTable(
  "campus_map_provenance_sources",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    sourceKind: text("source_kind").$type<CampusMapProvenanceKind>().notNull(),
    sourceRef: text("source_ref").notNull(),
    sourceUrl: text("source_url"),
    sourceOwner: text("source_owner"),
    sourceVersion: text("source_version"),
    snapshotHash: text("snapshot_hash"),
    accessedOn: date("accessed_on").notNull(),
    observedAt: timestamp("observed_at", { withTimezone: true }),
    rightsStatus: text("rights_status")
      .$type<CampusMapRightsStatus>()
      .notNull(),
    limitations: text("limitations"),
    note: text("note"),
    sourceCoordinateX: doublePrecision("source_coordinate_x"),
    sourceCoordinateY: doublePrecision("source_coordinate_y"),
    sourceCoordinateCrs: text(
      "source_coordinate_crs",
    ).$type<CampusMapSourceCoordinateCrs>(),
    conversionMethod:
      text("conversion_method").$type<CampusMapCoordinateConversionMethod>(),
    conversionVersion: text("conversion_version"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("campus_map_provenance_source_ref_uq").on(
      table.sourceKind,
      table.sourceRef,
    ),
    check(
      "campus_map_provenance_source_kind_check",
      sql`${table.sourceKind} in ('official', 'field-observation', 'open-data', 'provider-candidate', 'other')`,
    ),
    check(
      "campus_map_provenance_rights_status_check",
      sql`${table.rightsStatus} in ('public-domain', 'permission-granted', 'original-observation', 'restricted', 'unknown')`,
    ),
    check(
      "campus_map_provenance_coordinate_lineage_check",
      sql`(
        ${table.sourceCoordinateX} is null
        and ${table.sourceCoordinateY} is null
        and ${table.sourceCoordinateCrs} is null
        and ${table.conversionMethod} is null
        and ${table.conversionVersion} is null
      ) or (
        ${table.sourceCoordinateX} is not null
        and ${table.sourceCoordinateY} is not null
        and ${table.sourceCoordinateX} not in (
          'NaN'::double precision,
          'Infinity'::double precision,
          '-Infinity'::double precision
        )
        and ${table.sourceCoordinateY} not in (
          'NaN'::double precision,
          'Infinity'::double precision,
          '-Infinity'::double precision
        )
        and ${table.sourceCoordinateCrs} in ('wgs84', 'gcj02', 'hk80', 'hkpd', 'other')
        and (
          (${table.conversionMethod} is null and ${table.conversionVersion} is null)
          or (
            ${table.conversionMethod} in ('proj', 'manual', 'provider-adapter', 'other')
            and nullif(btrim(${table.conversionVersion}), '') is not null
          )
        )
        and (
          ${table.sourceCoordinateCrs} = 'wgs84'
          or ${table.conversionMethod} is not null
        )
        and (
          ${table.sourceCoordinateCrs} not in ('wgs84', 'gcj02')
          or (
            ${table.sourceCoordinateX} between -180 and 180
            and ${table.sourceCoordinateY} between -90 and 90
          )
        )
      )`,
    ),
  ],
);

export const campusMapBuildings = pgTable(
  "campus_map_buildings",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: text("name").notNull(),
    englishName: text("english_name"),
    code: text("code"),
    aliases: text("aliases")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    anchorLongitude: doublePrecision("anchor_longitude"),
    anchorLatitude: doublePrecision("anchor_latitude"),
    anchorCrs: text("anchor_crs"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("campus_map_buildings_name_idx").on(table.name),
    index("campus_map_buildings_anchor_geo_idx")
      .on(table.anchorLongitude, table.anchorLatitude)
      .where(sql`${table.anchorCrs} = 'wgs84'`),
    check(
      "campus_map_buildings_anchor_check",
      sql`(
        ${table.anchorLongitude} is null
        and ${table.anchorLatitude} is null
        and ${table.anchorCrs} is null
      ) or (
        ${table.anchorLongitude} between -180 and 180
        and ${table.anchorLatitude} between -90 and 90
        and ${table.anchorCrs} = 'wgs84'
      )`,
    ),
  ],
);

export const campusMapFloors = pgTable(
  "campus_map_floors",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    buildingId: uuid("building_id")
      .notNull()
      .references(() => campusMapBuildings.id, { onDelete: "restrict" }),
    displayLabel: text("display_label").notNull(),
    sortOrder: integer("sort_order").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique("campus_map_floors_building_id_id_uq").on(
      table.buildingId,
      table.id,
    ),
    index("campus_map_floors_building_sort_idx").on(
      table.buildingId,
      table.sortOrder,
    ),
  ],
);

export const campusMapBuildingProvenance = pgTable(
  "campus_map_building_provenance",
  {
    buildingId: uuid("building_id")
      .notNull()
      .references(() => campusMapBuildings.id, { onDelete: "restrict" }),
    provenanceId: uuid("provenance_id")
      .notNull()
      .references(() => campusMapProvenanceSources.id, {
        onDelete: "restrict",
      }),
  },
  (table) => [
    primaryKey({ columns: [table.buildingId, table.provenanceId] }),
    index("campus_map_building_provenance_source_idx").on(table.provenanceId),
  ],
);

export const campusMapFloorProvenance = pgTable(
  "campus_map_floor_provenance",
  {
    floorId: uuid("floor_id")
      .notNull()
      .references(() => campusMapFloors.id, { onDelete: "restrict" }),
    provenanceId: uuid("provenance_id")
      .notNull()
      .references(() => campusMapProvenanceSources.id, {
        onDelete: "restrict",
      }),
  },
  (table) => [
    primaryKey({ columns: [table.floorId, table.provenanceId] }),
    index("campus_map_floor_provenance_source_idx").on(table.provenanceId),
  ],
);

export const campusMapPlaces = pgTable("campus_map_places", {
  id: uuid("id").defaultRandom().primaryKey(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const campusMapChangesets = pgTable(
  "campus_map_changesets",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    actorUserId: uuid("actor_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    actorIdSnapshot: uuid("actor_id_snapshot").notNull(),
    actorNicknameSnapshot: text("actor_nickname_snapshot").notNull(),
    comment: text("comment").notNull(),
    sourceSummary: text("source_summary").notNull(),
    reviewRequested: boolean("review_requested").notNull().default(false),
    clientName: text("client_name").notNull(),
    clientVersion: text("client_version").notNull(),
    affectedCount: integer("affected_count").notNull(),
    createdCount: integer("created_count").notNull().default(0),
    updatedCount: integer("updated_count").notNull().default(0),
    retiredCount: integer("retired_count").notNull().default(0),
    restoredCount: integer("restored_count").notNull().default(0),
    mergedCount: integer("merged_count").notNull().default(0),
    bboxWest: doublePrecision("bbox_west"),
    bboxSouth: doublePrecision("bbox_south"),
    bboxEast: doublePrecision("bbox_east"),
    bboxNorth: doublePrecision("bbox_north"),
    warningSummary: jsonb("warning_summary")
      .$type<Array<{ code: string; count: number }>>()
      .notNull()
      .default([]),
    revertsChangesetId: uuid("reverts_changeset_id").references(
      (): AnyPgColumn => campusMapChangesets.id,
      { onDelete: "restrict" },
    ),
    publishedAt: timestamp("published_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("campus_map_changesets_feed_idx").on(table.publishedAt, table.id),
    index("campus_map_changesets_actor_user_idx").on(table.actorUserId),
    index("campus_map_changesets_reverts_idx").on(table.revertsChangesetId),
    index("campus_map_changesets_actor_feed_idx").on(
      table.actorIdSnapshot,
      table.publishedAt,
      table.id,
    ),
    index("campus_map_changesets_review_feed_idx")
      .on(table.publishedAt, table.id)
      .where(sql`${table.reviewRequested} = true`),
    check(
      "campus_map_changesets_counts_check",
      sql`${table.affectedCount} > 0
        and ${table.createdCount} >= 0
        and ${table.updatedCount} >= 0
        and ${table.retiredCount} >= 0
        and ${table.restoredCount} >= 0
        and ${table.mergedCount} >= 0
        and ${table.affectedCount} = ${table.createdCount} + ${table.updatedCount} + ${table.retiredCount} + ${table.restoredCount} + ${table.mergedCount}`,
    ),
    check(
      "campus_map_changesets_bbox_check",
      sql`(
        ${table.bboxWest} is null and ${table.bboxSouth} is null
        and ${table.bboxEast} is null and ${table.bboxNorth} is null
      ) or (
        ${table.bboxWest} between -180 and 180
        and ${table.bboxEast} between -180 and 180
        and ${table.bboxSouth} between -90 and 90
        and ${table.bboxNorth} between -90 and 90
        and ${table.bboxWest} <= ${table.bboxEast}
        and ${table.bboxSouth} <= ${table.bboxNorth}
      )`,
    ),
  ],
);

export const campusMapPlaceChanges = pgTable(
  "campus_map_place_changes",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    changesetId: uuid("changeset_id")
      .notNull()
      .references(() => campusMapChangesets.id, { onDelete: "restrict" }),
    placeId: uuid("place_id")
      .notNull()
      .references(() => campusMapPlaces.id, { onDelete: "restrict" }),
    operation: text("operation").$type<CampusMapPlaceOperation>().notNull(),
    fieldDiff: jsonb("field_diff").$type<CampusMapFieldDiff>().notNull(),
  },
  (table) => [
    uniqueIndex("campus_map_place_changes_changeset_place_uq").on(
      table.changesetId,
      table.placeId,
    ),
    unique("campus_map_place_changes_place_id_id_uq").on(
      table.placeId,
      table.id,
    ),
    unique("campus_map_place_changes_changeset_id_id_uq").on(
      table.changesetId,
      table.id,
    ),
    index("campus_map_place_changes_place_idx").on(table.placeId),
    check(
      "campus_map_place_changes_operation_check",
      sql`${table.operation} in ('create', 'update', 'retire', 'restore', 'merge')`,
    ),
  ],
);

const campusMapRevisionFactColumns = campusMapPlaceFactColumns();

export const campusMapFactRevisions = pgTable(
  "campus_map_fact_revisions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    placeId: uuid("place_id")
      .notNull()
      .references(() => campusMapPlaces.id, { onDelete: "restrict" }),
    changesetId: uuid("changeset_id")
      .notNull()
      .references(() => campusMapChangesets.id, { onDelete: "restrict" }),
    placeChangeId: uuid("place_change_id")
      .notNull()
      .references(() => campusMapPlaceChanges.id, { onDelete: "restrict" }),
    previousRevisionId: uuid("previous_revision_id"),
    factSchemaVersion: integer("fact_schema_version")
      .notNull()
      .references(() => campusMapFactSchemas.version, {
        onDelete: "restrict",
      }),
    fieldMetadata: jsonb("field_metadata")
      .$type<CampusMapFactDisplayMetadata>()
      .notNull(),
    status: text("status").$type<CampusMapRevisionStatus>().notNull(),
    mergedIntoPlaceId: uuid("merged_into_place_id").references(
      () => campusMapPlaces.id,
      { onDelete: "restrict" },
    ),
    actorIdSnapshot: uuid("actor_id_snapshot").notNull(),
    actorNicknameSnapshot: text("actor_nickname_snapshot").notNull(),
    ...campusMapRevisionFactColumns,
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique("campus_map_fact_revisions_place_id_id_uq").on(
      table.placeId,
      table.id,
    ),
    unique("campus_map_fact_revisions_place_id_status_id_uq").on(
      table.placeId,
      table.status,
      table.id,
    ),
    uniqueIndex("campus_map_fact_revisions_place_change_uq").on(
      table.placeChangeId,
    ),
    index("campus_map_fact_revisions_place_created_idx").on(
      table.placeId,
      table.createdAt,
      table.id,
    ),
    index("campus_map_fact_revisions_changeset_idx").on(table.changesetId),
    index("campus_map_fact_revisions_previous_idx").on(
      table.placeId,
      table.previousRevisionId,
    ),
    index("campus_map_fact_revisions_schema_idx").on(table.factSchemaVersion),
    index("campus_map_fact_revisions_building_floor_idx").on(
      table.buildingId,
      table.floorId,
    ),
    index("campus_map_fact_revisions_merge_target_idx").on(
      table.mergedIntoPlaceId,
    ),
    foreignKey({
      columns: [table.placeId, table.previousRevisionId],
      foreignColumns: [table.placeId, table.id],
      name: "campus_map_fact_revisions_previous_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.placeId, table.placeChangeId],
      foreignColumns: [campusMapPlaceChanges.placeId, campusMapPlaceChanges.id],
      name: "campus_map_fact_revisions_place_change_place_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.changesetId, table.placeChangeId],
      foreignColumns: [
        campusMapPlaceChanges.changesetId,
        campusMapPlaceChanges.id,
      ],
      name: "campus_map_fact_revisions_place_change_changeset_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.buildingId, table.floorId],
      foreignColumns: [campusMapFloors.buildingId, campusMapFloors.id],
      name: "campus_map_fact_revisions_floor_building_fk",
    }).onDelete("restrict"),
    check(
      "campus_map_fact_revisions_status_check",
      sql`${table.status} in ('active', 'retired', 'merged')`,
    ),
    check(
      "campus_map_fact_revisions_merge_target_check",
      sql`(
        ${table.status} = 'merged'
        and ${table.mergedIntoPlaceId} is not null
        and ${table.mergedIntoPlaceId} <> ${table.placeId}
      ) or (
        ${table.status} in ('active', 'retired')
        and ${table.mergedIntoPlaceId} is null
      )`,
    ),
    ...campusMapFactChecks(table, "campus_map_fact_revisions"),
  ],
);

export const campusMapRevisionProvenance = pgTable(
  "campus_map_revision_provenance",
  {
    revisionId: uuid("revision_id")
      .notNull()
      .references(() => campusMapFactRevisions.id, { onDelete: "restrict" }),
    provenanceId: uuid("provenance_id")
      .notNull()
      .references(() => campusMapProvenanceSources.id, {
        onDelete: "restrict",
      }),
  },
  (table) => [
    primaryKey({ columns: [table.revisionId, table.provenanceId] }),
    index("campus_map_revision_provenance_source_idx").on(table.provenanceId),
  ],
);

export const campusMapRevisionVisibility = pgTable(
  "campus_map_revision_visibility",
  {
    revisionId: uuid("revision_id")
      .primaryKey()
      .references(() => campusMapFactRevisions.id, { onDelete: "restrict" }),
    visibility: text("visibility").notNull().default("public"),
    redactionRef: text("redaction_ref"),
    updatedBy: uuid("updated_by").references(() => users.id, {
      onDelete: "set null",
    }),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("campus_map_revision_visibility_updated_by_idx").on(table.updatedBy),
    check(
      "campus_map_revision_visibility_check",
      sql`(
        ${table.visibility} = 'public' and ${table.redactionRef} is null
      ) or (
        ${table.visibility} = 'redacted' and ${table.redactionRef} is not null
      )`,
    ),
  ],
);

export const campusMapCurrentRevisions = pgTable(
  "campus_map_current_revisions",
  {
    placeId: uuid("place_id")
      .primaryKey()
      .references(() => campusMapPlaces.id, { onDelete: "restrict" }),
    revisionId: uuid("revision_id").notNull().unique(),
    status: text("status").$type<CampusMapRevisionStatus>().notNull(),
    advancedAt: timestamp("advanced_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique("campus_map_current_revisions_place_status_revision_uq").on(
      table.placeId,
      table.status,
      table.revisionId,
    ),
    foreignKey({
      columns: [table.placeId, table.status, table.revisionId],
      foreignColumns: [
        campusMapFactRevisions.placeId,
        campusMapFactRevisions.status,
        campusMapFactRevisions.id,
      ],
      name: "campus_map_current_revisions_revision_fk",
    }).onDelete("restrict"),
    check(
      "campus_map_current_revisions_status_check",
      sql`${table.status} in ('active', 'retired', 'merged')`,
    ),
  ],
);

const campusMapCurrentFactColumns = campusMapPlaceFactColumns();

export const campusMapCurrentFacts = pgTable(
  "campus_map_current_facts",
  {
    placeId: uuid("place_id")
      .primaryKey()
      .references(() => campusMapPlaces.id, { onDelete: "restrict" }),
    revisionId: uuid("revision_id").notNull().unique(),
    status: text("status").notNull().default("active"),
    factSchemaVersion: integer("fact_schema_version")
      .notNull()
      .references(() => campusMapFactSchemas.version, {
        onDelete: "restrict",
      }),
    ...campusMapCurrentFactColumns,
    publishedAt: timestamp("published_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.placeId, table.status, table.revisionId],
      foreignColumns: [
        campusMapCurrentRevisions.placeId,
        campusMapCurrentRevisions.status,
        campusMapCurrentRevisions.revisionId,
      ],
      name: "campus_map_current_facts_current_revision_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.buildingId, table.floorId],
      foreignColumns: [campusMapFloors.buildingId, campusMapFloors.id],
      name: "campus_map_current_facts_floor_building_fk",
    }).onDelete("restrict"),
    index("campus_map_current_facts_building_type_idx").on(
      table.buildingId,
      table.pinType,
    ),
    index("campus_map_current_facts_floor_type_idx").on(
      table.buildingId,
      table.floorId,
      table.pinType,
    ),
    index("campus_map_current_facts_duplicate_warning_idx")
      .on(sql`lower(btrim(${table.name}))`, table.pinType)
      .where(sql`btrim(${table.name}) <> ''`),
    index("campus_map_current_facts_geo_idx")
      .on(table.longitude, table.latitude)
      .where(sql`${table.locationKind} = 'outdoor-point'`),
    index("campus_map_current_facts_schema_idx").on(table.factSchemaVersion),
    check(
      "campus_map_current_facts_active_check",
      sql`${table.status} = 'active'`,
    ),
    ...campusMapFactChecks(table, "campus_map_current_facts"),
  ],
);

export const campusMapProviderMappings = pgTable(
  "campus_map_provider_mappings",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    provider: text("provider").notNull(),
    providerObjectId: text("provider_object_id").notNull(),
    targetKind: text("target_kind").notNull(),
    buildingId: uuid("building_id").references(() => campusMapBuildings.id, {
      onDelete: "restrict",
    }),
    placeId: uuid("place_id").references(() => campusMapPlaces.id, {
      onDelete: "restrict",
    }),
    provenanceId: uuid("provenance_id").references(
      () => campusMapProvenanceSources.id,
      { onDelete: "restrict" },
    ),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("campus_map_provider_mappings_identity_uq").on(
      table.provider,
      table.providerObjectId,
    ),
    index("campus_map_provider_mappings_building_idx").on(table.buildingId),
    index("campus_map_provider_mappings_place_idx").on(table.placeId),
    index("campus_map_provider_mappings_provenance_idx").on(table.provenanceId),
    check(
      "campus_map_provider_mappings_target_check",
      sql`(
        ${table.targetKind} = 'building'
        and ${table.buildingId} is not null
        and ${table.placeId} is null
      ) or (
        ${table.targetKind} = 'place'
        and ${table.buildingId} is null
        and ${table.placeId} is not null
      )`,
    ),
  ],
);

export type CampusMapStoredPublishResult = {
  status: "published";
  changesetId: string;
  changes: Array<{ placeId: string; revisionId: string }>;
  warnings: Array<{
    code: string;
    anchor: { changeIndex?: number; placeId?: string; field?: string };
    fingerprint: string;
  }>;
  suggestions: Array<{
    code: string;
    anchor: { changeIndex?: number; placeId?: string; field?: string };
  }>;
};

export const campusMapPublishRequests = pgTable(
  "campus_map_publish_requests",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    actorUserId: uuid("actor_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    actorIdSnapshot: uuid("actor_id_snapshot").notNull(),
    idempotencyKey: uuid("idempotency_key").notNull(),
    requestFingerprint: text("request_fingerprint").notNull(),
    status: text("status").notNull().default("processing"),
    changesetId: uuid("changeset_id")
      .unique()
      .references(() => campusMapChangesets.id, { onDelete: "restrict" }),
    result: jsonb("result").$type<CampusMapStoredPublishResult>(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("campus_map_publish_requests_actor_key_uq").on(
      table.actorIdSnapshot,
      table.idempotencyKey,
    ),
    index("campus_map_publish_requests_changeset_idx").on(table.changesetId),
    index("campus_map_publish_requests_actor_user_idx").on(table.actorUserId),
    check(
      "campus_map_publish_requests_result_check",
      sql`(
        ${table.status} = 'processing'
        and ${table.changesetId} is null
        and ${table.result} is null
        and ${table.completedAt} is null
      ) or (
        ${table.status} = 'published'
        and ${table.changesetId} is not null
        and ${table.result} is not null
        and ${table.completedAt} is not null
      )`,
    ),
  ],
);

export const campusMapPublishRateLimits = pgTable(
  "campus_map_publish_rate_limits",
  {
    scope: text("scope").notNull(),
    subjectHash: text("subject_hash").notNull(),
    windowKind: text("window_kind").notNull(),
    windowStartedAt: timestamp("window_started_at", {
      withTimezone: true,
    }).notNull(),
    attemptCount: integer("attempt_count").notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.scope, table.subjectHash, table.windowKind],
    }),
    index("campus_map_publish_rate_limits_updated_idx").on(table.updatedAt),
    check(
      "campus_map_publish_rate_limits_scope_check",
      sql`${table.scope} in ('actor', 'ip')`,
    ),
    check(
      "campus_map_publish_rate_limits_window_check",
      sql`${table.windowKind} in ('burst', 'sustained')`,
    ),
    check(
      "campus_map_publish_rate_limits_subject_hash_check",
      sql`char_length(${table.subjectHash}) = 64`,
    ),
    check(
      "campus_map_publish_rate_limits_attempt_count_check",
      sql`${table.attemptCount} >= 0`,
    ),
  ],
);

// ── Canteen subsystem (hard delete; no deletedAt — unlike wiki soft delete) ──

/** Visible meal-period tabs (never includes allday). */
export const MEAL_PERIODS = ["breakfast", "lunch", "dinner"] as const;
export type MealPeriod = (typeof MEAL_PERIODS)[number];

export const ALLDAY_MEAL_PERIOD = "allday" as const;
/** Stored assignment values: specific periods and/or exclusive allday. */
export const MEAL_PERIOD_VALUES = [
  ...MEAL_PERIODS,
  ALLDAY_MEAL_PERIOD,
] as const;
export type MealPeriodAssignment = (typeof MEAL_PERIOD_VALUES)[number];

export const canteens = pgTable("canteens", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  location: text("location"),
  /** Admin notice shown under the canteen name (e.g. takeaway surcharge). */
  announcement: text("announcement"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const canteenMenuItems = pgTable(
  "canteen_menu_items",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    canteenId: uuid("canteen_id")
      .notNull()
      .references(() => canteens.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    price: integer("price"),
    mealPeriods: text("meal_periods")
      .array()
      .notNull()
      .default(sql`'{allday}'`),
    sortOrder: integer("sort_order").notNull().default(0),
    svgKey: text("svg_key").notNull().default("default"),
    externalSource: text("external_source"),
    externalKey: text("external_key"),
    isAvailable: boolean("is_available").notNull().default(true),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("canteen_menu_items_canteen_id_idx").on(table.canteenId),
    uniqueIndex("canteen_menu_items_external_identity_uidx")
      .on(table.canteenId, table.externalSource, table.externalKey)
      .where(
        sql`${table.externalSource} is not null and ${table.externalKey} is not null`,
      ),
    check(
      "canteen_menu_items_external_identity_chk",
      sql`(${table.externalSource} is null) = (${table.externalKey} is null)`,
    ),
  ],
);

export const canteensRelations = relations(canteens, ({ many }) => ({
  menuItems: many(canteenMenuItems),
  importDrafts: many(menuImportDrafts),
  danmakuMessages: many(canteenDanmakuMessages),
  shameVotes: many(canteenShameVotes),
}));

export const canteenMenuItemsRelations = relations(
  canteenMenuItems,
  ({ one, many }) => ({
    canteen: one(canteens, {
      fields: [canteenMenuItems.canteenId],
      references: [canteens.id],
    }),
    prices: many(canteenMenuItemPrices),
    votes: many(canteenDishVotes),
    comments: many(canteenDishComments),
  }),
);

export const canteenMenuItemPrices = pgTable(
  "canteen_menu_item_prices",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    menuItemId: uuid("menu_item_id")
      .notNull()
      .references(() => canteenMenuItems.id, { onDelete: "cascade" }),
    label: text("label"),
    amountMinor: integer("amount_minor").notNull(),
    currency: text("currency").notNull().default("HKD"),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("canteen_menu_item_prices_item_sort_idx").on(
      table.menuItemId,
      table.sortOrder,
    ),
    check(
      "canteen_menu_item_prices_amount_chk",
      sql`${table.amountMinor} >= 0 AND ${table.amountMinor} <= 999900`,
    ),
    check(
      "canteen_menu_item_prices_currency_chk",
      sql`${table.currency} ~ '^[A-Z]{3}$'`,
    ),
  ],
);

export const canteenMenuItemPricesRelations = relations(
  canteenMenuItemPrices,
  ({ one }) => ({
    menuItem: one(canteenMenuItems, {
      fields: [canteenMenuItemPrices.menuItemId],
      references: [canteenMenuItems.id],
    }),
  }),
);

export const VOTE_VALUES = ["like", "dislike"] as const;
export type VoteValue = (typeof VOTE_VALUES)[number];

export const canteenDishVotes = pgTable(
  "canteen_dish_votes",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    menuItemId: uuid("menu_item_id")
      .notNull()
      .references(() => canteenMenuItems.id, { onDelete: "cascade" }),
    userId: uuid("user_id").references(() => users.id),
    anonymousSessionId: uuid("anonymous_session_id"),
    vote: text("vote"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("canteen_dish_votes_menu_item_id_idx").on(table.menuItemId),
    index("canteen_dish_votes_user_id_idx").on(table.userId),
    index("canteen_dish_votes_anon_session_id_idx").on(
      table.anonymousSessionId,
    ),
    uniqueIndex("canteen_dish_votes_user_menu_item_uidx")
      .on(table.userId, table.menuItemId)
      .where(sql`${table.userId} IS NOT NULL`),
    uniqueIndex("canteen_dish_votes_anon_menu_item_uidx")
      .on(table.anonymousSessionId, table.menuItemId)
      .where(sql`${table.anonymousSessionId} IS NOT NULL`),
    check(
      "canteen_dish_votes_identity_chk",
      sql`(
        (${table.userId} IS NOT NULL AND ${table.anonymousSessionId} IS NULL) OR
        (${table.userId} IS NULL AND ${table.anonymousSessionId} IS NOT NULL)
      )`,
    ),
  ],
);

/** Append-only 食堂踩票；票永久保留，榜单按 voteDate（港时自然日）过滤展示。 */
export const canteenShameVotes = pgTable(
  "canteen_shame_votes",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    canteenId: uuid("canteen_id")
      .notNull()
      .references(() => canteens.id, { onDelete: "cascade" }),
    userId: uuid("user_id").references(() => users.id, {
      onDelete: "restrict",
    }),
    anonymousSessionId: uuid("anonymous_session_id"),
    /** Asia/Hong_Kong calendar date (YYYY-MM-DD) at insert time. */
    voteDate: date("vote_date").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("canteen_shame_votes_date_canteen_idx").on(
      table.voteDate,
      table.canteenId,
    ),
    index("canteen_shame_votes_date_anon_idx").on(
      table.voteDate,
      table.anonymousSessionId,
    ),
    index("canteen_shame_votes_canteen_id_idx").on(table.canteenId),
    check(
      "canteen_shame_votes_identity_chk",
      sql`(
        (${table.userId} IS NOT NULL AND ${table.anonymousSessionId} IS NULL) OR
        (${table.userId} IS NULL AND ${table.anonymousSessionId} IS NOT NULL)
      )`,
    ),
  ],
);

export const canteenShameVotesRelations = relations(
  canteenShameVotes,
  ({ one }) => ({
    canteen: one(canteens, {
      fields: [canteenShameVotes.canteenId],
      references: [canteens.id],
    }),
    user: one(users, {
      fields: [canteenShameVotes.userId],
      references: [users.id],
    }),
  }),
);

export const canteenDishVotesRelations = relations(
  canteenDishVotes,
  ({ one }) => ({
    menuItem: one(canteenMenuItems, {
      fields: [canteenDishVotes.menuItemId],
      references: [canteenMenuItems.id],
    }),
    user: one(users, {
      fields: [canteenDishVotes.userId],
      references: [users.id],
    }),
  }),
);

export const canteenDishComments = pgTable(
  "canteen_dish_comments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    menuItemId: uuid("menu_item_id")
      .notNull()
      .references(() => canteenMenuItems.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    content: text("content").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("canteen_dish_comments_menu_item_id_idx").on(table.menuItemId),
    index("canteen_dish_comments_user_id_idx").on(table.userId),
    index("canteen_dish_comments_created_at_id_idx").on(
      table.createdAt,
      table.id,
    ),
  ],
);

export const adminAuditLogs = pgTable(
  "admin_audit_logs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    actorUserId: uuid("actor_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    actorEmail: text("actor_email").notNull(),
    actorNickname: text("actor_nickname").notNull(),
    action: text("action").notNull(),
    targetType: text("target_type").notNull(),
    targetId: text("target_id").notNull(),
    targetUserId: uuid("target_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    details: jsonb("details")
      .$type<import("@/lib/admin-audit-types").AdminAuditDetails>()
      .notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("admin_audit_logs_action_created_at_idx").on(
      table.action,
      table.createdAt,
    ),
    index("admin_audit_logs_actor_user_id_idx").on(table.actorUserId),
    index("admin_audit_logs_target_user_id_idx").on(table.targetUserId),
  ],
);

export const canteenDishCommentsRelations = relations(
  canteenDishComments,
  ({ one }) => ({
    menuItem: one(canteenMenuItems, {
      fields: [canteenDishComments.menuItemId],
      references: [canteenMenuItems.id],
    }),
    user: one(users, {
      fields: [canteenDishComments.userId],
      references: [users.id],
    }),
  }),
);

export const menuImportDrafts = pgTable(
  "menu_import_drafts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    canteenId: uuid("canteen_id")
      .notNull()
      .references(() => canteens.id, { onDelete: "cascade" }),
    sourceImageUrl: text("source_image_url").notNull(),
    ocrRawText: text("ocr_raw_text"),
    items: jsonb("items")
      .notNull()
      .$type<import("@/lib/canteen-types").MenuImportDraftItem[]>(),
    status: text("status").notNull().default("ready"),
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [index("menu_import_drafts_canteen_id_idx").on(table.canteenId)],
);

export const menuImportDraftsRelations = relations(
  menuImportDrafts,
  ({ one }) => ({
    canteen: one(canteens, {
      fields: [menuImportDrafts.canteenId],
      references: [canteens.id],
    }),
  }),
);

// ── Canteen-scoped danmaku (separate from hub danmaku_messages) ──

export const canteenDanmakuMessages = pgTable(
  "canteen_danmaku_messages",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    canteenId: uuid("canteen_id")
      .notNull()
      .references(() => canteens.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    content: text("content").notNull(),
    month: text("month").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("canteen_danmaku_messages_canteen_month_idx").on(
      table.canteenId,
      table.month,
    ),
    index("canteen_danmaku_messages_user_id_idx").on(table.userId),
  ],
).enableRLS();

export const canteenDanmakuMessagesRelations = relations(
  canteenDanmakuMessages,
  ({ one }) => ({
    canteen: one(canteens, {
      fields: [canteenDanmakuMessages.canteenId],
      references: [canteens.id],
    }),
    user: one(users, {
      fields: [canteenDanmakuMessages.userId],
      references: [users.id],
    }),
  }),
);

// ── Hub /canteen browse danmaku (#192) ──

export const danmakuMessages = pgTable(
  "danmaku_messages",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    content: text("content").notNull(),
    month: text("month").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("danmaku_messages_month_idx").on(table.month),
    index("danmaku_messages_user_id_idx").on(table.userId),
  ],
);

export const danmakuMessagesRelations = relations(
  danmakuMessages,
  ({ one }) => ({
    user: one(users, {
      fields: [danmakuMessages.userId],
      references: [users.id],
    }),
  }),
);

// ── Takeout (外卖) — parallel to canteens, separate tables ──

export const takeouts = pgTable("takeouts", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  location: text("location"),
  /** Admin notice shown under the takeout name. */
  announcement: text("announcement"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const takeoutMenuItems = pgTable(
  "takeout_menu_items",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    takeoutId: uuid("takeout_id")
      .notNull()
      .references(() => takeouts.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    price: integer("price"),
    mealPeriods: text("meal_periods")
      .array()
      .notNull()
      .default(sql`'{allday}'`),
    sortOrder: integer("sort_order").notNull().default(0),
    svgKey: text("svg_key").notNull().default("default"),
    isAvailable: boolean("is_available").notNull().default(true),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [index("takeout_menu_items_takeout_id_idx").on(table.takeoutId)],
);

export const takeoutMenuItemPrices = pgTable(
  "takeout_menu_item_prices",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    menuItemId: uuid("menu_item_id")
      .notNull()
      .references(() => takeoutMenuItems.id, { onDelete: "cascade" }),
    label: text("label"),
    amountMinor: integer("amount_minor").notNull(),
    currency: text("currency").notNull().default("HKD"),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("takeout_menu_item_prices_item_sort_idx").on(
      table.menuItemId,
      table.sortOrder,
    ),
    check(
      "takeout_menu_item_prices_amount_chk",
      sql`${table.amountMinor} >= 0 AND ${table.amountMinor} <= 999900`,
    ),
    check(
      "takeout_menu_item_prices_currency_chk",
      sql`${table.currency} ~ '^[A-Z]{3}$'`,
    ),
  ],
);

export const takeoutsRelations = relations(takeouts, ({ many }) => ({
  menuItems: many(takeoutMenuItems),
}));

export const takeoutMenuItemsRelations = relations(
  takeoutMenuItems,
  ({ one, many }) => ({
    takeout: one(takeouts, {
      fields: [takeoutMenuItems.takeoutId],
      references: [takeouts.id],
    }),
    prices: many(takeoutMenuItemPrices),
  }),
);

export const takeoutMenuItemPricesRelations = relations(
  takeoutMenuItemPrices,
  ({ one }) => ({
    menuItem: one(takeoutMenuItems, {
      fields: [takeoutMenuItemPrices.menuItemId],
      references: [takeoutMenuItems.id],
    }),
  }),
);
