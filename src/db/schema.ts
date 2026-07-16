import {
  pgTable,
  text,
  timestamp,
  uuid,
  boolean,
  integer,
  numeric,
  real,
  jsonb,
  index,
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
    slug: text("slug").notNull().unique(),
    title: text("title").notNull(),
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
  },
  (table) => [
    index("wiki_pages_parent_id_idx").on(table.parentId),
    index("wiki_pages_slug_idx").on(table.slug),
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
    professorNameSnapshot: text("professor_name_snapshot"),
    tags: jsonb("tags").$type<string[]>().notNull().default([]),
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
    check(
      "course_ratings_term_check",
      sql`${table.term} is null or ${table.term} in ('Term 1', 'Term 2', 'Summer')`,
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

export const professorCourses = pgTable(
  "professor_courses",
  {
    professorId: text("professor_id")
      .notNull()
      .references(() => professors.id, { onDelete: "cascade" }),
    courseCode: text("course_code").notNull(),
  },
  (table) => [primaryKey({ columns: [table.professorId, table.courseCode] })],
);

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
      sql`${table.matchMethod} in ('automatic', 'manual_override')`,
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
    /** Immutable submission snapshot; nullable for legacy comments. */
    professorNameSnapshot: text("professor_name_snapshot"),
    academicYear: text("academic_year"),
    term: text("term"),
    score: real("score"),
    isAnonymous: boolean("is_anonymous").notNull().default(false),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("course_reviews_course_code_idx").on(table.courseCode),
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

// ── Canteen subsystem (hard delete; no deletedAt — unlike wiki soft delete) ──

export const MEAL_PERIODS = ["breakfast", "lunch", "dinner"] as const;
export type MealPeriod = (typeof MEAL_PERIODS)[number];

export const canteens = pgTable("canteens", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  location: text("location"),
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
    mealPeriod: text("meal_period").notNull().default("lunch"),
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
    index("canteen_menu_items_canteen_meal_idx").on(
      table.canteenId,
      table.mealPeriod,
    ),
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

// ── Homepage monthly danmaku (#192) ──

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
