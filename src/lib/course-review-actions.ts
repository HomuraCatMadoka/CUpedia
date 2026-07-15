"use server";

import { and, count, desc, eq, ilike, inArray, ne, or, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/db";
import {
  courseRatings,
  courseEnrollments,
  courseReviewLikes,
  courseReviews,
  courses,
  professorCourses,
  professors,
} from "@/db/schema";
import { getOptionalUser, requireAuth } from "@/lib/auth-guard";
import { COURSE_TERMS, type CourseTerm } from "@/lib/course-review-constants";
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

/** Courses rendered per catalog page — the full catalog has ~4.8k rows. */
const PAGE_SIZE = 48;

/** A review as presented to the client. Author identity is never exposed —
 * comments are anonymous — but ownership/like state for the *current* viewer
 * is resolved server-side so the UI can show withdraw/like-toggle affordances. */
export type CourseReviewView = {
  id: string;
  isRatingOnly: boolean;
  content: string;
  createdAt: string;
  likeCount: number;
  likedByMe: boolean;
  canAdminDelete: boolean;
  professorName: string | null;
  academicYear: string | null;
  term: CourseTerm | null;
  score: number | null;
};

export type ProfessorOption = { id: string; name: string };

export type CourseReviewSubmission = {
  academicYear: string;
  term: CourseTerm;
  professorId: string;
  score: number;
  content?: string;
};

export type CourseEnrollmentView = {
  academicYear: string;
  term: string;
  section: string | null;
  enrolled: number;
  quota: number;
  instructors: string[];
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
  lastAcademicYear: string | null;
  lastTerm: CourseTerm | null;
  lastProfessor: ProfessorOption | null;
  lastContent: string;
  /** How many times the current user has rated this course. */
  myRatingCount: number;
};

export type CourseFilter = {
  /** "0" | "1" | "2" | "3" (the 98% of courses); "other" (4+) still honored. */
  credits?: string;
  /** Free-text query against course code or title. */
  query?: string;
  /** Real `subject` code (e.g. "CSCI"). When set, browse the whole subject. */
  subject?: string;
  /** Course level by leading digit: "1000".."4000", or "5000" for 5000+ (postgrad). */
  level?: string;
  /** One-based catalog page. */
  page?: number;
};

export type CoursePage = {
  courses: CourseView[];
  total: number;
  page: number;
  pageSize: number;
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
  if (
    !Number.isFinite(score) ||
    score < 0.5 ||
    score > 5 ||
    !Number.isInteger(score * 2)
  ) {
    throw new Error("评分须为 0.5 到 5 星，并以半星递增");
  }
}

function validateAcademicYear(value: string): void {
  const match = /^(\d{4})-(\d{2})$/.exec(value);
  if (!match || (Number(match[1]) + 1) % 100 !== Number(match[2])) {
    throw new Error("请选择明确学年");
  }
}

function validateTerm(value: string): asserts value is CourseTerm {
  if (!(COURSE_TERMS as readonly string[]).includes(value)) {
    throw new Error("请选择有效学期");
  }
}

/** credits bucket → SQL predicate on the numeric `units` column. */
function creditsCondition(credits?: string) {
  if (!credits) return undefined;
  if (credits === "other") return sql`${courses.units} >= 4`;
  const n = Number(credits);
  return Number.isFinite(n) ? sql`${courses.units} = ${n}` : undefined;
}

/** level bucket → SQL predicate on the code's leading digit. Course codes are
 * subject letters + a 4-digit number (CSCI1130 → level 1); "5000" means 5000+
 * (postgraduate), i.e. leading digit ≥ 5. */
function levelCondition(level?: string) {
  const digit = Math.floor(Number(level) / 1000);
  if (!Number.isFinite(digit) || digit < 1) return undefined;
  const firstDigit = sql`substring(${courses.code} from '[0-9]')`;
  return digit >= 5
    ? sql`${firstDigit} >= '5'`
    : sql`${firstDigit} = ${String(digit)}`;
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

/** List one page of courses. A free-text query searches code + title
 * (code-prefix hits ranked first). With no query, courses that already have
 * ratings/reviews surface first, followed by the rest of the catalog. */
export async function getCourses(
  filter: CourseFilter = {},
): Promise<CoursePage> {
  const q = filter.query?.trim() ?? "";
  const creditsCond = creditsCondition(filter.credits);
  const levelCond = levelCondition(filter.level);
  const subject = filter.subject?.trim().toUpperCase();
  const page = Math.max(1, Math.floor(filter.page ?? 1));
  const like = `%${q.toLowerCase()}%`;
  const codeLike = `%${normalizeCode(q).toLowerCase()}%`;
  const codePrefix = `${normalizeCode(q).toLowerCase()}%`;
  const where = and(
    subject ? eq(courses.subject, subject) : undefined,
    creditsCond,
    levelCond,
    q
      ? or(
          sql`lower(${courses.code}) like ${codeLike}`,
          sql`lower(${courses.title}) like ${like}`,
        )
      : undefined,
  );

  const [totalRows, rows] = await Promise.all([
    db.select({ total: count() }).from(courses).where(where),
    db
      .select(courseCols)
      .from(courses)
      .where(where)
      .orderBy(
        q
          ? sql`case when lower(${courses.code}) like ${codePrefix} then 0 else 1 end`
          : sql`(
              (select count(*) from ${courseRatings}
                where ${courseRatings.courseCode} = ${courses.code}) +
              (select count(*) from ${courseReviews}
                where ${courseReviews.courseCode} = ${courses.code})
            ) desc`,
        courses.code,
      )
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
  ]);

  return {
    courses: await buildViews(rows),
    total: Number(totalRows[0]?.total ?? 0),
    page,
    pageSize: PAGE_SIZE,
  };
}

/** Subject codes with their course counts, alphabetical — powers the subject
 * filter combobox (the count is the only descriptor the catalog carries; there
 * is no subject-name/faculty column). */
export async function getSubjects(): Promise<
  { subject: string; count: number }[]
> {
  const rows = await db
    .select({ subject: courses.subject, count: count() })
    .from(courses)
    .groupBy(courses.subject)
    .orderBy(courses.subject);
  return rows.map((r) => ({ subject: r.subject, count: Number(r.count) }));
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
    return {
      aggregateRating,
      ratingCount,
      lastScore: null,
      lastAcademicYear: null,
      lastTerm: null,
      lastProfessor: null,
      lastContent: "",
      myRatingCount: 0,
    };
  }

  const myRatings = await db
    .select({
      score: courseRatings.score,
      academicYear: courseRatings.academicYear,
      term: courseRatings.term,
      professorId: courseRatings.professorId,
      professorName: courseRatings.professorNameSnapshot,
    })
    .from(courseRatings)
    .where(
      and(
        eq(courseRatings.courseCode, course.code),
        eq(courseRatings.userId, user.id),
      ),
    );

  const mine = myRatings[0];
  const [myReview] = await db
    .select({ content: courseReviews.content })
    .from(courseReviews)
    .where(
      and(
        eq(courseReviews.courseCode, course.code),
        eq(courseReviews.userId, user.id),
      ),
    )
    .orderBy(desc(courseReviews.createdAt))
    .limit(1);
  return {
    aggregateRating,
    ratingCount,
    lastScore: mine?.score ?? null,
    lastAcademicYear: mine?.academicYear ?? null,
    lastTerm: COURSE_TERMS.includes(mine?.term as CourseTerm)
      ? (mine?.term as CourseTerm)
      : null,
    lastProfessor:
      mine?.professorId && mine.professorName
        ? { id: mine.professorId, name: mine.professorName }
        : null,
    lastContent: myReview?.content ?? "",
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
      .select({
        id: courseReviews.id,
        content: courseReviews.content,
        createdAt: courseReviews.createdAt,
        userId: courseReviews.userId,
        professorName: sql<
          string | null
        >`coalesce(${courseReviews.professorNameSnapshot}, ${professors.name})`,
        academicYear: courseReviews.academicYear,
        term: courseReviews.term,
        score: courseReviews.score,
      })
      .from(courseReviews)
      .leftJoin(professors, eq(courseReviews.professorId, professors.id))
      .where(eq(courseReviews.courseCode, course.code))
      .orderBy(desc(courseReviews.createdAt)),
    getOptionalUser(),
  ]);
  const viewerId = user?.id ?? null;
  const ids = rows.map((r) => r.id);

  const likeRows = ids.length
    ? await db
        .select({ reviewId: courseReviewLikes.reviewId, cnt: count() })
        .from(courseReviewLikes)
        .where(inArray(courseReviewLikes.reviewId, ids))
        .groupBy(courseReviewLikes.reviewId)
    : [];
  const likeCount = new Map(likeRows.map((r) => [r.reviewId, Number(r.cnt)]));

  const mine =
    viewerId && ids.length
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

  const reviewViews: CourseReviewView[] = rows.map((r) => ({
    id: r.id,
    isRatingOnly: false,
    content: r.content,
    createdAt: r.createdAt.toISOString(),
    likeCount: likeCount.get(r.id) ?? 0,
    likedByMe: mine.has(r.id),
    canAdminDelete: user?.role === "admin" && r.userId !== viewerId,
    professorName: r.professorName,
    academicYear: r.academicYear,
    term: COURSE_TERMS.includes(r.term as CourseTerm)
      ? (r.term as CourseTerm)
      : null,
    score: r.score,
  }));

  if (user?.role !== "admin") return reviewViews;

  const reviewedUserIds = new Set(rows.map((row) => row.userId));
  const ratingRows = await db
    .select({
      id: courseRatings.id,
      userId: courseRatings.userId,
      createdAt: courseRatings.createdAt,
      professorName: courseRatings.professorNameSnapshot,
      academicYear: courseRatings.academicYear,
      term: courseRatings.term,
      score: courseRatings.score,
    })
    .from(courseRatings)
    .where(eq(courseRatings.courseCode, course.code));

  const ratingOnlyViews: CourseReviewView[] = ratingRows
    .filter(
      (rating) =>
        rating.userId !== viewerId && !reviewedUserIds.has(rating.userId),
    )
    .map((rating) => ({
      id: rating.id,
      isRatingOnly: true,
      content: "",
      createdAt: rating.createdAt.toISOString(),
      likeCount: 0,
      likedByMe: false,
      canAdminDelete: true,
      professorName: rating.professorName,
      academicYear: rating.academicYear,
      term: COURSE_TERMS.includes(rating.term as CourseTerm)
        ? (rating.term as CourseTerm)
        : null,
      score: rating.score,
    }));

  return [...reviewViews, ...ratingOnlyViews].sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt),
  );
}

