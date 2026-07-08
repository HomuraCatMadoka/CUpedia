"use server";

import { db } from "@/db";
import {
  courseAggregates,
  courseReviewVotes,
  courseReviews,
  courses,
  users,
} from "@/db/schema";
import { requireAuth } from "@/lib/auth-guard";
import { and, asc, desc, eq, gte, or, sql, type SQL } from "drizzle-orm";
import { escapeLikePattern } from "@/lib/utils";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type CourseReviewInput = {
  rating: number;
  difficulty: number;
  workload: number;
  grading: number;
  content: string;
  term?: string | null;
  instructor?: string | null;
  anonymous?: boolean;
};

export type CourseDetail = {
  course: {
    id: string;
    code: string;
    title: string;
    department: string | null;
    credits: number | null;
    description: string;
  };
  aggregate: {
    reviewCount: number;
    averageRating: number | null;
    averageDifficulty: number | null;
    averageWorkload: number | null;
    averageGrading: number | null;
  };
  reviews: Array<{
    id: string;
    rating: number;
    difficulty: number;
    workload: number;
    grading: number;
    content: string;
    term: string | null;
    instructor: string | null;
    anonymous: boolean;
    helpfulScore: number;
    createdAt: Date;
    user: { id: string; nickname: string } | null;
  }>;
};

export type CourseSummary = {
  id: string;
  code: string;
  title: string;
  department: string | null;
  credits: number | null;
  description: string;
  reviewCount: number;
  averageRating: number | null;
  averageDifficulty: number | null;
  averageWorkload: number | null;
  averageGrading: number | null;
};

export type CourseListFilters = {
  query?: string;
  department?: string;
  credits?: string;
};

function normalizeCourseCode(value: string) {
  return value.trim().toUpperCase().replace(/\s+/g, "");
}

function courseWhere(value: string): SQL {
  const trimmed = value.trim();
  if (UUID_RE.test(trimmed)) {
    return or(
      eq(courses.id, trimmed),
      eq(courses.code, normalizeCourseCode(value)),
    )!;
  }
  return eq(courses.code, normalizeCourseCode(value));
}

function assertRating(name: string, value: number) {
  if (!Number.isInteger(value) || value < 1 || value > 5) {
    throw new Error(`${name} must be an integer between 1 and 5`);
  }
}

