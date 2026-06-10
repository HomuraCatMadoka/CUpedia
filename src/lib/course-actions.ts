"use server";

import { promises as fs } from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { requireAuth, getOptionalUser } from "@/lib/auth-guard";
import {
  MOCK_COURSES,
  type Course,
  type Faculty,
} from "@/app/(main)/courses/mock/courses";

// ─────────────────────────────────────────────────────────────────────────
// Data-access layer (repository).
//
// This module is the single boundary between the course UI and its data
// source. Today: courses come from a mock array (read-only) and user-generated
// reviews/likes/ratings are persisted to a local JSON file. To swap in a real
// backend later, reimplement the functions below — the exported types are the
// contract the pages and components depend on, so the UI need not change.
// ─────────────────────────────────────────────────────────────────────────

const DATA_FILE = path.join(
  process.cwd(),
  "src",
  "app",
  "(main)",
  "courses",
  "mock",
  "reviews.json",
);

/** Minimum interval between two ratings from the same user on the same course. */
const RATING_COOLDOWN_MS = 5 * 60 * 1000;

/** Raw persisted shape. `likedBy` holds the userIds that liked the review. */
type StoredReview = {
  id: string;
  courseCode: string;
  userId: string;
  content: string;
  createdAt: string;
  likedBy: string[];
};

type StoredRating = {
  id: string;
  courseCode: string;
  userId: string;
  /** 0–10, one decimal. */
  score: number;
  createdAt: string;
};

type CourseDataStore = {
  reviews: StoredReview[];
  ratings: StoredRating[];
};

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
  /** Effective rating: user average when ratings exist, else mock baseline. */
  rating: number;
  ratingCount: number;
};

export type CourseRatingState = {
  aggregateRating: number;
  ratingCount: number;
  /** Whether the current user may submit another rating right now. */
  canRate: boolean;
  /** Seconds remaining until the user can rate again (0 when canRate). */
  cooldownSeconds: number;
  /** The user's most recent score on this course, if any. */
  lastScore: number | null;
  /** How many times the current user has rated this course. */
  myRatingCount: number;
};

export type CourseFilter = {
  faculty?: Faculty;
  /** "1" | "2" | "3" | "other" (4+ credits). */
  credits?: string;
  /** Free-text query against course code or title. */
  query?: string;
};

// ── File store helpers (internal) ──

async function readStore(): Promise<CourseDataStore> {
  try {
    const raw = await fs.readFile(DATA_FILE, "utf8");
    const parsed = JSON.parse(raw) as Partial<CourseDataStore>;
    return {
      reviews: parsed.reviews ?? [],
      ratings: parsed.ratings ?? [],
    };
  } catch {
    return { reviews: [], ratings: [] };
  }
}

async function writeStore(store: CourseDataStore): Promise<void> {
  await fs.mkdir(path.dirname(DATA_FILE), { recursive: true });
  await fs.writeFile(DATA_FILE, JSON.stringify(store, null, 2), "utf8");
}

function normalizeCode(value: string): string {
  return value.replace(/\s+/g, "").toUpperCase();
}