export async function searchProfessors(
  code: string,
  query: string,
): Promise<ProfessorOption[]> {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  if (!normalizedQuery) return [];
  return db
    .select({
      id: professors.id,
      name: professors.name,
    })
    .from(professors)
    .innerJoin(
      professorCourses,
      eq(professors.id, professorCourses.professorId),
    )
    .where(
      and(
        eq(professorCourses.courseCode, normalizeCode(code)),
        ilike(professors.searchText, `%${normalizedQuery}%`),
      ),
    )
    .orderBy(professors.name)
    .limit(10)
    .then((rows) =>
      rows.map((row) => ({
        id: row.id,
        name: row.name,
      })),
    );
}

export async function getCourseEnrollmentHistory(
  code: string,
): Promise<CourseEnrollmentView[]> {
  const courseCode = normalizeCode(code);
  const rows = await db
    .select()
    .from(courseEnrollments)
    .where(eq(courseEnrollments.courseCode, courseCode))
    .orderBy(
      courseEnrollments.academicYear,
      courseEnrollments.term,
      courseEnrollments.classCode,
    );
  const classes = new Map<string, typeof rows>();
  for (const row of rows) {
    const key = `${row.academicYear}\0${row.term}\0${row.classCode}`;
    classes.set(key, [...(classes.get(key) ?? []), row]);
  }
  return [...classes.entries()].map(([key, components]) => {
    const main =
      components.find((row) => row.component === "LEC") ??
      components.reduce((best, row) =>
        row.quota - row.vacancy > best.quota - best.vacancy ? row : best,
      );
    const [academicYear, term, classCode] = key.split("\0");
    const section = classCode!.startsWith(courseCode)
      ? classCode!.slice(courseCode.length).replace(/^-/, "") || null
      : classCode!;
    return {
      academicYear: academicYear!,
      term: term!,
      section,
      enrolled: Math.max(0, main.quota - main.vacancy),
      quota: main.quota,
      instructors: main.instructors,
    };
  });
}

