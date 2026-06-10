import { describe, it, expect } from "vitest";
import { getTableColumns } from "drizzle-orm";
import {
  users,
  wikiPages,
  wikiRevisions,
  sessions,
  wikiLinks,
  courses,
  courseReviews,
  courseReviewVotes,
  courseAggregates,
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

  it("courses table has required fields", () => {
    const cols = getTableColumns(courses);
    expect(cols.code).toBeDefined();
    expect(cols.title).toBeDefined();
    expect(cols.department).toBeDefined();
    expect(cols.credits).toBeDefined();
    expect(cols.description).toBeDefined();
  });

  it("courseReviews table has required fields", () => {
    const cols = getTableColumns(courseReviews);
    expect(cols.courseId).toBeDefined();
    expect(cols.userId).toBeDefined();
    expect(cols.rating).toBeDefined();
    expect(cols.difficulty).toBeDefined();
    expect(cols.workload).toBeDefined();
    expect(cols.grading).toBeDefined();
    expect(cols.content).toBeDefined();
    expect(cols.helpfulScore).toBeDefined();
  });

  it("courseReviewVotes table has required fields", () => {
    const cols = getTableColumns(courseReviewVotes);
    expect(cols.reviewId).toBeDefined();
    expect(cols.userId).toBeDefined();
    expect(cols.value).toBeDefined();
  });

  it("courseAggregates table has materialized review totals", () => {
    const cols = getTableColumns(courseAggregates);
    expect(cols.courseId).toBeDefined();
    expect(cols.reviewCount).toBeDefined();
    expect(cols.ratingSum).toBeDefined();
    expect(cols.difficultySum).toBeDefined();
    expect(cols.workloadSum).toBeDefined();
    expect(cols.gradingSum).toBeDefined();
  });
});
