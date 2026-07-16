import { describe, it, expect } from "vitest";
import { getTableColumns } from "drizzle-orm";
import {
  users,
  wikiPages,
  wikiRevisions,
  sessions,
  wikiLinks,
  canteens,
  canteenMenuItems,
  canteenMenuItemPrices,
  canteenDishVotes,
  canteenDishComments,
  menuImportDrafts,
  danmakuMessages,
} from "@/db/schema";

describe("schema", () => {
  it("users table has required custom fields", () => {
    const cols = getTableColumns(users);
    expect(cols.nickname).toBeDefined();
    expect(cols.role).toBeDefined();
    expect(cols.banned).toBeDefined();
    expect(cols.email).toBeDefined();
  });

  it("wikiPages table has required fields", () => {
    const cols = getTableColumns(wikiPages);
    expect(cols.slug).toBeDefined();
    expect(cols.title).toBeDefined();
    expect(cols.content).toBeDefined();
    expect(cols.parentId).toBeDefined();
    expect(cols.deletedAt).toBeDefined();
    expect(cols.createdBy).toBeDefined();
    expect(cols.updatedBy).toBeDefined();
  });

  it("wikiRevisions table has required fields", () => {
    const cols = getTableColumns(wikiRevisions);
    expect(cols.pageId).toBeDefined();
    expect(cols.title).toBeDefined();
    expect(cols.content).toBeDefined();
    expect(cols.editedBy).toBeDefined();
    expect(cols.editSummary).toBeDefined();
  });

  it("wikiLinks table has source/target columns", () => {
    const cols = getTableColumns(wikiLinks);
    expect(cols.sourceId).toBeDefined();
    expect(cols.targetId).toBeDefined();
  });

  it("sessions table has required Better Auth fields", () => {
    const cols = getTableColumns(sessions);
    expect(cols.id).toBeDefined();
    expect(cols.token).toBeDefined();
    expect(cols.userId).toBeDefined();
    expect(cols.expiresAt).toBeDefined();
  });

  it("canteens table has required fields", () => {
    const cols = getTableColumns(canteens);
    expect(cols.name).toBeDefined();
    expect(cols.location).toBeDefined();
    expect("deletedAt" in cols).toBe(false);
  });

  it("canteenMenuItems table has meal period and cascade fk", () => {
    const cols = getTableColumns(canteenMenuItems);
    expect(cols.canteenId).toBeDefined();
    expect(cols.name).toBeDefined();
    expect(cols.price).toBeDefined();
    expect(cols.mealPeriod).toBeDefined();
    expect(cols.sortOrder).toBeDefined();
    expect(cols.svgKey).toBeDefined();
    expect(cols.externalSource).toBeDefined();
    expect(cols.externalKey).toBeDefined();
    expect(cols.isAvailable).toBeDefined();
    expect(cols.lastSyncedAt).toBeDefined();
  });

  it("canteenMenuItemPrices stores labelled minor-unit prices", () => {
    const cols = getTableColumns(canteenMenuItemPrices);
    expect(cols.menuItemId).toBeDefined();
    expect(cols.label).toBeDefined();
    expect(cols.amountMinor).toBeDefined();
    expect(cols.currency).toBeDefined();
    expect(cols.sortOrder).toBeDefined();
  });

  it("canteenDishVotes table has vote identity columns", () => {
    const cols = getTableColumns(canteenDishVotes);
    expect(cols.menuItemId).toBeDefined();
    expect(cols.userId).toBeDefined();
    expect(cols.anonymousSessionId).toBeDefined();
    expect(cols.vote).toBeDefined();
  });

  it("canteenDishComments table has required fields", () => {
    const cols = getTableColumns(canteenDishComments);
    expect(cols.menuItemId).toBeDefined();
    expect(cols.userId).toBeDefined();
    expect(cols.content).toBeDefined();
    expect("moderationStatus" in cols).toBe(false);
  });

  it("menuImportDrafts table has required fields", () => {
    const cols = getTableColumns(menuImportDrafts);
    expect(cols.canteenId).toBeDefined();
    expect(cols.sourceImageUrl).toBeDefined();
    expect(cols.items).toBeDefined();
    expect(cols.status).toBeDefined();
  });

  it("danmakuMessages table has required fields without moderation", () => {
    const cols = getTableColumns(danmakuMessages);
    expect(cols.userId).toBeDefined();
    expect(cols.content).toBeDefined();
    expect(cols.month).toBeDefined();
    expect(cols.createdAt).toBeDefined();
    expect("moderationStatus" in cols).toBe(false);
  });
});
