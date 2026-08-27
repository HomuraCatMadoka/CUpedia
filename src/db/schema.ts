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
  jsonb,
  index,
  uniqueIndex,
  primaryKey,
  unique,
  check,
  foreignKey,
} from "drizzle-orm/pg-core";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";
import {
  PRODUCT_UPDATE_AREAS,
  PRODUCT_UPDATE_TYPES,
  ProductUpdateArea,
  ProductUpdateType,
} from "@/lib/product-update-types";

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
}).enableRLS();

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
}).enableRLS();

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
}).enableRLS();

export const verifications = pgTable("verifications", {
  id: uuid("id").defaultRandom().primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}).enableRLS();

// ── Application tables ──

export const siteSettings = pgTable("site_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
}).enableRLS();

export const campusBusArrivalObservations = pgTable(
  "campus_bus_arrival_observations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    routeId: text("route_id").notNull(),
    stopId: text("stop_id").notNull(),
    stopOccurrenceId: text("stop_occurrence_id").notNull(),
    observedArrivalAt: timestamp("observed_arrival_at", {
      withTimezone: true,
    }).notNull(),
    receivedAt: timestamp("received_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    submittedAnonymously: boolean("submitted_anonymously")
      .notNull()
      .default(true),
  },
  (table) => [
    index("campus_bus_arrival_observations_route_stop_time_idx").on(
      table.routeId,
      table.stopId,
      table.observedArrivalAt,
    ),
    index("campus_bus_arrival_observations_received_at_idx").on(
      table.receivedAt,
    ),
    index("campus_bus_arrival_observations_arrival_at_idx").on(
      table.observedArrivalAt,
    ),
    index("campus_bus_arrival_observations_route_time_idx").on(
      table.routeId,
      table.observedArrivalAt,
    ),
    check(
      "campus_bus_arrival_observations_time_window_chk",
      sql`${table.observedArrivalAt} >= ${table.receivedAt} - interval '15 minutes'
        AND ${table.observedArrivalAt} <= ${table.receivedAt} + interval '2 minutes'`,
    ),
  ],
).enableRLS();

export const campusBusFeedbackRateLimits = pgTable(
  "campus_bus_feedback_rate_limits",
  {
    sessionId: uuid("session_id").primaryKey(),
    windowStartedAt: timestamp("window_started_at", {
      withTimezone: true,
    }).notNull(),
    submissionCount: integer("submission_count").notNull().default(0),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    index("campus_bus_feedback_rate_limits_expires_at_idx").on(table.expiresAt),
    check(
      "campus_bus_feedback_rate_limits_submission_count_chk",
      sql`${table.submissionCount} >= 0`,
    ),
  ],
).enableRLS();

export const campusBusPredictionModelRevisions = pgTable(
  "campus_bus_prediction_model_revisions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    algorithm: text("algorithm").notNull(),
    status: text("status").notNull(),
    runKind: text("run_kind").notNull().default("automated"),
    createdBy: uuid("created_by").references(() => users.id, {
      onDelete: "set null",
    }),
    parameters: jsonb("parameters")
      .notNull()
      .default(sql`'{}'::jsonb`),
    routeScope: text("route_scope"),
    parentRevisionId: uuid("parent_revision_id").references(
      (): AnyPgColumn => campusBusPredictionModelRevisions.id,
      { onDelete: "set null" },
    ),
    observationCutoffAt: timestamp("observation_cutoff_at", {
      withTimezone: true,
    }).notNull(),
    trainingWindowStart: timestamp("training_window_start", {
      withTimezone: true,
    }).notNull(),
    trainingWindowEnd: timestamp("training_window_end", {
      withTimezone: true,
    }).notNull(),
    trainingEventCount: integer("training_event_count").notNull(),
    trainingServiceDayCount: integer("training_service_day_count").notNull(),
    validationEventCount: integer("validation_event_count").notNull(),
    sourceObservationCount: integer("source_observation_count").notNull(),
    snapshotHash: text("snapshot_hash").notNull(),
    metrics: jsonb("metrics").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    promotedAt: timestamp("promoted_at", { withTimezone: true }),
  },
  (table) => [
    index("campus_bus_prediction_revisions_status_idx").on(
      table.status,
      table.promotedAt,
    ),
    index("campus_bus_prediction_revisions_parent_idx").on(
      table.parentRevisionId,
    ),
    index("campus_bus_prediction_revisions_creator_idx")
      .on(table.createdBy, table.createdAt)
      .where(sql`${table.createdBy} is not null`),
    index("campus_bus_prediction_revisions_kind_created_idx").on(
      table.runKind,
      table.createdAt,
    ),
    uniqueIndex("campus_bus_prediction_revisions_champion_uq")
      .on(table.status)
      .where(sql`${table.status} = 'champion'`),
    check(
      "campus_bus_prediction_revisions_status_chk",
      sql`${table.status} in ('candidate', 'champion', 'retired', 'insufficient')`,
    ),
    check(
      "campus_bus_prediction_revisions_run_kind_chk",
      sql`${table.runKind} in ('automated', 'experiment')`,
    ),
    check(
      "campus_bus_prediction_revisions_counts_chk",
      sql`${table.trainingEventCount} >= 0
        AND ${table.trainingServiceDayCount} >= 0
        AND ${table.validationEventCount} >= 0
        AND ${table.sourceObservationCount} >= 0`,
    ),
  ],
).enableRLS();

