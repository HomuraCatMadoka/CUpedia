import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockGetCourses } = vi.hoisted(() => ({
  mockGetCourses: vi.fn(),
}));

vi.mock("@/lib/course-review-actions", () => ({
  getCourses: (...args: unknown[]) => mockGetCourses(...args),
}));

import { GET } from "@/app/api/courses/route";

const PAGE = {
  courses: [
    {
      code: "CSCI3150",
      subject: "CSCI",
      title: "Principles of Programming Languages",
      units: 3,
      description: "",
      terms: ["Term 1"],
      genderRestriction: null,
      reviewCount: 2,
      rating: 4.5,
      ratingCount: 2,
      latestCommentAt: "2026-01-01T00:00:00.000Z",
    },
  ],
  total: 1,
  page: 1,
  pageSize: 48,
};

function makeRequest(search = ""): Request {
  return new Request(`http://localhost/api/courses${search}`);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetCourses.mockResolvedValue(PAGE);
});

describe("GET /api/courses", () => {
  it("returns the course page with defaults", async () => {
    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({
      courses: PAGE.courses,
      total: 1,
      page: 1,
      pageSize: 48,
    });
    expect(mockGetCourses).toHaveBeenCalledWith({ page: 1 });
  });

  it("maps the CLI `q` param onto the shared `query` filter", async () => {
    await GET(makeRequest("?q=algo&page=2"));
    expect(mockGetCourses).toHaveBeenCalledWith({
      query: "algo",
      page: 2,
    });
  });

  it("forwards subject/sort/level filters", async () => {
    await GET(
      makeRequest(
        "?query=os&subject=CSCI&sort=latest&level=4000&page=3",
      ),
    );
    expect(mockGetCourses).toHaveBeenCalledWith({
      query: "os",
      subject: "CSCI",
      sort: "latest",
      level: "4000",
      page: 3,
    });
  });

  it("rejects an invalid page", async () => {
    const res = await GET(makeRequest("?page=0"));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "INVALID_PARAMS" });
    expect(mockGetCourses).not.toHaveBeenCalled();
  });

  it("rejects a limit above the 48 ceiling", async () => {
    const res = await GET(makeRequest("?limit=49"));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "INVALID_PARAMS" });
  });

  it("rejects an invalid sort value", async () => {
    const res = await GET(makeRequest("?sort=hot"));
    expect(res.status).toBe(400);
  });
});
