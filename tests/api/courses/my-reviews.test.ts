import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";

const { mockGetMyCourseReviewHistory, mockRequireCliAuth } = vi.hoisted(
  () => ({
    mockGetMyCourseReviewHistory: vi.fn(),
    mockRequireCliAuth: vi.fn(),
  }),
);

vi.mock("@/lib/course-review-actions", () => ({
  getMyCourseReviewHistory: (...args: unknown[]) =>
    mockGetMyCourseReviewHistory(...args),
}));

vi.mock("@/lib/cli-api/auth", () => ({
  requireCliAuth: (...args: unknown[]) => mockRequireCliAuth(...args),
}));

import { GET } from "@/app/api/courses/my-reviews/route";

const USER = { id: "user-1", email: "u@cuhk.edu.hk", nickname: "N", role: "user", banned: false };

const HISTORY = [
  {
    ratingId: "rating-1",
    courseCode: "CSCI3150",
    courseTitle: "PLP",
    score: 4,
    academicYear: "2025-26",
    term: "Term 1",
    professorName: null,
    professors: [],
    tags: [],
    isAnonymous: false,
    content: "good",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireCliAuth.mockResolvedValue({
    user: USER,
    response: null,
  });
  mockGetMyCourseReviewHistory.mockResolvedValue(HISTORY);
});

describe("GET /api/courses/my-reviews", () => {
  it("requires CLI auth (401 when anonymous)", async () => {
    mockRequireCliAuth.mockResolvedValue({
      user: null,
      response: NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 }),
    });
    const res = await GET(
      new Request("http://localhost/api/courses/my-reviews"),
    );
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "UNAUTHORIZED" });
    expect(mockGetMyCourseReviewHistory).not.toHaveBeenCalled();
  });

  it("returns the caller's review history, passing the user in", async () => {
    const res = await GET(
      new Request("http://localhost/api/courses/my-reviews"),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ reviews: HISTORY });
    expect(mockGetMyCourseReviewHistory).toHaveBeenCalledWith({
      id: "user-1",
    });
  });
});