export const campusBusTripMatchCandidates = pgTable(
  "campus_bus_trip_match_candidates",
  {
    modelRevisionId: uuid("model_revision_id")
      .notNull()
      .references(() => campusBusPredictionModelRevisions.id, {
        onDelete: "cascade",
      }),
    observationId: uuid("observation_id")
      .notNull()
      .references(() => campusBusArrivalObservations.id, {
        onDelete: "cascade",
      }),
    patternId: text("pattern_id").notNull(),
    scheduledDepartureAt: timestamp("scheduled_departure_at", {
      withTimezone: true,
    }).notNull(),
    baselineArrivalAt: timestamp("baseline_arrival_at", {
      withTimezone: true,
    }).notNull(),
    probability: real("probability").notNull(),
    rank: integer("rank").notNull(),
  },
  (table) => [
    primaryKey({
      columns: [
        table.modelRevisionId,
        table.observationId,
        table.patternId,
        table.scheduledDepartureAt,
      ],
    }),
    index("campus_bus_trip_candidates_observation_idx").on(
      table.observationId,
      table.modelRevisionId,
    ),
    check(
      "campus_bus_trip_candidates_probability_chk",
      sql`${table.probability} > 0 AND ${table.probability} <= 1`,
    ),
    check("campus_bus_trip_candidates_rank_chk", sql`${table.rank} > 0`),
  ],
).enableRLS();

export const campusBusArrivalEvents = pgTable(
  "campus_bus_arrival_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    modelRevisionId: uuid("model_revision_id")
      .notNull()
      .references(() => campusBusPredictionModelRevisions.id, {
        onDelete: "cascade",
      }),
    eventKey: text("event_key").notNull(),
    routeId: text("route_id").notNull(),
    patternId: text("pattern_id").notNull(),
    stopOccurrenceId: text("stop_occurrence_id").notNull(),
    scheduledDepartureAt: timestamp("scheduled_departure_at", {
      withTimezone: true,
    }).notNull(),
    baselineArrivalAt: timestamp("baseline_arrival_at", {
      withTimezone: true,
    }).notNull(),
    observedArrivalAt: timestamp("observed_arrival_at", {
      withTimezone: true,
    }).notNull(),
    serviceDate: date("service_date").notNull(),
    residualSeconds: integer("residual_seconds").notNull(),
    observationCount: integer("observation_count").notNull(),
    confidence: real("confidence").notNull(),
  },
  (table) => [
    uniqueIndex("campus_bus_arrival_events_revision_key_uq").on(
      table.modelRevisionId,
      table.eventKey,
    ),
    index("campus_bus_arrival_events_training_idx").on(
      table.modelRevisionId,
      table.routeId,
      table.patternId,
      table.stopOccurrenceId,
      table.serviceDate,
    ),
    check(
      "campus_bus_arrival_events_observation_count_chk",
      sql`${table.observationCount} > 0`,
    ),
    check(
      "campus_bus_arrival_events_confidence_chk",
      sql`${table.confidence} > 0 AND ${table.confidence} <= 1`,
    ),
  ],
).enableRLS();

export const campusBusArrivalEventObservations = pgTable(
  "campus_bus_arrival_event_observations",
  {
    eventId: uuid("event_id")
      .notNull()
      .references(() => campusBusArrivalEvents.id, { onDelete: "cascade" }),
    observationId: uuid("observation_id")
      .notNull()
      .references(() => campusBusArrivalObservations.id, {
        onDelete: "cascade",
      }),
  },
  (table) => [
    primaryKey({ columns: [table.eventId, table.observationId] }),
    index("campus_bus_event_observations_observation_idx").on(
      table.observationId,
    ),
  ],
).enableRLS();

