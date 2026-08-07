/**
 * Hand-written input validation for the CLI API (no zod — the project has no
 * zod dependency; see src/lib/canteen-types.ts parseVote for the style).
 *
 * Every parse* takes unknown (a parsed JSON body or a query-params record /
 * URLSearchParams) and returns a discriminated result:
 *
 *   { ok: true, value } | { ok: false, error }
 *
 * `error` is always a stable code from ERROR_CODES so routes can map it to an
 * HTTP status without string matching.
 */

import { parseVote } from "@/lib/canteen-types";
import { validateDanmakuContent } from "@/lib/danmaku-types";
import {
  validatePriorities,
  type SmallCollegePreference,
  type SmallCollegeAnswers,
} from "@/lib/college-picker/recommend";
import type {
  AvoidFactor,
  BonusFactor,
  MajorGroup,
  ScoredFactor,
} from "@/lib/college-picker/data";
import { ERROR_CODES } from "./errors";

export type ParseResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

type QueryParams = URLSearchParams | Record<string, unknown>;

function toRecord(params: QueryParams): Record<string, unknown> {
  return params instanceof URLSearchParams ? Object.fromEntries(params) : params;
}

const MAJOR_GROUPS = new Set<MajorGroup>([
  "engineering",
  "science",
  "business",
  "social_science",
  "arts",
]);
const SCORED_FACTORS = new Set<ScoredFactor>([
  "Commute_Time",
  "Accommodation_Environment",
  "Hostel_Guarantee",
  "Exchange_Opportunity",
]);
const AVOID_FACTORS = new Set<AvoidFactor>([
  "College_FYP",
  "Religious_Element",
  "Admission_Interview",
  "Admission_Video",
  "Admission_Written_Test",
]);
const BONUS_FACTORS = new Set<BonusFactor>(["MTR_Distance", "Par_Room"]);
const SMALL_COLLEGE_PREFERENCES = new Set<SmallCollegePreference>([
  "aim",
  "avoid",
  "indifferent",
]);

const SEARCH_TYPES = new Set(["article", "canteen", "course"]);
const COURSE_SORTS = new Set(["latest", "rating-count"]);
const COURSE_LEVELS = new Set(["1000", "2000", "3000", "4000", "5000"]);

// ── GET /api/cli/search ─────────────────────────────────────────────────────

export type CliSearchQuery = {
  q: string;
  limit?: number;
  type?: "article" | "canteen" | "course";
};

export function parseSearchQuery(
  params: QueryParams,
): ParseResult<CliSearchQuery> {
  const record = toRecord(params);

  const q = record.q;
  if (typeof q !== "string" || !q.trim()) {
    return { ok: false, error: ERROR_CODES.INVALID_PARAMS };
  }
  const value: CliSearchQuery = { q: q.trim() };

  if (record.limit !== undefined) {
    const n = typeof record.limit === "number" ? record.limit : Number(record.limit);
    if (!Number.isInteger(n) || n < 1 || n > 50) {
      return { ok: false, error: ERROR_CODES.INVALID_PARAMS };
    }
    value.limit = n;
  }

  if (record.type !== undefined) {
    if (typeof record.type !== "string" || !SEARCH_TYPES.has(record.type)) {
      return { ok: false, error: ERROR_CODES.INVALID_PARAMS };
    }
    value.type = record.type as CliSearchQuery["type"];
  }

  return { ok: true, value };
}

// ── GET /api/cli/courses ────────────────────────────────────────────────────

export type CliCourseListQuery = {
  query?: string;
  subject?: string;
  level?: string;
  sort?: "latest" | "rating-count";
  page?: number;
};

