import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockGetCourseReviews } = vi.hoisted(() => ({
  mockGetCourseReviews: vi.fn(),
}));

vi.mock("@/lib/course-review-actions", () => ({
  getCourseReviews: (...args: unknown[]) => mockGetCourseReviews(...args),
}));

import { GET } from "@/app/api/courses/[code]/reviews/route";

function review(id: string, professorId: string | null = null) {
  return {
    id,
    content: `review ${id}`,
    createdAt: "2026-01-01T00:00:00.000Z",
    isEdited: false,
    replyCount: 0,
    likeCount: 0,
    likedByMe: false,
    canAdminDelete: false,
    professorId,
    professorName: professorId ? "Prof A" : null,
    professors: professorId
      ? [{ id: professorId, name: "Prof A" }]
      : [],
    academicYear: "2025-26",
    term: "Term 1",
    score: 4,
    tags: [],
    authorNickname: "someone",
    authorShowcaseId: null,
    authorAchievements: [],
    authorAvatarUrl: null,
    authorEquippedTitle: null,
  };
}

const REVIEWS = [
  review("r1", "p1"),
  review("r2", "p2"),
  review("r3", "p1"),
  review("r4"),
];

beforeEach(() => {
  vi.clearAllMocks();
  mockGetCourseReviews.mockResolvedValue(REVIEWS);
});

function makeRequest(code: string, search = ""): Request {
  return new Request(`http://localhost/api/courses/${code}/reviews${search}`);
}

describe("GET /api/courses/[code]/reviews", () => {
  it("returns the first page with defaults (limit 10, offset 0)", async () => {
    const res = await GET(makeRequest("CSCI3150"), {
      params: Promise.resolve({ code: "CSCI3150" }),
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({
      reviews: REVIEWS,
      total: 4,
      limit: 10,
      offset: 0,
    });
  });

  it("slices by offset/limit", async () => {
    const res = await GET(makeRequest("CSCI3150", "?limit=2&offset=1"), {
      params: Promise.resolve({ code: "CSCI3150" }),
    });
    const json = await res.json();
    expect(json.reviews.map((r: { id: string }) => r.id)).toEqual([
      "r2",
      "r3",
    ]);
    expect(json.total).toBe(4);
    expect(json.limit).toBe(2);
    expect(json.offset).toBe(1);
  });

  it("filters by professor (primary or stored professor list)", async () => {
    const res = await GET(makeRequest("CSCI3150", "?professor=p1"), {
      params: Promise.resolve({ code: "CSCI3150" }),
    });
    const json = await res.json();
    expect(json.reviews.map((r: { id: string }) => r.id)).toEqual([
      "r1",
      "r3",
    ]);
    expect(json.total).toBe(2);
  });

  it("returns an empty page past the end", async () => {
    const res = await GET(makeRequest("CSCI3150", "?offset=100"), {
      params: Promise.resolve({ code: "CSCI3150" }),
    });
    const json = await res.json();
    expect(json.reviews).toEqual([]);
    expect(json.total).toBe(4);
  });

  it("rejects limit above 50", async () => {
    const res = await GET(makeRequest("CSCI3150", "?limit=51"), {
      params: Promise.resolve({ code: "CSCI3150" }),
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "INVALID_PARAMS" });
  });

  it("rejects a negative offset", async () => {
    const res = await GET(makeRequest("CSCI3150", "?offset=-1"), {
      params: Promise.resolve({ code: "CSCI3150" }),
    });
    expect(res.status).toBe(400);
  });

  it("returns empty reviews for an unknown course", async () => {
    mockGetCourseReviews.mockResolvedValue([]);
    const res = await GET(makeRequest("NOPE4000"), {
      params: Promise.resolve({ code: "NOPE4000" }),
    });
    expect(res.status).toBe(200);
    expect((await res.json()).reviews).toEqual([]);
  });
});