export const campusBusPredictionAdjustments = pgTable(
  "campus_bus_prediction_adjustments",
  {
    modelRevisionId: uuid("model_revision_id")
      .notNull()
      .references(() => campusBusPredictionModelRevisions.id, {
        onDelete: "cascade",
      }),
    routeId: text("route_id").notNull(),
    patternId: text("pattern_id").notNull(),
    stopOccurrenceId: text("stop_occurrence_id").notNull(),
    timeBand: text("time_band").notNull(),
    residualSeconds: integer("residual_seconds").notNull(),
    eventCount: integer("event_count").notNull(),
    serviceDayCount: integer("service_day_count").notNull(),
    medianResidualSeconds: integer("median_residual_seconds").notNull(),
    medianAbsoluteDeviationSeconds: integer(
      "median_absolute_deviation_seconds",
    ).notNull(),
    shrinkageWeight: real("shrinkage_weight").notNull(),
  },
  (table) => [
    primaryKey({
      columns: [
        table.modelRevisionId,
        table.routeId,
        table.patternId,
        table.stopOccurrenceId,
        table.timeBand,
      ],
    }),
    index("campus_bus_prediction_adjustments_lookup_idx").on(
      table.modelRevisionId,
      table.routeId,
    ),
    check(
      "campus_bus_prediction_adjustments_band_chk",
      sql`${table.timeBand} in ('morning_peak', 'midday', 'evening_peak', 'night', 'all_day')`,
    ),
    check(
      "campus_bus_prediction_adjustments_counts_chk",
      sql`${table.eventCount} > 0 AND ${table.serviceDayCount} > 0`,
    ),
    check(
      "campus_bus_prediction_adjustments_weight_chk",
      sql`${table.shrinkageWeight} > 0 AND ${table.shrinkageWeight} < 1`,
    ),
  ],
).enableRLS();

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
).enableRLS();

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
).enableRLS();

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
).enableRLS();

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
).enableRLS();

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
).enableRLS();

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
).enableRLS();

// Official AQS subject catalog. Names belong to the subject, not to every
// individual course, so keep them normalized in one database-backed catalog.
export const courseSubjects = pgTable("course_subjects", {
  code: text("code").primaryKey(),
  nameEn: text("name_en").notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}).enableRLS();

export const majors = pgTable("majors", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  faculty: text("faculty"),
  totalUnits: numeric("total_units"),
  normativeYears: integer("normative_years").notNull().default(4),
  handbookYear: text("handbook_year").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}).enableRLS();

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
).enableRLS();

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
).enableRLS();

// 版本对齐：旧课号 → 新课号别名映射（含 DSME→DOTE），摄取/解析前先重映射
export const courseAliases = pgTable("course_aliases", {
  oldCode: text("old_code").primaryKey(),
  newCode: text("new_code").notNull(),
}).enableRLS();

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
).enableRLS();

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
).enableRLS();

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
    language: text("language"),
    /** Free-form labels only; preset dimensions live in typed columns above. */
    customTags: jsonb("tags").$type<string[]>().notNull().default([]),
    isAnonymous: boolean("is_anonymous").notNull().default(false),
    /** Last time this user rated this course (refreshed on each upsert). */
    createdAt: timestamp("created_at").defaultNow().notNull(),
    /** First submission time for calendar-window growth metrics. */
    firstSubmittedAt: timestamp("first_submitted_at"),
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
    check(
      "course_ratings_language_check",
      sql`${table.language} is null or ${table.language} in ('mandarin', 'english', 'cantonese')`,
    ),
  ],
).enableRLS();

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
).enableRLS();

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
).enableRLS();

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
).enableRLS();

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
).enableRLS();

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
).enableRLS();

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
).enableRLS();

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
).enableRLS();

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
).enableRLS();

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
).enableRLS();

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
).enableRLS();

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
).enableRLS();

export const staffDepartments = pgTable("staff_departments", {
  id: text("id").primaryKey(),
  faculty: text("faculty").notNull(),
  name: text("name").notNull(),
  profileUrl: text("profile_url").notNull().unique(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
}).enableRLS();

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
).enableRLS();

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
).enableRLS();

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
).enableRLS();

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
).enableRLS();

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
).enableRLS();

export const professors = pgTable(
  "professors",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    searchText: text("search_text").notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [index("professors_search_text_idx").on(table.searchText)],
).enableRLS();

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
).enableRLS();

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
).enableRLS();

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
).enableRLS();

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
    vacancy: integer("vacancy"),
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
).enableRLS();

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
).enableRLS();

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
).enableRLS();

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
).enableRLS();

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
).enableRLS();