export function parseCourseListQuery(
  params: QueryParams,
): ParseResult<CliCourseListQuery> {
  const record = toRecord(params);
  const value: CliCourseListQuery = {};

  if (record.query !== undefined) {
    if (typeof record.query !== "string" || !record.query.trim()) {
      return { ok: false, error: ERROR_CODES.INVALID_PARAMS };
    }
    value.query = record.query.trim();
  }

  if (record.subject !== undefined) {
    if (typeof record.subject !== "string" || !record.subject.trim()) {
      return { ok: false, error: ERROR_CODES.INVALID_PARAMS };
    }
    value.subject = record.subject.trim();
  }

  if (record.level !== undefined) {
    if (typeof record.level !== "string" || !COURSE_LEVELS.has(record.level)) {
      return { ok: false, error: ERROR_CODES.INVALID_PARAMS };
    }
    value.level = record.level;
  }

  if (record.sort !== undefined) {
    if (typeof record.sort !== "string" || !COURSE_SORTS.has(record.sort)) {
      return { ok: false, error: ERROR_CODES.INVALID_PARAMS };
    }
    value.sort = record.sort as CliCourseListQuery["sort"];
  }

  if (record.page !== undefined) {
    const n = typeof record.page === "number" ? record.page : Number(record.page);
    if (!Number.isInteger(n) || n < 1) {
      return { ok: false, error: ERROR_CODES.INVALID_PARAMS };
    }
    value.page = n;
  }

  return { ok: true, value };
}

// ── POST /api/cli/courses/:code/review ──────────────────────────────────────

export type CliReviewBody = {
  rating: number;
  content: string;
  professorId?: string;
};

export function parseReviewBody(input: unknown): ParseResult<CliReviewBody> {
  if (!isJsonObject(input)) {
    return { ok: false, error: ERROR_CODES.INVALID_JSON };
  }
  const body = input as Record<string, unknown>;

  const rating = body.rating;
  if (
    typeof rating !== "number" ||
    !Number.isInteger(rating) ||
    rating < 1 ||
    rating > 5
  ) {
    return { ok: false, error: ERROR_CODES.INVALID_PARAMS };
  }

  const content = body.content;
  if (typeof content !== "string" || !content.trim() || content.length > 5000) {
    return { ok: false, error: ERROR_CODES.INVALID_PARAMS };
  }

  const value: CliReviewBody = { rating, content: content.trim() };
  if (body.professorId !== undefined) {
    if (typeof body.professorId !== "string" || !body.professorId.trim()) {
      return { ok: false, error: ERROR_CODES.INVALID_PARAMS };
    }
    value.professorId = body.professorId.trim();
  }

  return { ok: true, value };
}

// ── POST /api/cli/college-picker/recommend ──────────────────────────────────

export type CliCollegePickBody = {
  majorGroup: MajorGroup;
  priorities: [ScoredFactor, ScoredFactor | "", ScoredFactor | ""];
  avoids: AvoidFactor[];
  smallCollegePreference?: SmallCollegePreference;
  bonusFactors?: BonusFactor[];
  smallCollegeAnswers?: SmallCollegeAnswers;
};

export function parseCollegePickBody(
  input: unknown,
): ParseResult<CliCollegePickBody> {
  if (!isJsonObject(input)) {
    return { ok: false, error: ERROR_CODES.INVALID_JSON };
  }
  const body = input as Record<string, unknown>;

  const majorGroup = body.majorGroup;
  if (typeof majorGroup !== "string" || !MAJOR_GROUPS.has(majorGroup as MajorGroup)) {
    return { ok: false, error: ERROR_CODES.INVALID_PARAMS };
  }

  if (!Array.isArray(body.priorities) || body.priorities.length !== 3) {
    return { ok: false, error: ERROR_CODES.INVALID_PARAMS };
  }
  const priorities = body.priorities.map((p) => {
    if (p === "") return "" as const;
    if (typeof p === "string" && SCORED_FACTORS.has(p as ScoredFactor)) {
      return p as ScoredFactor;
    }
    return null;
  });
  if (priorities.some((p) => p === null)) {
    return { ok: false, error: ERROR_CODES.INVALID_PARAMS };
  }
  const priorityTuple = priorities as [
    ScoredFactor,
    ScoredFactor | "",
    ScoredFactor | "",
  ];
  if (!validatePriorities(priorityTuple).ok) {
    return { ok: false, error: ERROR_CODES.INVALID_PARAMS };
  }

  if (!Array.isArray(body.avoids)) {
    return { ok: false, error: ERROR_CODES.INVALID_PARAMS };
  }
  const avoids = body.avoids.map((a) =>
    typeof a === "string" && AVOID_FACTORS.has(a as AvoidFactor) ? (a as AvoidFactor) : null,
  );
  if (avoids.some((a) => a === null)) {
    return { ok: false, error: ERROR_CODES.INVALID_PARAMS };
  }

  const value: CliCollegePickBody = {
    majorGroup: majorGroup as MajorGroup,
    priorities: priorityTuple,
    avoids: avoids as AvoidFactor[],
  };

  if (body.smallCollegePreference !== undefined) {
    const pref = body.smallCollegePreference;
    if (
      typeof pref !== "string" ||
      !SMALL_COLLEGE_PREFERENCES.has(pref as SmallCollegePreference)
    ) {
      return { ok: false, error: ERROR_CODES.INVALID_PARAMS };
    }
    value.smallCollegePreference = pref as SmallCollegePreference;
  }

  if (body.bonusFactors !== undefined) {
    if (!Array.isArray(body.bonusFactors)) {
      return { ok: false, error: ERROR_CODES.INVALID_PARAMS };
    }
    const bonusFactors = body.bonusFactors.map((b) =>
      typeof b === "string" && BONUS_FACTORS.has(b as BonusFactor)
        ? (b as BonusFactor)
        : null,
    );
    if (bonusFactors.some((b) => b === null)) {
      return { ok: false, error: ERROR_CODES.INVALID_PARAMS };
    }
    value.bonusFactors = bonusFactors as BonusFactor[];
  }

  if (body.smallCollegeAnswers !== undefined) {
    const answers = parseSmallCollegeAnswers(body.smallCollegeAnswers);
    if (!answers) {
      return { ok: false, error: ERROR_CODES.INVALID_PARAMS };
    }
    value.smallCollegeAnswers = answers;
  }

  return { ok: true, value };
}