// ── Mutations (require auth) ──

/** Create or update one concrete course experience. The optional comment is
 * updated in place so the rating and comment remain one manageable posting. */
export async function submitCourseReview(
  code: string,
  submission: CourseReviewSubmission,
): Promise<void> {
  const user = await requireAuth();
  validateScore(submission.score);
  validateAcademicYear(submission.academicYear);
  validateTerm(submission.term);
  const content = submission.content?.trim() ?? "";
  if (content.length > 2000) throw new Error("评论内容过长");

  const course = await findCourse(code);
  if (!course) throw new Error("课程不存在");

  const [professor] = await db
    .select({ id: professors.id, name: professors.name })
    .from(professors)
    .innerJoin(
      professorCourses,
      eq(professors.id, professorCourses.professorId),
    )
    .where(
      and(
        eq(professors.id, submission.professorId),
        eq(professorCourses.courseCode, course.code),
      ),
    )
    .limit(1);
  if (!professor) throw new Error("请选择教授目录中的任课教授");

  const existingReviews = await db
    .select({ id: courseReviews.id })
    .from(courseReviews)
    .where(
      and(
        eq(courseReviews.courseCode, course.code),
        eq(courseReviews.userId, user.id),
      ),
    )
    .orderBy(desc(courseReviews.createdAt));
  const existingReview = existingReviews[0];

  await db.transaction(async (tx) => {
    await tx
      .insert(courseRatings)
      .values({
        courseCode: course.code,
        userId: user.id,
        score: submission.score,
        academicYear: submission.academicYear,
        term: submission.term,
        professorId: professor.id,
        professorNameSnapshot: professor.name,
      })
      .onConflictDoUpdate({
        target: [courseRatings.courseCode, courseRatings.userId],
        set: {
          score: submission.score,
          academicYear: submission.academicYear,
          term: submission.term,
          professorId: professor.id,
          professorNameSnapshot: professor.name,
          createdAt: sql`now()`,
        },
      });

    const reviewValues = {
      content,
      professorId: professor.id,
      professorNameSnapshot: professor.name,
      academicYear: submission.academicYear,
      term: submission.term,
      score: submission.score,
    };
    if (content && existingReview) {
      await tx
        .update(courseReviews)
        .set(reviewValues)
        .where(eq(courseReviews.id, existingReview.id));
      await tx
        .delete(courseReviews)
        .where(
          and(
            eq(courseReviews.courseCode, course.code),
            eq(courseReviews.userId, user.id),
            ne(courseReviews.id, existingReview.id),
          ),
        );
    } else if (content) {
      await tx.insert(courseReviews).values({
        courseCode: course.code,
        userId: user.id,
        ...reviewValues,
      });
    } else if (existingReview) {
      await tx
        .delete(courseReviews)
        .where(
          and(
            eq(courseReviews.courseCode, course.code),
            eq(courseReviews.userId, user.id),
          ),
        );
    }
  });

  revalidatePath(`/courses/${course.code}`);
  revalidatePath("/courses");
}