export const announcements = pgTable(
  "announcements",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    title: text("title").notNull(),
    content: text("content").notNull(),
    priority: integer("priority").notNull().default(0),
    publishedAt: timestamp("published_at"),
    withdrawnAt: timestamp("withdrawn_at"),
    expiresAt: timestamp("expires_at"),
    notifyOnPublish: boolean("notify_on_publish").notNull().default(false),
    notificationSentAt: timestamp("notification_sent_at"),
    createdBy: uuid("created_by").references(() => users.id, {
      onDelete: "set null",
    }),
    updatedBy: uuid("updated_by").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("announcements_publication_idx").on(
      table.publishedAt,
      table.expiresAt,
      table.priority,
    ),
    check(
      "announcements_expiry_after_publication_check",
      sql`${table.expiresAt} is null or ${table.publishedAt} is null or ${table.expiresAt} > ${table.publishedAt}`,
    ),
  ],
).enableRLS();

export const productUpdates = pgTable(
  "product_updates",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    title: text("title").notNull(),
    summary: text("summary").notNull(),
    content: text("content").notNull(),
    type: text("type").$type<ProductUpdateType>().notNull(),
    areas: text("areas").array().$type<ProductUpdateArea[]>().notNull(),
    publishedAt: timestamp("published_at").notNull(),
    createdBy: uuid("created_by").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("product_updates_publication_idx").on(table.publishedAt, table.id),
    check(
      "product_updates_type_check",
      sql`${table.type} in (${sql.raw(
        PRODUCT_UPDATE_TYPES.map((type) => `'${type}'`).join(", "),
      )})`,
    ),
    check(
      "product_updates_areas_nonempty_check",
      sql`cardinality(${table.areas}) > 0`,
    ),
    check(
      "product_updates_areas_allowed_check",
      sql`${table.areas} <@ array[${sql.raw(
        PRODUCT_UPDATE_AREAS.map((area) => `'${area}'`).join(", "),
      )}]::text[]`,
    ),
  ],
).enableRLS();

export const NOTIFICATION_KINDS = [
  "course_review_reply",
  "announcement_published",
] as const;
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];
export type CourseReviewReplyNotificationMetadata = {
  courseCode: string;
  reviewId: string;
  replyId: string;
};
export type AnnouncementNotificationMetadata = {
  announcementId: string;
  title: string;
};
export type NotificationMetadata =
  | CourseReviewReplyNotificationMetadata
  | AnnouncementNotificationMetadata;

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
    metadata: jsonb("metadata").$type<NotificationMetadata>().notNull(),
    announcementId: uuid("announcement_id"),
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
    uniqueIndex("notifications_announcement_recipient_uq")
      .on(table.announcementId, table.recipientId)
      .where(sql`${table.kind} = 'announcement_published'`),
    check(
      "notifications_kind_check",
      sql`${table.kind} in ('course_review_reply', 'announcement_published')`,
    ),
    check(
      "notifications_announcement_identity_check",
      sql`(${table.kind} = 'announcement_published' and ${table.announcementId} is not null) or (${table.kind} <> 'announcement_published' and ${table.announcementId} is null)`,
    ),
  ],
).enableRLS();

// ── Canteen subsystem (hard delete; no deletedAt — unlike wiki soft delete) ──

/** Visible meal-period tabs (never includes allday). */
export const MEAL_PERIODS = ["breakfast", "lunch", "dinner"] as const;
export type MealPeriod = (typeof MEAL_PERIODS)[number];

/** JavaScript weekday numbering interpreted in Asia/Hong_Kong (Sunday=0). */
export type HktWeekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

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
}).enableRLS();

export const CANTEEN_MENU_SOURCE_PROVIDERS = [
  "aigens",
  "ichef",
  "pinme",
  "qmai",
] as const;
export type CanteenMenuSourceProvider =
  (typeof CANTEEN_MENU_SOURCE_PROVIDERS)[number];

export type CanteenMenuSourceConfig = Record<string, unknown>;

