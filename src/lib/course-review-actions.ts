"use server";

import { and, count, desc, eq, inArray, or, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/db";
import {
  courseRatings,
  courseReviewLikes,
  courseReviews,
  courses,
} from "@/db/schema";
import { getOptionalUser, requireAuth } from "@/lib/auth-guard";
import type { Course } from "@/app/(main)/courses/course-types";

// ─────────────────────────────────────────────────────────────────────────
// Data-access layer for the course-review feature (#178).
//
// The catalog is the real `courses` table (4.8k rows, ingested by the
// course-tree scraper — ADR 0005). User-generated ratings/reviews/likes live
// in their own tables, anchored by course code (text, no FK — codes are the
// stable anchor). The exported types are the contract the pages/components
// depend on.
// ─────────────────────────────────────────────────────────────────────────

/** Max courses returned per list query — the catalog is too large to dump. */
const PAGE_SIZE = 48;

/** A review as presented to the client. Author identity is never exposed —
 * comments are anonymous — but ownership/like state for the *current* viewer
 * is resolved server-side so the UI can show withdraw/like-toggle affordances. */
export type CourseReviewView = {
  id: string;
  content: string;
  createdAt: string;
  likeCount: number;
  likedByMe: boolean;
  isOwn: boolean;
};

/** A course plus aggregated user stats for list/detail rendering. */
export type CourseView = Course & {
  reviewCount: number;
  /** User-average rating (one decimal), or null when nobody has rated yet. */
  rating: number | null;
  ratingCount: number;
};

export type CourseRatingState = {
  /** User-average rating, or null when nobody has rated yet. */
  aggregateRating: number | null;
  ratingCount: number;
  /** The user's most recent score on this course, if any. */
  lastScore: number | null;
  /** How many times the current user has rated this course. */
  myRatingCount: number;
};

export type CourseFilter = {
  /** "1" | "2" | "3" | "other" (4+ credits). */
  credits?: string;
  /** Free-text query against course code or title. */
  query?: string;
};

// ── Course row projection ──

const courseCols = {
  code: courses.code,
  subject: courses.subject,
  title: courses.title,
  units: courses.units,
  description: courses.description,
  terms: courses.terms,
};

type CourseRow = {
  code: string;
  subject: string;
  title: string;
  units: string | null; // numeric → string in drizzle
  description: string | null;
  terms: string[] | null;
};

function toCourse(r: CourseRow): Course {
  return {
    code: r.code,
    subject: r.subject,
    title: r.title,
    units: Number(r.units ?? 0),
    description: r.description ?? "",
    terms: r.terms ?? [],
  };
}

// ── Helpers (internal) ──

function normalizeCode(value: string): string {
  return value.replace(/\s+/g, "").toUpperCase();
}

async function findCourse(code: string): Promise<Course | null> {
  const [row] = await db
    .select(courseCols)
    .from(courses)
    .where(eq(courses.code, normalizeCode(code)))
    .limit(1);
  return row ? toCourse(row) : null;
}

function roundScore(score: number): number {
  return Math.round(score * 10) / 10;
}

function validateScore(score: number): void {
  const rounded = roundScore(score);
  if (rounded < 0 || rounded > 10) {
    throw new Error("评分须在 0 到 10 之间");
  }
}

/** credits bucket → SQL predicate on the numeric `units` column. */
function creditsCondition(credits?: string) {
  if (!credits) return undefined;
  if (credits === "other") return sql`${courses.units} >= 4`;
  const n = Number(credits);
  return Number.isFinite(n) ? sql`${courses.units} = ${n}` : undefined;
}

async function ratingAggFor(
  courseCode: string,
): Promise<{ avg: number; cnt: number }> {
  const [row] = await db
    .select({
      avg: sql<string | null>`avg(${courseRatings.score})`,
      cnt: count(),
    })
    .from(courseRatings)
    .where(eq(courseRatings.courseCode, courseCode));
  return { avg: Number(row?.avg ?? 0), cnt: Number(row?.cnt ?? 0) };
}

/** Attach rating/review aggregates to catalog rows, preserving their order.
 * Two grouped queries cover the whole page — no per-course round trips. */
async function buildViews(rows: CourseRow[]): Promise<CourseView[]> {
  if (rows.length === 0) return [];
  const codes = rows.map((r) => r.code);
  const [ratingRows, reviewRows] = await Promise.all([
    db
      .select({
        code: courseRatings.courseCode,
        avg: sql<string | null>`avg(${courseRatings.score})`,
        cnt: count(),
      })
      .from(courseRatings)
      .where(inArray(courseRatings.courseCode, codes))
      .groupBy(courseRatings.courseCode),
    db
      .select({ code: courseReviews.courseCode, cnt: count() })
      .from(courseReviews)
      .where(inArray(courseReviews.courseCode, codes))
      .groupBy(courseReviews.courseCode),
  ]);
  const ratingMap = new Map(
    ratingRows.map((r) => [
      r.code,
      { avg: Number(r.avg ?? 0), cnt: Number(r.cnt) },
    ]),
  );
  const reviewMap = new Map(reviewRows.map((r) => [r.code, Number(r.cnt)]));

  return rows.map((r) => {
    const agg = ratingMap.get(r.code) ?? { avg: 0, cnt: 0 };
    return {
      ...toCourse(r),
      rating: agg.cnt > 0 ? roundScore(agg.avg) : null,
      ratingCount: agg.cnt,
      reviewCount: reviewMap.get(r.code) ?? 0,
    };
  });
}

// ── Course reads ──

/** List courses. A free-text query searches code + title (code-prefix hits
 * ranked first). With no query, courses that already have ratings/reviews
 * surface first, falling back to the first catalog page so nothing is empty. */
export async function getCourses(
  filter: CourseFilter = {},
): Promise<CourseView[]> {
  const q = filter.query?.trim() ?? "";
  const creditsCond = creditsCondition(filter.credits);

  let rows: CourseRow[];
  if (q) {
    const like = `%${q.toLowerCase()}%`;
    const codeLike = `%${normalizeCode(q).toLowerCase()}%`;
    const codePrefix = `${normalizeCode(q).toLowerCase()}%`;
    rows = await db
      .select(courseCols)
      .from(courses)
      .where(
        and(
          or(
            sql`lower(${courses.code}) like ${codeLike}`,
            sql`lower(${courses.title}) like ${like}`,
          ),
          creditsCond,
        ),
      )
      .orderBy(
        sql`case when lower(${courses.code}) like ${codePrefix} then 0 else 1 end`,
        courses.code,
      )
      .limit(PAGE_SIZE);
  } else {
    // Rank by how much user activity each course has; blank slate → catalog head.
    const [ratingAgg, reviewAgg] = await Promise.all([
      db
        .select({ code: courseRatings.courseCode, cnt: count() })
        .from(courseRatings)
        .groupBy(courseRatings.courseCode),
      db
        .select({ code: courseReviews.courseCode, cnt: count() })
        .from(courseReviews)
        .groupBy(courseReviews.courseCode),
    ]);
    const activity = new Map<string, number>();
    for (const r of [...ratingAgg, ...reviewAgg]) {
      activity.set(r.code, (activity.get(r.code) ?? 0) + Number(r.cnt));
    }
    const activeCodes = [...activity.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, PAGE_SIZE)
      .map(([code]) => code);

    if (activeCodes.length) {
      rows = await db
        .select(courseCols)
        .from(courses)
        .where(and(inArray(courses.code, activeCodes), creditsCond));
      rows.sort(
        (a, b) => (activity.get(b.code) ?? 0) - (activity.get(a.code) ?? 0),
      );
    } else {
      rows = await db
        .select(courseCols)
        .from(courses)
        .where(creditsCond)
        .orderBy(courses.code)
        .limit(PAGE_SIZE);
    }
  }

  return buildViews(rows);
}

/** Fetch a single course by code (space-insensitive), or null if unknown. */
export async function getCourse(code: string): Promise<CourseView | null> {
  const rows = await db
    .select(courseCols)
    .from(courses)
    .where(eq(courses.code, normalizeCode(code)))
    .limit(1);
  const [view] = await buildViews(rows);
  return view ?? null;
}

/** Rating UI state for the detail page: aggregate score + this user's vote. */
export async function getCourseRatingState(
  code: string,
): Promise<CourseRatingState | null> {
  const course = await findCourse(code);
  if (!course) return null;

  const [agg, user] = await Promise.all([
    ratingAggFor(course.code),
    getOptionalUser(),
  ]);
  const aggregateRating = agg.cnt > 0 ? roundScore(agg.avg) : null;
  const ratingCount = agg.cnt;

  if (!user) {
    return { aggregateRating, ratingCount, lastScore: null, myRatingCount: 0 };
  }

  const myRatings = await db
    .select({ score: courseRatings.score })
    .from(courseRatings)
    .where(
      and(
        eq(courseRatings.courseCode, course.code),
        eq(courseRatings.userId, user.id),
      ),
    );

  return {
    aggregateRating,
    ratingCount,
    lastScore: myRatings[0]?.score ?? null,
    myRatingCount: myRatings.length,
  };
}

/** Reviews for a course, newest first, with per-viewer like/ownership state. */
export async function getCourseReviews(
  code: string,
): Promise<CourseReviewView[]> {
  const course = await findCourse(code);
  if (!course) return [];

  const [rows, user] = await Promise.all([
    db
      .select()
      .from(courseReviews)
      .where(eq(courseReviews.courseCode, course.code))
      .orderBy(desc(courseReviews.createdAt)),
    getOptionalUser(),
  ]);
  if (rows.length === 0) return [];

  const viewerId = user?.id ?? null;
  const ids = rows.map((r) => r.id);

  const likeRows = await db
    .select({ reviewId: courseReviewLikes.reviewId, cnt: count() })
    .from(courseReviewLikes)
    .where(inArray(courseReviewLikes.reviewId, ids))
    .groupBy(courseReviewLikes.reviewId);
  const likeCount = new Map(likeRows.map((r) => [r.reviewId, Number(r.cnt)]));

  const mine = viewerId
    ? new Set(
        (
          await db
            .select({ reviewId: courseReviewLikes.reviewId })
            .from(courseReviewLikes)
            .where(
              and(
                inArray(courseReviewLikes.reviewId, ids),
                eq(courseReviewLikes.userId, viewerId),
              ),
            )
        ).map((r) => r.reviewId),
      )
    : new Set<string>();

  return rows.map((r) => ({
    id: r.id,
    content: r.content,
    createdAt: r.createdAt.toISOString(),
    likeCount: likeCount.get(r.id) ?? 0,
    likedByMe: mine.has(r.id),
    isOwn: viewerId ? r.userId === viewerId : false,
  }));
}

// ── Mutations (require auth) ──

/** Submit a score for a course. Same user may rate multiple times, but not
 * within RATING_COOLDOWN_MS of their previous rating on this course. */
export async function submitCourseRating(
  code: string,
  score: number,
): Promise<void> {
  const user = await requireAuth();
  validateScore(score);
  const normalizedScore = roundScore(score);

  const course = await findCourse(code);
  if (!course) throw new Error("课程不存在");

  // One vote per user: a re-rate updates the existing row instead of appending,
  // so the average isn't self-skewed.
  await db
    .insert(courseRatings)
    .values({
      courseCode: course.code,
      userId: user.id,
      score: normalizedScore,
    })
    .onConflictDoUpdate({
      target: [courseRatings.courseCode, courseRatings.userId],
      set: { score: normalizedScore, createdAt: sql`now()` },
    });

  revalidatePath(`/courses/${course.code}`);
  revalidatePath("/courses");
}

/** Post an anonymous review on a course. Requires login. */
export async function addReview(code: string, content: string): Promise<void> {
  const user = await requireAuth();
  const trimmed = content.trim();
  if (!trimmed) throw new Error("评论内容不能为空");
  if (trimmed.length > 2000) throw new Error("评论内容过长");

  const course = await findCourse(code);
  if (!course) throw new Error("课程不存在");

  await db.insert(courseReviews).values({
    courseCode: course.code,
    userId: user.id,
    content: trimmed,
  });

  revalidatePath(`/courses/${course.code}`);
  revalidatePath("/courses");
}

/** Withdraw a review. Only the original author (or an admin) may do so. */
export async function deleteReview(reviewId: string): Promise<void> {
  const user = await requireAuth();
  const [review] = await db
    .select({
      userId: courseReviews.userId,
      courseCode: courseReviews.courseCode,
    })
    .from(courseReviews)
    .where(eq(courseReviews.id, reviewId))
    .limit(1);
  if (!review) throw new Error("评论不存在");
  if (review.userId !== user.id && user.role !== "admin") {
    throw new Error("无权撤回该评论");
  }

  await db.delete(courseReviews).where(eq(courseReviews.id, reviewId));

  revalidatePath(`/courses/${review.courseCode}`);
  revalidatePath("/courses");
}

/** Toggle the current user's like on a review. Returns the new like count. */
export async function toggleLike(reviewId: string): Promise<number> {
  const user = await requireAuth();
  const [review] = await db
    .select({ courseCode: courseReviews.courseCode })
    .from(courseReviews)
    .where(eq(courseReviews.id, reviewId))
    .limit(1);
  if (!review) throw new Error("评论不存在");

  const [existing] = await db
    .select({ userId: courseReviewLikes.userId })
    .from(courseReviewLikes)
    .where(
      and(
        eq(courseReviewLikes.reviewId, reviewId),
        eq(courseReviewLikes.userId, user.id),
      ),
    )
    .limit(1);

  if (existing) {
    await db
      .delete(courseReviewLikes)
      .where(
        and(
          eq(courseReviewLikes.reviewId, reviewId),
          eq(courseReviewLikes.userId, user.id),
        ),
      );
  } else {
    await db.insert(courseReviewLikes).values({ reviewId, userId: user.id });
  }

  const [c] = await db
    .select({ cnt: count() })
    .from(courseReviewLikes)
    .where(eq(courseReviewLikes.reviewId, reviewId));

  revalidatePath(`/courses/${review.courseCode}`);
  return Number(c?.cnt ?? 0);
}
