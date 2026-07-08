import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  mockRedirect,
  mockGetSession,
  mockDbQueryUsers,
  mockDbQueryCourses,
  mockDbQueryCourseAggregates,
  mockDbQueryCourseReviews,
  mockDbQueryCourseReviewVotes,
  mockDbSelect,
  mockDbInsert,
  mockDbUpdate,
  mockDbTransaction,
  mockMakeChain,
  mockHeaders,
} = vi.hoisted(() => {
  const chain = () => {
    const obj: Record<string, ReturnType<typeof vi.fn>> = {};
    obj.from = vi.fn().mockReturnValue(obj);
    obj.leftJoin = vi.fn().mockReturnValue(obj);
    obj.innerJoin = vi.fn().mockReturnValue(obj);
    obj.where = vi.fn().mockReturnValue(obj);
    obj.orderBy = vi.fn().mockReturnValue(obj);
    obj.limit = vi.fn().mockResolvedValue([]);
    obj.values = vi.fn().mockReturnValue(obj);
    obj.returning = vi.fn().mockResolvedValue([]);
    obj.onConflictDoNothing = vi.fn().mockResolvedValue(undefined);
    obj.set = vi.fn().mockReturnValue(obj);
    return obj;
  };

  const db = {
    query: {
      users: { findFirst: vi.fn() },
      courses: { findFirst: vi.fn() },
      courseAggregates: { findFirst: vi.fn() },
      courseReviews: { findFirst: vi.fn() },
      courseReviewVotes: { findFirst: vi.fn() },
    },
    select: vi.fn(() => chain()),
    insert: vi.fn(() => chain()),
    update: vi.fn(() => chain()),
  };

  return {
    mockRedirect: vi.fn(),
    mockGetSession: vi.fn(),
    mockDbQueryUsers: db.query.users,
    mockDbQueryCourses: db.query.courses,
    mockDbQueryCourseAggregates: db.query.courseAggregates,
    mockDbQueryCourseReviews: db.query.courseReviews,
    mockDbQueryCourseReviewVotes: db.query.courseReviewVotes,
    mockDbSelect: db.select,
    mockDbInsert: db.insert,
    mockDbUpdate: db.update,
    mockDbTransaction: vi.fn((callback: (database: unknown) => unknown) =>
      callback(db),
    ),
    mockMakeChain: chain,
    mockHeaders: vi.fn().mockResolvedValue(new Headers()),
  };
});

vi.mock("next/navigation", () => ({
  redirect: (...args: unknown[]) => {
    mockRedirect(...args);
    throw new Error("NEXT_REDIRECT");
  },
}));

vi.mock("next/headers", () => ({ headers: mockHeaders }));

vi.mock("@/lib/auth", () => ({
  auth: {
    api: { getSession: (opts: unknown) => mockGetSession(opts) },
  },
}));

vi.mock("@/lib/site-settings", () => ({
  getWikiEditRoleFresh: vi.fn().mockResolvedValue("user"),
}));

vi.mock("@/db", () => ({
  db: {
    query: {
      users: mockDbQueryUsers,
      courses: mockDbQueryCourses,
      courseAggregates: mockDbQueryCourseAggregates,
      courseReviews: mockDbQueryCourseReviews,
      courseReviewVotes: mockDbQueryCourseReviewVotes,
    },
    select: () => mockDbSelect(),
    insert: () => mockDbInsert(),
    update: () => mockDbUpdate(),
    transaction: (callback: (database: unknown) => unknown) =>
      mockDbTransaction(callback),
  },
}));

import {
  createCourseReview,
  getCourseDetail,
  getCourseSummaries,
  voteCourseReview,
} from "@/lib/course-actions";