// ── POST /api/cli/canteens/:id/vote ─────────────────────────────────────────

export type CliVoteBody = {
  dishId: string;
  vote: "like" | "dislike";
};

export function parseVoteBody(input: unknown): ParseResult<CliVoteBody> {
  if (!isJsonObject(input)) {
    return { ok: false, error: ERROR_CODES.INVALID_JSON };
  }
  const body = input as Record<string, unknown>;

  const dishId = body.dishId;
  if (typeof dishId !== "string" || !dishId.trim()) {
    return { ok: false, error: ERROR_CODES.INVALID_PARAMS };
  }

  let vote: "like" | "dislike";
  try {
    const parsed = parseVote(body.vote);
    if (parsed === null) {
      return { ok: false, error: ERROR_CODES.INVALID_VOTE };
    }
    vote = parsed;
  } catch {
    return { ok: false, error: ERROR_CODES.INVALID_VOTE };
  }

  return { ok: true, value: { dishId: dishId.trim(), vote } };
}

// ── POST danmaku / canteen message ──────────────────────────────────────────

export type CliMessageBody = {
  content: string;
};

export function parseMessageBody(input: unknown): ParseResult<CliMessageBody> {
  if (!isJsonObject(input)) {
    return { ok: false, error: ERROR_CODES.INVALID_JSON };
  }
  const body = input as Record<string, unknown>;

  try {
    return { ok: true, value: { content: validateDanmakuContent(body.content) } };
  } catch {
    return { ok: false, error: ERROR_CODES.INVALID_DANMAKU };
  }
}

// ── helpers ─────────────────────────────────────────────────────────────────

function isJsonObject(input: unknown): boolean {
  return input !== null && typeof input === "object" && !Array.isArray(input);
}

const SCQ1 = new Set(["A", "B"]);
const SCQ2 = new Set(["A", "B", "C", "D", "E"]);
const SCQ3 = new Set(["A", "B", "C", "D"]);
const SCQ4 = new Set(["A", "B", "C"]);

function parseSmallCollegeAnswers(input: unknown): SmallCollegeAnswers | null {
  if (!isJsonObject(input)) return null;
  const answers = input as Record<string, unknown>;
  if (
    typeof answers.q1 !== "string" ||
    !SCQ1.has(answers.q1) ||
    typeof answers.q2 !== "string" ||
    !SCQ2.has(answers.q2) ||
    typeof answers.q3 !== "string" ||
    !SCQ3.has(answers.q3) ||
    typeof answers.q4 !== "string" ||
    !SCQ4.has(answers.q4)
  ) {
    return null;
  }
  return {
    q1: answers.q1 as SmallCollegeAnswers["q1"],
    q2: answers.q2 as SmallCollegeAnswers["q2"],
    q3: answers.q3 as SmallCollegeAnswers["q3"],
    q4: answers.q4 as SmallCollegeAnswers["q4"],
  };
}