function cleanOptionalText(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function average(sum: number, count: number) {
  return count > 0 ? Number((sum / count).toFixed(2)) : null;
}

function aggregateFromSums(row: {
  reviewCount: number | null;
  ratingSum: number | null;
  difficultySum: number | null;
  workloadSum: number | null;
  gradingSum: number | null;
}) {
  const reviewCount = row.reviewCount ?? 0;
  return {
    reviewCount,
    averageRating: average(row.ratingSum ?? 0, reviewCount),
    averageDifficulty: average(row.difficultySum ?? 0, reviewCount),
    averageWorkload: average(row.workloadSum ?? 0, reviewCount),
    averageGrading: average(row.gradingSum ?? 0, reviewCount),
  };
}

function courseSearchWhere(query: string): SQL {
  const pattern = `%${escapeLikePattern(query.trim().toUpperCase())}%`;
  return or(
    sql`upper(${courses.code}) like ${pattern} escape '\'`,
    sql`upper(${courses.title}) like ${pattern} escape '\'`,
    sql`upper(coalesce(${courses.department}, '')) like ${pattern} escape '\'`,
  )!;
}

function courseCreditWhere(value: string): SQL | undefined {
  if (value === "other") return gte(courses.credits, 4);
  const credits = Number(value);
  return Number.isInteger(credits) ? eq(courses.credits, credits) : undefined;
}

function validateReviewInput(input: CourseReviewInput) {
  assertRating("rating", input.rating);
  assertRating("difficulty", input.difficulty);
  assertRating("workload", input.workload);
  assertRating("grading", input.grading);

  const content = input.content.trim();
  if (!content) throw new Error("content cannot be empty");

  return {
    rating: input.rating,
    difficulty: input.difficulty,
    workload: input.workload,
    grading: input.grading,
    content,
    term: cleanOptionalText(input.term),
    instructor: cleanOptionalText(input.instructor),
    anonymous: input.anonymous ?? false,
  };
}

export async function getCourseSummaries({
  query,
  department,
  credits,
}: CourseListFilters = {}): Promise<CourseSummary[]> {
  const conditions: SQL[] = [];
  const trimmedQuery = query?.trim();

  if (trimmedQuery) conditions.push(courseSearchWhere(trimmedQuery));
  if (department?.trim()) {
    conditions.push(eq(courses.department, department.trim().toUpperCase()));
  }
  if (credits) {
    const creditWhere = courseCreditWhere(credits);
    if (creditWhere) conditions.push(creditWhere);
  }

  const rows = await db
    .select({
      id: courses.id,
      code: courses.code,
      title: courses.title,
      department: courses.department,
      credits: courses.credits,
      description: courses.description,
      reviewCount: courseAggregates.reviewCount,
      ratingSum: courseAggregates.ratingSum,
      difficultySum: courseAggregates.difficultySum,
      workloadSum: courseAggregates.workloadSum,
      gradingSum: courseAggregates.gradingSum,
    })
    .from(courses)
    .leftJoin(courseAggregates, eq(courseAggregates.courseId, courses.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(asc(courses.code))
    .limit(80);

  return rows.map((row) => ({
    id: row.id,
    code: row.code,
    title: row.title,
    department: row.department,
    credits: row.credits,
    description: row.description,
    ...aggregateFromSums(row),
  }));
}

type AggregateWriter = Pick<typeof db, "insert" | "select" | "update">;

async function refreshCourseAggregate(tx: AggregateWriter, courseId: string) {
  await tx
    .insert(courseAggregates)
    .values({ courseId })
    .onConflictDoNothing({ target: courseAggregates.courseId });

  const [stats] = await tx
    .select({
      reviewCount: sql<number>`count(${courseReviews.id})::int`,
      ratingSum: sql<number>`coalesce(sum(${courseReviews.rating}), 0)::int`,
      difficultySum: sql<number>`coalesce(sum(${courseReviews.difficulty}), 0)::int`,
      workloadSum: sql<number>`coalesce(sum(${courseReviews.workload}), 0)::int`,
      gradingSum: sql<number>`coalesce(sum(${courseReviews.grading}), 0)::int`,
    })
    .from(courseReviews)
    .where(eq(courseReviews.courseId, courseId));

  await tx
    .update(courseAggregates)
    .set({
      reviewCount: stats?.reviewCount ?? 0,
      ratingSum: stats?.ratingSum ?? 0,
      difficultySum: stats?.difficultySum ?? 0,
      workloadSum: stats?.workloadSum ?? 0,
      gradingSum: stats?.gradingSum ?? 0,
      updatedAt: new Date(),
    })
    .where(eq(courseAggregates.courseId, courseId));
}

export async function createCourseReview(
  courseIdOrCode: string,
  input: CourseReviewInput,
) {
  const user = await requireAuth();
  const values = validateReviewInput(input);

  return db.transaction(async (tx) => {
    const course = await tx.query.courses.findFirst({
      where: courseWhere(courseIdOrCode),
      columns: { id: true },
    });
    if (!course) throw new Error("Course not found");

    const [review] = await tx
      .insert(courseReviews)
      .values({
        courseId: course.id,
        userId: user.id,
        ...values,
      })
      .returning({ id: courseReviews.id });

    await refreshCourseAggregate(tx as AggregateWriter, course.id);
    return review.id;
  });
}

export async function getCourseDetail(
  courseIdOrCode: string,
): Promise<CourseDetail> {
  const course = await db.query.courses.findFirst({
    where: courseWhere(courseIdOrCode),
    columns: {
      id: true,
      code: true,
      title: true,
      department: true,
      credits: true,
      description: true,
    },
  });
  if (!course) throw new Error("Course not found");

  const aggregate = await db.query.courseAggregates.findFirst({
    where: eq(courseAggregates.courseId, course.id),
    columns: {
      reviewCount: true,
      ratingSum: true,
      difficultySum: true,
      workloadSum: true,
      gradingSum: true,
    },
  });

  const reviews = await db
    .select({
      id: courseReviews.id,
      rating: courseReviews.rating,
      difficulty: courseReviews.difficulty,
      workload: courseReviews.workload,
      grading: courseReviews.grading,
      content: courseReviews.content,
      term: courseReviews.term,
      instructor: courseReviews.instructor,
      anonymous: courseReviews.anonymous,
      helpfulScore: courseReviews.helpfulScore,
      createdAt: courseReviews.createdAt,
      userId: users.id,
      nickname: users.nickname,
    })
    .from(courseReviews)
    .innerJoin(users, eq(courseReviews.userId, users.id))
    .where(eq(courseReviews.courseId, course.id))
    .orderBy(desc(courseReviews.createdAt))
    .limit(20);

  const reviewCount = aggregate?.reviewCount ?? 0;

  return {
    course,
    aggregate: aggregateFromSums({
      reviewCount,
      ratingSum: aggregate?.ratingSum ?? 0,
      difficultySum: aggregate?.difficultySum ?? 0,
      workloadSum: aggregate?.workloadSum ?? 0,
      gradingSum: aggregate?.gradingSum ?? 0,
    }),
    reviews: reviews.map((review) => ({
      id: review.id,
      rating: review.rating,
      difficulty: review.difficulty,
      workload: review.workload,
      grading: review.grading,
      content: review.content,
      term: review.term,
      instructor: review.instructor,
      anonymous: review.anonymous,
      helpfulScore: review.helpfulScore,
      createdAt: review.createdAt,
      user: review.anonymous
        ? null
        : { id: review.userId, nickname: review.nickname },
    })),
  };
}

export async function voteCourseReview(reviewId: string, value: 1 | -1) {
  const user = await requireAuth();
  if (value !== 1 && value !== -1) {
    throw new Error("value must be 1 or -1");
  }

  return db.transaction(async (tx) => {
    const review = await tx.query.courseReviews.findFirst({
      where: eq(courseReviews.id, reviewId),
      columns: { id: true },
    });
    if (!review) throw new Error("Review not found");

    const existingVote = await tx.query.courseReviewVotes.findFirst({
      where: and(
        eq(courseReviewVotes.reviewId, reviewId),
        eq(courseReviewVotes.userId, user.id),
      ),
      columns: { value: true },
    });

    if (existingVote?.value === value) {
      return { helpfulScoreDelta: 0 };
    }

    const helpfulScoreDelta = value - (existingVote?.value ?? 0);
    if (existingVote) {
      await tx
        .update(courseReviewVotes)
        .set({ value, updatedAt: new Date() })
        .where(
          and(
            eq(courseReviewVotes.reviewId, reviewId),
            eq(courseReviewVotes.userId, user.id),
          ),
        );
    } else {
      await tx.insert(courseReviewVotes).values({
        reviewId,
        userId: user.id,
        value,
      });
    }

    await tx
      .update(courseReviews)
      .set({
        helpfulScore: sql`${courseReviews.helpfulScore} + ${helpfulScoreDelta}`,
        updatedAt: new Date(),
      })
      .where(eq(courseReviews.id, reviewId));

    return { helpfulScoreDelta };
  });
}