export const canteenMenuSources = pgTable(
  "canteen_menu_sources",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    canteenId: uuid("canteen_id")
      .notNull()
      .references(() => canteens.id, { onDelete: "cascade" }),
    provider: text("provider").$type<CanteenMenuSourceProvider>().notNull(),
    /** Provider account/brand identity when the outlet ID is not global (Qmai). */
    externalOwnerId: text("external_owner_id"),
    externalStoreId: text("external_store_id").notNull(),
    config: jsonb("config")
      .$type<CanteenMenuSourceConfig>()
      .notNull()
      .default({}),
    /** HKT weekdays (Sunday=0) when recurring sync should skip this source. */
    closedWeekdays: integer("closed_weekdays")
      .array()
      .$type<HktWeekday[]>()
      .notNull()
      .default([]),
    /** Meal windows in which recurring sync should claim this source. */
    syncMealPeriods: text("sync_meal_periods")
      .array()
      .$type<MealPeriod[]>()
      .notNull()
      .default(["breakfast", "lunch", "dinner"]),
    enabled: boolean("enabled").notNull().default(true),
    /** Identifies the latest worker attempt; health writes are conditional on it. */
    lastAttemptId: uuid("last_attempt_id"),
    lastAttemptAt: timestamp("last_attempt_at", { withTimezone: true }),
    /** Durable lease token for the worker currently allowed to mutate this source. */
    syncClaimToken: uuid("sync_claim_token"),
    /** Database-time lease deadline; an expired claim may be atomically reclaimed. */
    syncClaimExpiresAt: timestamp("sync_claim_expires_at", {
      withTimezone: true,
    }),
    lastSuccessAt: timestamp("last_success_at", { withTimezone: true }),
    lastSnapshotHash: text("last_snapshot_hash"),
    observedState: text("observed_state"),
    lastErrorCode: text("last_error_code"),
    lastError: text("last_error"),
    /** Set once after an explicitly previewed legacy-menu adoption. */
    legacyTakeoverAt: timestamp("legacy_takeover_at", { withTimezone: true }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("canteen_menu_sources_canteen_uidx").on(table.canteenId),
    uniqueIndex("canteen_menu_sources_provider_owner_store_uidx").on(
      table.provider,
      sql`coalesce(${table.externalOwnerId}, '')`,
      table.externalStoreId,
    ),
    unique("canteen_menu_sources_id_canteen_uq").on(table.id, table.canteenId),
    index("canteen_menu_sources_enabled_idx").on(table.enabled),
    check(
      "canteen_menu_sources_provider_chk",
      sql`${table.provider} in ('aigens', 'ichef', 'pinme', 'qmai')`,
    ),
    check(
      "canteen_menu_sources_store_id_chk",
      sql`length(trim(${table.externalStoreId})) between 1 and 200`,
    ),
    check(
      "canteen_menu_sources_locator_chk",
      sql`(${table.provider} = 'qmai' and ${table.externalOwnerId} is not null and length(trim(${table.externalOwnerId})) between 1 and 200) or (${table.provider} <> 'qmai' and ${table.externalOwnerId} is null)`,
    ),
    check(
      "canteen_menu_sources_claim_chk",
      sql`(${table.syncClaimToken} is null) = (${table.syncClaimExpiresAt} is null)`,
    ),
    check(
      "canteen_menu_sources_closed_weekdays_chk",
      sql`${table.closedWeekdays} <@ array[0, 1, 2, 3, 4, 5, 6]::integer[] and cardinality(${table.closedWeekdays}) <= 7`,
    ),
    check(
      "canteen_menu_sources_sync_meal_periods_chk",
      sql`${table.syncMealPeriods} <@ array['breakfast', 'lunch', 'dinner']::text[] and cardinality(${table.syncMealPeriods}) between 1 and 3`,
    ),
  ],
).enableRLS();

export const CANTEEN_ORDERING_HANDOFF_PROVIDERS = [
  "aigens",
  "ichef",
  "pinme",
  "qmai",
  "external",
] as const;
export type CanteenOrderingHandoffProvider =
  (typeof CANTEEN_ORDERING_HANDOFF_PROVIDERS)[number];

export const canteenOrderingHandoffs = pgTable(
  "canteen_ordering_handoffs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    canteenId: uuid("canteen_id")
      .notNull()
      .references(() => canteens.id, { onDelete: "cascade" }),
    provider: text("provider")
      .$type<CanteenOrderingHandoffProvider>()
      .notNull(),
    url: text("url").notNull(),
    enabled: boolean("enabled").notNull().default(true),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("canteen_ordering_handoffs_canteen_uidx").on(table.canteenId),
    check(
      "canteen_ordering_handoffs_provider_chk",
      sql`${table.provider} in ('aigens', 'ichef', 'pinme', 'qmai', 'external')`,
    ),
    check(
      "canteen_ordering_handoffs_url_chk",
      sql`length(trim(${table.url})) between 1 and 2000`,
    ),
  ],
).enableRLS();

export const CANTEEN_MENU_SYNC_RUN_STATUSES = [
  "running",
  "applied",
  "unchanged",
  "failed",
] as const;
export type CanteenMenuSyncRunStatus =
  (typeof CANTEEN_MENU_SYNC_RUN_STATUSES)[number];

export const CANTEEN_MENU_SYNC_TERMINAL_STATUSES = [
  "applied",
  "unchanged",
  "failed",
] as const satisfies readonly CanteenMenuSyncRunStatus[];

