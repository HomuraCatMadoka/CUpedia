import {
  pgTable,
  text,
  timestamp,
  uuid,
  boolean,
  integer,
  jsonb,
  index,
  uniqueIndex,
  check,
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
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("canteen_menu_items_canteen_id_idx").on(table.canteenId),
    index("canteen_menu_items_canteen_meal_idx").on(
      table.canteenId,
      table.mealPeriod,
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
    votes: many(canteenDishVotes),
    comments: many(canteenDishComments),
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
    items: jsonb("items").notNull().$type<import("@/lib/canteen-types").MenuImportDraftItem[]>(),
    status: text("status").notNull().default("ready"),
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("menu_import_drafts_canteen_id_idx").on(table.canteenId),
  ],
);

export const menuImportDraftsRelations = relations(menuImportDrafts, ({ one }) => ({
  canteen: one(canteens, {
    fields: [menuImportDrafts.canteenId],
    references: [canteens.id],
  }),
}));