function findCourse(code: string): Course | undefined {
  const target = normalizeCode(code);
  return MOCK_COURSES.find((c) => normalizeCode(c.code) === target);
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

function aggregateRating(
  course: Course,
  ratings: StoredRating[],
): { rating: number; ratingCount: number } {
  const courseRatings = ratings.filter((r) => r.courseCode === course.code);
  if (courseRatings.length === 0) {
    return { rating: course.rating, ratingCount: 0 };
  }
  const sum = courseRatings.reduce((acc, r) => acc + r.score, 0);
  return {
    rating: roundScore(sum / courseRatings.length),
    ratingCount: courseRatings.length,
  };
}

function buildCourseView(
  course: Course,
  store: CourseDataStore,
): CourseView {
  const reviewCount = store.reviews.filter(
    (r) => r.courseCode === course.code,
  ).length;
  const { rating, ratingCount } = aggregateRating(course, store.ratings);
  return { ...course, rating, reviewCount, ratingCount };
}

// ── Course reads ──

/** List courses, optionally filtered by faculty, credits bucket, and a
 * free-text query. Code matches are ranked above title-only matches; ties
 * fall back to descending rating. */
export async function getCourses(
  filter: CourseFilter = {},
): Promise<CourseView[]> {
  const store = await readStore();

  const q = filter.query?.trim().toLowerCase() ?? "";
  const qCode = normalizeCode(filter.query ?? "");

  const matched = MOCK_COURSES.filter((c) => {
    if (filter.faculty && c.faculty !== filter.faculty) return false;
    if (filter.credits) {
      if (filter.credits === "other") {
        if (c.credits < 4) return false;
      } else if (String(c.credits) !== filter.credits) {
        return false;
      }
    }
    if (q) {
      const codeHit = normalizeCode(c.code).includes(qCode) && qCode.length > 0;
      const titleHit = c.title.toLowerCase().includes(q);
      if (!codeHit && !titleHit) return false;
    }
    return true;
  });

  const scored = matched.map((c) => ({
    course: c,
    codeHit: q ? normalizeCode(c.code).includes(qCode) && qCode.length > 0 : false,
  }));

  scored.sort((a, b) => {
    if (a.codeHit !== b.codeHit) return a.codeHit ? -1 : 1;
    const viewA = buildCourseView(a.course, store);
    const viewB = buildCourseView(b.course, store);
    return viewB.rating - viewA.rating;
  });

  return scored.map(({ course }) => buildCourseView(course, store));
}

/** Fetch a single course by code (space-insensitive), or null if unknown. */
export async function getCourse(code: string): Promise<CourseView | null> {
  const course = findCourse(code);
  if (!course) return null;
  const store = await readStore();
  return buildCourseView(course, store);
}

/** Rating UI state for the detail page: aggregate score + per-user cooldown. */
export async function getCourseRatingState(
  code: string,
): Promise<CourseRatingState | null> {
  const course = findCourse(code);
  if (!course) return null;

  const [store, user] = await Promise.all([readStore(), getOptionalUser()]);
  const courseRatings = store.ratings.filter((r) => r.courseCode === course.code);
  const { rating, ratingCount } = aggregateRating(course, store.ratings);

  if (!user) {
    return {
      aggregateRating: rating,
      ratingCount,
      canRate: false,
      cooldownSeconds: 0,
      lastScore: null,
      myRatingCount: 0,
    };
  }

  const myRatings = courseRatings
    .filter((r) => r.userId === user.id)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const lastRating = myRatings[0];
  let canRate = true;
  let cooldownSeconds = 0;

  if (lastRating) {
    const elapsed = Date.now() - new Date(lastRating.createdAt).getTime();
    const remaining = RATING_COOLDOWN_MS - elapsed;
    if (remaining > 0) {
      canRate = false;
      cooldownSeconds = Math.ceil(remaining / 1000);
    }
  }

  return {
    aggregateRating: rating,
    ratingCount,
    canRate,
    cooldownSeconds,
    lastScore: lastRating?.score ?? null,
    myRatingCount: myRatings.length,
  };
}

/** Reviews for a course, newest first, with per-viewer like/ownership state. */
export async function getCourseReviews(
  code: string,
): Promise<CourseReviewView[]> {
  const course = findCourse(code);
  if (!course) return [];

  const [store, user] = await Promise.all([readStore(), getOptionalUser()]);
  const viewerId = user?.id ?? null;

  return store.reviews
    .filter((r) => r.courseCode === course.code)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map((r) => ({
      id: r.id,
      content: r.content,
      createdAt: r.createdAt,
      likeCount: r.likedBy.length,
      likedByMe: viewerId ? r.likedBy.includes(viewerId) : false,
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

  const course = findCourse(code);
  if (!course) throw new Error("课程不存在");

  const store = await readStore();
  const myRatings = store.ratings
    .filter((r) => r.courseCode === course.code && r.userId === user.id)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const lastRating = myRatings[0];
  if (lastRating) {
    const elapsed = Date.now() - new Date(lastRating.createdAt).getTime();
    if (elapsed < RATING_COOLDOWN_MS) {
      const waitSec = Math.ceil((RATING_COOLDOWN_MS - elapsed) / 1000);
      const waitMin = Math.floor(waitSec / 60);
      const waitRem = waitSec % 60;
      throw new Error(
        waitMin > 0
          ? `请 ${waitMin} 分 ${waitRem} 秒后再为这门课打分`
          : `请 ${waitSec} 秒后再为这门课打分`,
      );
    }
  }

  store.ratings.push({
    id: randomUUID(),
    courseCode: course.code,
    userId: user.id,
    score: normalizedScore,
    createdAt: new Date().toISOString(),
  });
  await writeStore(store);

  revalidatePath(`/courses/${course.code}`);
  revalidatePath("/courses");
}

/** Post an anonymous review on a course. Requires login. */
export async function addReview(code: string, content: string): Promise<void> {
  const user = await requireAuth();
  const trimmed = content.trim();
  if (!trimmed) throw new Error("评论内容不能为空");
  if (trimmed.length > 2000) throw new Error("评论内容过长");

  const course = findCourse(code);
  if (!course) throw new Error("课程不存在");

  const store = await readStore();
  store.reviews.push({
    id: randomUUID(),
    courseCode: course.code,
    userId: user.id,
    content: trimmed,
    createdAt: new Date().toISOString(),
    likedBy: [],
  });
  await writeStore(store);

  revalidatePath(`/courses/${course.code}`);
  revalidatePath("/courses");
}

/** Withdraw a review. Only the original author (or an admin) may do so. */
export async function deleteReview(reviewId: string): Promise<void> {
  const user = await requireAuth();
  const store = await readStore();
  const review = store.reviews.find((r) => r.id === reviewId);
  if (!review) throw new Error("评论不存在");
  if (review.userId !== user.id && user.role !== "admin") {
    throw new Error("无权撤回该评论");
  }

  store.reviews = store.reviews.filter((r) => r.id !== reviewId);
  await writeStore(store);

  revalidatePath(`/courses/${review.courseCode}`);
  revalidatePath("/courses");
}

/** Toggle the current user's like on a review. Returns the new like count. */
export async function toggleLike(reviewId: string): Promise<number> {
  const user = await requireAuth();
  const store = await readStore();
  const review = store.reviews.find((r) => r.id === reviewId);
  if (!review) throw new Error("评论不存在");

  const idx = review.likedBy.indexOf(user.id);
  if (idx >= 0) review.likedBy.splice(idx, 1);
  else review.likedBy.push(user.id);

  await writeStore(store);
  revalidatePath(`/courses/${review.courseCode}`);
  return review.likedBy.length;
}
