import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockGetCourse } = vi.hoisted(() => ({
  mockGetCourse: vi.fn(),
}));

vi.mock("@/lib/course-review-actions", () => ({
  getCourse: (...args: unknown[]) => mockGetCourse(...args),
}));

import { GET } from "@/app/api/courses/[code]/route";

const COURSE = {
  code: "CSCI3150",
  subject: "CSCI",
  title: "Principles of Programming Languages",
  units: 3,
  description: "PLP",
  terms: ["Term 1", "Term 2"],
  genderRestriction: null,
  reviewCount: 2,
  rating: 4.5,
  ratingCount: 2,
  latestCommentAt: null,
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/courses/[code]", () => {
  it("returns the course for a known code", async () => {
    mockGetCourse.mockResolvedValue(COURSE);
    const res = await GET(
      new Request("http://localhost/api/courses/CSCI3150"),
      { params: Promise.resolve({ code: "CSCI3150" }) },
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ course: COURSE });
    expect(mockGetCourse).toHaveBeenCalledWith("CSCI3150");
  });

  it("passes the code through untouched (normalization lives in getCourse)", async () => {
    mockGetCourse.mockResolvedValue(COURSE);
    await GET(new Request("http://localhost/api/courses/csci%203150"), {
      params: Promise.resolve({ code: "csci 3150" }),
    });
    expect(mockGetCourse).toHaveBeenCalledWith("csci 3150");
  });

  it("returns 404 NOT_FOUND for an unknown code", async () => {
    mockGetCourse.mockResolvedValue(null);
    const res = await GET(
      new Request("http://localhost/api/courses/NOPE4000"),
      { params: Promise.resolve({ code: "NOPE4000" }) },
    );
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "NOT_FOUND" });
  });
});
