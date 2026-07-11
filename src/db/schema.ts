import {
  pgTable,
  text,
  timestamp,
  uuid,
  boolean,
  integer,
  numeric,
  jsonb,
  index,
  primaryKey,
} from "drizzle-orm/pg-core";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

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