/** Delete a whole submission (rating plus any comments). Authors delete their
 * own posting; admins may identify another user's posting via its review or
 * rating id. */
export async function deleteCourseReviewSubmission(
  code: string,
  target?: { id: string; type: "review" | "rating" },
): Promise<void> {
  const user = await requireAuth();
  const courseCode = normalizeCode(code);
  let ownerId = user.id;

  if (target) {
    const source = target.type === "review" ? courseReviews : courseRatings;
    const [submission] = await db
      .select({
        userId: source.userId,
        courseCode: source.courseCode,
      })
      .from(source)
      .where(eq(source.id, target.id))
      .limit(1);
    if (!submission) throw new Error("投稿不存在");
    if (submission.courseCode !== courseCode) throw new Error("投稿与课程不符");
    if (submission.userId !== user.id && user.role !== "admin") {
      throw new Error("无权删除该投稿");
    }
    ownerId = submission.userId;
  }

  await db.transaction(async (tx) => {
    await tx
      .delete(courseReviews)
      .where(
        and(
          eq(courseReviews.courseCode, courseCode),
          eq(courseReviews.userId, ownerId),
        ),
      );
    await tx
      .delete(courseRatings)
      .where(
        and(
          eq(courseRatings.courseCode, courseCode),
          eq(courseRatings.userId, ownerId),
        ),
      );
  });

  revalidatePath(`/courses/${courseCode}`);
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
