import { describe, it, expect } from "vitest";
import { getTableColumns } from "drizzle-orm";
import { getTableConfig } from "drizzle-orm/pg-core";
import {
  users,
  wikiDrafts,
  wikiPages,
  wikiRevisions,
  sessions,
  wikiLinks,
  canteens,
  canteenMenuItems,
  canteenMenuItemPrices,
  canteenDishVotes,
  canteenDishComments,
  canteenShameVotes,
  adminAuditLogs,
  menuImportDrafts,
  danmakuMessages,
  courseRatings,
  courseInstructors,
  courseRatingProfessors,
  professorCourses,
  courseReviews,
  courseReviewReplies,
  announcements,
  notifications,
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
    expect("slug" in cols).toBe(false);
    expect(cols.title).toBeDefined();
    expect(cols.content).toBeDefined();
    expect(cols.parentId).toBeDefined();
    expect(cols.deletedAt).toBeDefined();
    expect(cols.createdBy).toBeDefined();
    expect(cols.updatedBy).toBeDefined();
    expect(cols.version).toBeDefined();
    expect(cols.contentGeneration).toBeDefined();
  });

  it("wikiDrafts stores owner-private autosave state separately from public pages", () => {
    const cols = getTableColumns(wikiDrafts);
    expect(cols.title).toBeDefined();
    expect(cols.content).toBeDefined();
    expect(cols.icon).toBeDefined();
    expect(cols.parentId).toBeDefined();
    expect(cols.createdBy).toBeDefined();
    expect(cols.version).toBeDefined();
    expect(cols.updatedAt).toBeDefined();
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
    expect(cols.mealPeriods).toBeDefined();
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

  it("canteenShameVotes table is append-only with HKT voteDate", () => {
    const cols = getTableColumns(canteenShameVotes);
    expect(cols.canteenId).toBeDefined();
    expect(cols.userId).toBeDefined();
    expect(cols.anonymousSessionId).toBeDefined();
    expect(cols.voteDate).toBeDefined();
    expect(cols.createdAt).toBeDefined();
    expect("vote" in cols).toBe(false);
  });

  it("canteenDishComments table has required fields", () => {
    const cols = getTableColumns(canteenDishComments);
    expect(cols.menuItemId).toBeDefined();
    expect(cols.userId).toBeDefined();
    expect(cols.content).toBeDefined();
    expect("moderationStatus" in cols).toBe(false);
  });

  it("adminAuditLogs preserves actor and target snapshots", () => {
    const cols = getTableColumns(adminAuditLogs);
    expect(cols.actorUserId).toBeDefined();
    expect(cols.actorEmail).toBeDefined();
    expect(cols.actorNickname).toBeDefined();
    expect(cols.action).toBeDefined();
    expect(cols.targetType).toBeDefined();
    expect(cols.targetId).toBeDefined();
    expect(cols.targetUserId).toBeDefined();
    expect(cols.details).toBeDefined();
    expect(cols.createdAt).toBeDefined();
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

  it("courseRatings stores structured course experience tags", () => {
    const cols = getTableColumns(courseRatings);
    expect(cols.workload).toBeDefined();
    expect(cols.grade).toBeDefined();
    expect(cols.enrollment).toBeDefined();
    expect(cols.attendance).toBeDefined();
    expect(cols.language).toBeDefined();
    expect(cols.customTags).toBeDefined();
    expect(cols.instructorPersonId).toBeDefined();
  });

  it("course instructor references coexist with legacy professor ids during migration", () => {
    expect(getTableColumns(courseInstructors).personId).toBeDefined();
    expect(getTableColumns(professorCourses).instructorPersonId).toBeDefined();
    expect(
      getTableColumns(courseRatingProfessors).instructorPersonId,
    ).toBeDefined();
    expect(getTableColumns(courseReviews).instructorPersonId).toBeDefined();
  });

  it("multi-professor ratings use canonical instructor identity", () => {
    const cols = getTableColumns(courseRatingProfessors);
    expect(cols.instructorPersonId.notNull).toBe(true);
    expect(cols.professorId.notNull).toBe(false);
  });

  it("course review replies belong directly to a review author", () => {
    const reviewCols = getTableColumns(courseReviews);
    const replyCols = getTableColumns(courseReviewReplies);
    expect(reviewCols.updatedAt).toBeDefined();
    expect(replyCols.reviewId).toBeDefined();
    expect(replyCols.userId).toBeDefined();
    expect(replyCols.content).toBeDefined();
    expect(replyCols.createdAt).toBeDefined();
  });

  it("notifications keep generic metadata, read state, and announcement identity", () => {
    const cols = getTableColumns(notifications);
    const config = getTableConfig(notifications);
    expect(cols.recipientId).toBeDefined();
    expect(cols.actorId).toBeDefined();
    expect(cols.kind).toBeDefined();
    expect(cols.metadata).toBeDefined();
    expect(cols.announcementId).toBeDefined();
    expect(cols.readAt).toBeDefined();
    expect(cols.createdAt).toBeDefined();
    expect("reviewId" in cols).toBe(false);
    expect("replyId" in cols).toBe(false);
    expect(
      config.checks.some(
        (constraint) =>
          constraint.name === "notifications_announcement_identity_check",
      ),
    ).toBe(true);
    expect(
      config.foreignKeys.some((foreignKey) =>
        foreignKey.reference().columns.includes(cols.announcementId),
      ),
    ).toBe(false);
  });

  it("announcements keep publication, expiry, priority, and notification state", () => {
    const cols = getTableColumns(announcements);
    expect(cols.title).toBeDefined();
    expect(cols.content).toBeDefined();
    expect(cols.priority).toBeDefined();
    expect(cols.publishedAt).toBeDefined();
    expect(cols.withdrawnAt).toBeDefined();
    expect(cols.expiresAt).toBeDefined();
    expect(cols.notifyOnPublish).toBeDefined();
    expect(cols.notificationSentAt).toBeDefined();
    expect(cols.createdBy).toBeDefined();
    expect(cols.updatedBy).toBeDefined();
  });
});