export const canteenMenuSyncRuns = pgTable(
  "canteen_menu_sync_runs",
  {
    id: uuid("id").primaryKey(),
    menuSourceId: uuid("menu_source_id")
      .notNull()
      .references(() => canteenMenuSources.id, { onDelete: "cascade" }),
    status: text("status")
      .$type<CanteenMenuSyncRunStatus>()
      .notNull()
      .default("running"),
    snapshotHash: text("snapshot_hash"),
    itemCount: integer("item_count"),
    createdCount: integer("created_count"),
    updatedCount: integer("updated_count"),
    deactivatedCount: integer("deactivated_count"),
    /** Bounded, non-sensitive ID deltas and suspected replacement pairs. */
    observation: jsonb("observation")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    errorCode: text("error_code"),
    error: text("error"),
    startedAt: timestamp("started_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => [
    index("canteen_menu_sync_runs_source_started_idx").on(
      table.menuSourceId,
      table.startedAt,
    ),
    index("canteen_menu_sync_runs_status_started_idx").on(
      table.status,
      table.startedAt,
    ),
    index("canteen_menu_sync_runs_retention_idx")
      .on(table.completedAt, table.id)
      .where(sql`${table.completedAt} is not null`),
    check(
      "canteen_menu_sync_runs_status_chk",
      sql`${table.status} in (${sql.raw(
        CANTEEN_MENU_SYNC_RUN_STATUSES.map((status) => `'${status}'`).join(
          ", ",
        ),
      )})`,
    ),
    check(
      "canteen_menu_sync_runs_counts_chk",
      sql`(${table.itemCount} is null or ${table.itemCount} >= 0) and (${table.createdCount} is null or ${table.createdCount} >= 0) and (${table.updatedCount} is null or ${table.updatedCount} >= 0) and (${table.deactivatedCount} is null or ${table.deactivatedCount} >= 0)`,
    ),
  ],
).enableRLS();

export type CanteenMenuSyncSnapshotCompleteness = "complete" | "partial";
export type CanteenMenuSyncObservationScope = "catalog" | "meal-period";

export type CanteenMenuSyncSnapshotPriceOption = {
  label: string | null;
  amountMinor: number;
  currency: string;
  sortOrder: number;
};

export type CanteenMenuSyncSnapshotOccurrence = {
  mealPeriod: MealPeriodAssignment;
  categoryKey: string;
  sortOrder: number;
  priceOptions: CanteenMenuSyncSnapshotPriceOption[];
};

/** Immutable normalized provider evidence captured for one successful run. */
export const canteenMenuSyncSnapshots = pgTable(
  "canteen_menu_sync_snapshots",
  {
    runId: uuid("run_id")
      .primaryKey()
      .references(() => canteenMenuSyncRuns.id, { onDelete: "cascade" }),
    menuSourceId: uuid("menu_source_id")
      .notNull()
      .references(() => canteenMenuSources.id, { onDelete: "cascade" }),
    snapshotHash: text("snapshot_hash").notNull(),
    snapshotCompleteness: text("snapshot_completeness")
      .$type<CanteenMenuSyncSnapshotCompleteness>()
      .notNull(),
    observationScope: text("observation_scope")
      .$type<CanteenMenuSyncObservationScope>()
      .notNull()
      .default("catalog"),
    itemCount: integer("item_count").notNull(),
    syncWindowKey: text("sync_window_key").notNull(),
    mealPeriod: text("meal_period").$type<MealPeriod>().notNull(),
    hktWeekday: integer("hkt_weekday").$type<HktWeekday>().notNull(),
    observedMinuteOfDay: integer("observed_minute_of_day").notNull(),
    /** Bounded normalized provider scope evidence; never a raw response. */
    scopeEvidence: jsonb("scope_evidence")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    observedAt: timestamp("observed_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    index("canteen_menu_sync_snapshots_source_observed_idx").on(
      table.menuSourceId,
      table.observedAt,
    ),
    index("canteen_menu_sync_snapshots_retention_idx").on(
      table.observedAt,
      table.runId,
    ),
    index("canteen_menu_sync_snapshots_equivalent_window_idx").on(
      table.menuSourceId,
      table.hktWeekday,
      table.mealPeriod,
      table.observedMinuteOfDay,
    ),
    index("canteen_menu_sync_snapshots_scoped_latest_idx")
      .on(table.menuSourceId, table.mealPeriod, table.observedAt, table.runId)
      .where(sql`${table.observationScope} = 'meal-period'`),
    check(
      "canteen_menu_sync_snapshots_hash_chk",
      sql`length(${table.snapshotHash}) = 64`,
    ),
    check(
      "canteen_menu_sync_snapshots_completeness_chk",
      sql`${table.snapshotCompleteness} in ('complete', 'partial')`,
    ),
    check(
      "canteen_menu_sync_snapshots_observation_scope_chk",
      sql`${table.observationScope} in ('catalog', 'meal-period')`,
    ),
    check(
      "canteen_menu_sync_snapshots_item_count_chk",
      sql`${table.itemCount} >= 0`,
    ),
    check(
      "canteen_menu_sync_snapshots_meal_period_chk",
      sql`${table.mealPeriod} in ('breakfast', 'lunch', 'dinner')`,
    ),
    check(
      "canteen_menu_sync_snapshots_hkt_weekday_chk",
      sql`${table.hktWeekday} between 0 and 6`,
    ),
    check(
      "canteen_menu_sync_snapshots_minute_chk",
      sql`${table.observedMinuteOfDay} between 0 and 1439`,
    ),
  ],
).enableRLS();

export const canteenMenuSyncSnapshotItems = pgTable(
  "canteen_menu_sync_snapshot_items",
  {
    runId: uuid("run_id")
      .notNull()
      .references(() => canteenMenuSyncSnapshots.runId, {
        onDelete: "cascade",
      }),
    externalProductId: text("external_product_id").notNull(),
    name: text("name").notNull(),
    priceOptions: jsonb("price_options")
      .$type<CanteenMenuSyncSnapshotPriceOption[]>()
      .notNull()
      .default([]),
    mealPeriods: text("meal_periods")
      .array()
      .$type<MealPeriodAssignment[]>()
      .notNull(),
    sortOrder: integer("sort_order").notNull(),
    svgKey: text("svg_key").notNull(),
    occurrences: jsonb("occurrences")
      .$type<CanteenMenuSyncSnapshotOccurrence[]>()
      .notNull()
      .default([]),
  },
  (table) => [
    primaryKey({ columns: [table.runId, table.externalProductId] }),
    index("canteen_menu_sync_snapshot_items_product_idx").on(
      table.externalProductId,
      table.runId,
    ),
    check(
      "canteen_menu_sync_snapshot_items_external_id_chk",
      sql`length(trim(${table.externalProductId})) between 1 and 200`,
    ),
    check(
      "canteen_menu_sync_snapshot_items_name_chk",
      sql`length(trim(${table.name})) between 1 and 200`,
    ),
    check(
      "canteen_menu_sync_snapshot_items_svg_key_chk",
      sql`length(trim(${table.svgKey})) between 1 and 200`,
    ),
  ],
).enableRLS();

export const canteenMenuItems = pgTable(
  "canteen_menu_items",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    canteenId: uuid("canteen_id")
      .notNull()
      .references(() => canteens.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    /** Width/whitespace/ASCII-case key for the user-recognizable dish. */
    normalizedName: text("normalized_name"),
    price: integer("price"),
    mealPeriods: text("meal_periods")
      .array()
      .notNull()
      .default(sql`'{allday}'`),
    sortOrder: integer("sort_order").notNull().default(0),
    svgKey: text("svg_key").notNull().default("default"),
    /** Stable managed-menu owner. Null means this is a manually curated row. */
    menuSourceId: uuid("menu_source_id"),
    /** Provider-scoped offering identity; Aigens includes its offering period. */
    externalProductId: text("external_product_id"),
    /** Rollout shadow columns. New reconciliation does not use these as identity. */
    externalSource: text("external_source"),
    externalKey: text("external_key"),
    isAvailable: boolean("is_available").notNull().default(true),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("canteen_menu_items_canteen_id_idx").on(table.canteenId),
    index("canteen_menu_items_menu_source_id_idx").on(table.menuSourceId),
    unique("canteen_menu_items_id_canteen_uq").on(table.id, table.canteenId),
    uniqueIndex("canteen_menu_items_source_product_uidx")
      .on(table.menuSourceId, table.externalProductId)
      .where(
        sql`${table.menuSourceId} is not null and ${table.externalProductId} is not null`,
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
    check(
      "canteen_menu_items_source_product_identity_chk",
      sql`(${table.menuSourceId} is null) = (${table.externalProductId} is null)`,
    ),
    check(
      "canteen_menu_items_external_product_id_chk",
      sql`${table.externalProductId} is null or length(trim(${table.externalProductId})) between 1 and 200`,
    ),
    foreignKey({
      columns: [table.menuSourceId, table.canteenId],
      foreignColumns: [canteenMenuSources.id, canteenMenuSources.canteenId],
      name: "canteen_menu_items_source_canteen_fk",
    }),
  ],
).enableRLS();

export const canteensRelations = relations(canteens, ({ many, one }) => ({
  menuItems: many(canteenMenuItems),
  menuSource: one(canteenMenuSources),
  orderingHandoff: one(canteenOrderingHandoffs),
  importDrafts: many(menuImportDrafts),
  danmakuMessages: many(canteenDanmakuMessages),
  shameVotes: many(canteenShameVotes),
}));

export const canteenMenuSourcesRelations = relations(
  canteenMenuSources,
  ({ one, many }) => ({
    canteen: one(canteens, {
      fields: [canteenMenuSources.canteenId],
      references: [canteens.id],
    }),
    menuItems: many(canteenMenuItems),
    syncRuns: many(canteenMenuSyncRuns),
  }),
);

export const canteenMenuSyncRunsRelations = relations(
  canteenMenuSyncRuns,
  ({ one }) => ({
    menuSource: one(canteenMenuSources, {
      fields: [canteenMenuSyncRuns.menuSourceId],
      references: [canteenMenuSources.id],
    }),
  }),
);

export const canteenOrderingHandoffsRelations = relations(
  canteenOrderingHandoffs,
  ({ one }) => ({
    canteen: one(canteens, {
      fields: [canteenOrderingHandoffs.canteenId],
      references: [canteens.id],
    }),
  }),
);

export const canteenMenuItemsRelations = relations(
  canteenMenuItems,
  ({ one, many }) => ({
    canteen: one(canteens, {
      fields: [canteenMenuItems.canteenId],
      references: [canteens.id],
    }),
    menuSource: one(canteenMenuSources, {
      fields: [canteenMenuItems.menuSourceId],
      references: [canteenMenuSources.id],
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
).enableRLS();

export const canteenMenuItemPricesRelations = relations(
  canteenMenuItemPrices,
  ({ one }) => ({
    menuItem: one(canteenMenuItems, {
      fields: [canteenMenuItemPrices.menuItemId],
      references: [canteenMenuItems.id],
    }),
  }),
);

/** One upstream product/setting ID mapped to one canonical CUpedia dish UUID. */
export const canteenMenuProviderOfferings = pgTable(
  "canteen_menu_provider_offerings",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    canteenId: uuid("canteen_id").notNull(),
    menuSourceId: uuid("menu_source_id").notNull(),
    menuItemId: uuid("menu_item_id").notNull(),
    externalProductId: text("external_product_id").notNull(),
    providerName: text("provider_name").notNull(),
    normalizedName: text("normalized_name").notNull(),
    isAvailable: boolean("is_available").notNull().default(true),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    unique("canteen_menu_provider_offerings_source_product_uq").on(
      table.menuSourceId,
      table.externalProductId,
    ),
    index("canteen_menu_provider_offerings_item_idx").on(table.menuItemId),
    index("canteen_menu_provider_offerings_source_name_idx").on(
      table.menuSourceId,
      table.normalizedName,
    ),
    foreignKey({
      columns: [table.menuSourceId, table.canteenId],
      foreignColumns: [canteenMenuSources.id, canteenMenuSources.canteenId],
      name: "canteen_menu_provider_offerings_source_canteen_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.menuItemId, table.canteenId],
      foreignColumns: [canteenMenuItems.id, canteenMenuItems.canteenId],
      name: "canteen_menu_provider_offerings_item_canteen_fk",
    }).onDelete("cascade"),
    check(
      "canteen_menu_provider_offerings_external_id_chk",
      sql`length(trim(${table.externalProductId})) between 1 and 200`,
    ),
    check(
      "canteen_menu_provider_offerings_name_chk",
      sql`length(trim(${table.providerName})) between 1 and 200 and length(trim(${table.normalizedName})) between 1 and 200`,
    ),
  ],
).enableRLS();

/** Current provider facts for one offering in one meal-period occurrence. */
export const canteenMenuOfferingOccurrences = pgTable(
  "canteen_menu_offering_occurrences",
  {
    offeringId: uuid("offering_id")
      .notNull()
      .references(() => canteenMenuProviderOfferings.id, {
        onDelete: "cascade",
      }),
    mealPeriod: text("meal_period").$type<MealPeriodAssignment>().notNull(),
    categoryKey: text("category_key").notNull(),
    sortOrder: integer("sort_order").notNull(),
    priceOptions: jsonb("price_options")
      .$type<CanteenMenuSyncSnapshotPriceOption[]>()
      .notNull()
      .default([]),
    observedAt: timestamp("observed_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.offeringId, table.mealPeriod, table.categoryKey],
    }),
    index("canteen_menu_offering_occurrences_period_idx").on(
      table.mealPeriod,
      table.offeringId,
    ),
    check(
      "canteen_menu_offering_occurrences_period_chk",
      sql`${table.mealPeriod} in ('breakfast', 'lunch', 'dinner', 'allday')`,
    ),
    check(
      "canteen_menu_offering_occurrences_category_chk",
      sql`length(trim(${table.categoryKey})) between 1 and 200`,
    ),
  ],
).enableRLS();

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
).enableRLS();

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
).enableRLS();

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
).enableRLS();

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
).enableRLS();

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
).enableRLS();

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
).enableRLS();

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
}).enableRLS();

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
).enableRLS();

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
).enableRLS();

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