function mockAuthSession(id = "user-1", role = "user") {
  mockGetSession.mockResolvedValue({
    user: { id, email: "user@cuhk.edu.hk", name: null, image: null },
  });
  mockDbQueryUsers.findFirst.mockResolvedValue({
    id,
    email: "user@cuhk.edu.hk",
    nickname: "TestUser",
    role,
    banned: false,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockDbSelect.mockImplementation(() => mockMakeChain());
  mockDbInsert.mockImplementation(() => mockMakeChain());
  mockDbUpdate.mockImplementation(() => mockMakeChain());
  mockDbTransaction.mockImplementation(
    (callback: (database: unknown) => unknown) =>
      callback({
        query: {
          courses: mockDbQueryCourses,
          courseReviews: mockDbQueryCourseReviews,
          courseReviewVotes: mockDbQueryCourseReviewVotes,
        },
        select: () => mockDbSelect(),
        insert: () => mockDbInsert(),
        update: () => mockDbUpdate(),
      }),
  );
});

describe("getCourseSummaries", () => {
  it("returns courses with aggregate averages", async () => {
    const courseSelect = mockMakeChain();
    courseSelect.limit.mockResolvedValue([
      {
        id: "course-1",
        code: "CSCI2100",
        title: "Data Structures",
        department: "CSCI",
        credits: 3,
        description: "Core data structures",
        reviewCount: 2,
        ratingSum: 18,
        difficultySum: 14,
        workloadSum: 16,
        gradingSum: 12,
      },
      {
        id: "course-2",
        code: "MATH1010",
        title: "University Mathematics",
        department: "MATH",
        credits: 3,
        description: "",
        reviewCount: null,
        ratingSum: null,
        difficultySum: null,
        workloadSum: null,
        gradingSum: null,
      },
    ]);
    mockDbSelect.mockReturnValueOnce(courseSelect);

    const summaries = await getCourseSummaries({ query: "csci" });

    expect(summaries).toEqual([
      {
        id: "course-1",
        code: "CSCI2100",
        title: "Data Structures",
        department: "CSCI",
        credits: 3,
        description: "Core data structures",
        reviewCount: 2,
        averageRating: 4.5,
        averageDifficulty: 3.5,
        averageWorkload: 4,
        averageGrading: 3,
      },
      {
        id: "course-2",
        code: "MATH1010",
        title: "University Mathematics",
        department: "MATH",
        credits: 3,
        description: "",
        reviewCount: 0,
        averageRating: null,
        averageDifficulty: null,
        averageWorkload: null,
        averageGrading: null,
      },
    ]);
    expect(courseSelect.leftJoin).toHaveBeenCalled();
  });
});

describe("createCourseReview", () => {
  it("rejects invalid rating values", async () => {
    mockAuthSession();
    await expect(
      createCourseReview("CSCI2100", {
        rating: 6,
        difficulty: 3,
        workload: 3,
        grading: 3,
        content: "good",
      }),
    ).rejects.toThrow("rating must be between 0.5 and 5");
  });

  it("rejects ratings that are not half-star increments", async () => {
    mockAuthSession();
    await expect(
      createCourseReview("CSCI2100", {
        rating: 4.25,
        difficulty: 3,
        workload: 3,
        grading: 3,
        content: "good",
      }),
    ).rejects.toThrow("rating must use 0.5 increments");
  });

  it("creates a review and refreshes course aggregates in one transaction", async () => {
    mockAuthSession();
    mockDbQueryCourses.findFirst.mockResolvedValue({ id: "course-1" });

    const reviewInsert = mockMakeChain();
    reviewInsert.returning.mockResolvedValue([{ id: "review-1" }]);
    const aggregateInsert = mockMakeChain();

    const aggregateSelect = mockMakeChain();
    aggregateSelect.where.mockResolvedValue([
      {
        reviewCount: 1,
        ratingSum: 9,
        difficultySum: 5,
        workloadSum: 8,
        gradingSum: 10,
      },
    ]);
    mockDbInsert
      .mockReturnValueOnce(reviewInsert)
      .mockReturnValueOnce(aggregateInsert);
    mockDbSelect.mockReturnValueOnce(aggregateSelect);

    const result = await createCourseReview("csci 2100", {
      rating: 4.5,
      difficulty: 2.5,
      workload: 4,
      grading: 5,
      content: " excellent ",
      anonymous: true,
    });

    expect(result).toBe("review-1");
    expect(mockDbTransaction).toHaveBeenCalled();
    expect(mockDbInsert).toHaveBeenCalledTimes(2);
    expect(mockDbUpdate).toHaveBeenCalled();
  });
});

describe("getCourseDetail", () => {
  it("returns averages from course aggregate sums", async () => {
    const now = new Date();
    mockDbQueryCourses.findFirst.mockResolvedValue({
      id: "course-1",
      code: "CSCI2100",
      title: "Data Structures",
      department: "CSCI",
      credits: 3,
      description: "",
    });
    mockDbQueryCourseAggregates.findFirst.mockResolvedValue({
      reviewCount: 2,
      ratingSum: 18,
      difficultySum: 10,
      workloadSum: 14,
      gradingSum: 16,
    });

    const reviewSelect = mockMakeChain();
    reviewSelect.limit.mockResolvedValue([
      {
        id: "review-1",
        rating: 10,
        difficulty: 6,
        workload: 8,
        grading: 8,
        content: "solid",
        term: null,
        instructor: null,
        anonymous: false,
        helpfulScore: 2,
        createdAt: now,
        userId: "user-1",
        nickname: "Alice",
      },
    ]);

    mockDbSelect.mockReturnValueOnce(reviewSelect);

    const detail = await getCourseDetail("CSCI2100");

    expect(detail.aggregate.averageRating).toBe(4.5);
    expect(detail.aggregate.averageDifficulty).toBe(2.5);
    expect(detail.reviews[0].rating).toBe(5);
    expect(detail.reviews[0].difficulty).toBe(3);
    expect(detail.reviews[0].user).toEqual({ id: "user-1", nickname: "Alice" });
  });

  it("hides user identity for anonymous reviews", async () => {
    mockDbQueryCourses.findFirst.mockResolvedValue({
      id: "course-1",
      code: "CSCI2100",
      title: "Data Structures",
      department: "CSCI",
      credits: 3,
      description: "",
    });
    mockDbQueryCourseAggregates.findFirst.mockResolvedValue(null);

    const reviewSelect = mockMakeChain();
    reviewSelect.limit.mockResolvedValue([
      {
        id: "review-1",
        rating: 10,
        difficulty: 6,
        workload: 8,
        grading: 8,
        content: "solid",
        term: null,
        instructor: null,
        anonymous: true,
        helpfulScore: 2,
        createdAt: new Date(),
        userId: "user-1",
        nickname: "Alice",
      },
    ]);

    mockDbSelect.mockReturnValueOnce(reviewSelect);

    const detail = await getCourseDetail("CSCI2100");
    expect(detail.aggregate.averageRating).toBeNull();
    expect(detail.reviews[0].user).toBeNull();
  });
});

describe("voteCourseReview", () => {
  it("updates an existing opposite vote with the correct delta", async () => {
    mockAuthSession();
    mockDbQueryCourseReviews.findFirst.mockResolvedValue({ id: "review-1" });
    mockDbQueryCourseReviewVotes.findFirst.mockResolvedValue({ value: -1 });

    const result = await voteCourseReview("review-1", 1);

    expect(result).toEqual({ helpfulScoreDelta: 2 });
    expect(mockDbUpdate).toHaveBeenCalledTimes(2);
  });

  it("is idempotent when the same vote already exists", async () => {
    mockAuthSession();
    mockDbQueryCourseReviews.findFirst.mockResolvedValue({ id: "review-1" });
    mockDbQueryCourseReviewVotes.findFirst.mockResolvedValue({ value: 1 });

    const result = await voteCourseReview("review-1", 1);

    expect(result).toEqual({ helpfulScoreDelta: 0 });
    expect(mockDbUpdate).not.toHaveBeenCalled();
  });
});
