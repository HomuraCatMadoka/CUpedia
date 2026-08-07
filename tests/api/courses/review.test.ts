import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";

const { mockSubmitCourseReview, mockRequireCliAuth } = vi.hoisted(() => ({
  mockSubmitCourseReview: vi.fn(),
  mockRequireCliAuth: vi.fn(),
}));

vi.mock("@/lib/course-review-actions", () => ({
  submitCourseReview: (...args: unknown[]) => mockSubmitCourseReview(...args),
}));

vi.mock("@/lib/cli-api/auth", () => ({
  requireCliAuth: (...args: unknown[]) => mockRequireCliAuth(...args),
}));

import { POST } from "@/app/api/courses/[code]/review/route";

const USER = { id: "user-1", email: "u@cuhk.edu.hk", nickname: "N", role: "user", banned: false };
const AUTH_OK = { user: USER, response: null };

const VALID_BODY = {
  score: 4,
  content: "Good course",
  academicYear: "2025-26",
  term: "Term 1",
};

function makeRequest(body: unknown): Request {
  return new Request("http://localhost/api/courses/CSCI3150/review", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

function params() {
  return { params: Promise.resolve({ code: "CSCI3150" }) };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireCliAuth.mockResolvedValue(AUTH_OK);
  mockSubmitCourseReview.mockResolvedValue({ newAchievementNotices: [] });
});

describe("POST /api/courses/[code]/review", () => {
  it("requires CLI auth (401 when anonymous)", async () => {
    mockRequireCliAuth.mockResolvedValue({
      user: null,
      response: NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 }),
    });
    const res = await POST(makeRequest(VALID_BODY), params());
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "UNAUTHORIZED" });
    expect(mockSubmitCourseReview).not.toHaveBeenCalled();
  });

  it("forwards the auth error response (e.g. banned user)", async () => {
    mockRequireCliAuth.mockResolvedValue({
      user: null,
      response: NextResponse.json({ error: "USER_BANNED" }, { status: 403 }),
    });
    const res = await POST(makeRequest(VALID_BODY), params());
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "USER_BANNED" });
  });

  it("rejects a non-JSON body", async () => {
    const res = await POST(
      new Request("http://localhost/api/courses/CSCI3150/review", {
        method: "POST",
        body: "not json",
      }),
      params(),
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "INVALID_JSON" });
  });

  it.each([0, 0.4, 5.5, "4", null])(
    "rejects invalid score %s",
    async (score) => {
      const res = await POST(
        makeRequest({ ...VALID_BODY, score }),
        params(),
      );
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: "INVALID_PARAMS" });
      expect(mockSubmitCourseReview).not.toHaveBeenCalled();
    },
  );

  it("accepts half-star scores", async () => {
    const res = await POST(
      makeRequest({ ...VALID_BODY, score: 4.5 }),
      params(),
    );
    expect(res.status).toBe(201);
  });

  it("rejects content longer than 2000 chars", async () => {
    const res = await POST(
      makeRequest({ ...VALID_BODY, content: "x".repeat(2001) }),
      params(),
    );
    expect(res.status).toBe(400);
  });

  it("rejects a non-string content", async () => {
    const res = await POST(
      makeRequest({ ...VALID_BODY, content: 42 }),
      params(),
    );
    expect(res.status).toBe(400);
  });

  it.each(["2024", "2025-27", "去年", 2025])(
    "rejects invalid academicYear %s",
    async (academicYear) => {
      const res = await POST(
        makeRequest({ ...VALID_BODY, academicYear }),
        params(),
      );
      expect(res.status).toBe(400);
    },
  );

  it("rejects an invalid term", async () => {
    const res = await POST(
      makeRequest({ ...VALID_BODY, term: "Term 3" }),
      params(),
    );
    expect(res.status).toBe(400);
  });

  it("rejects a non-boolean isAnonymous", async () => {
    const res = await POST(
      makeRequest({ ...VALID_BODY, isAnonymous: "yes" }),
      params(),
    );
    expect(res.status).toBe(400);
  });

  it("rejects professorIds that are not a string array", async () => {
    const res = await POST(
      makeRequest({ ...VALID_BODY, professorIds: ["p1", 2] }),
      params(),
    );
    expect(res.status).toBe(400);
  });

  it("submits the review and passes the authenticated user through", async () => {
    const res = await POST(
      makeRequest({ ...VALID_BODY, professorIds: ["p1"], isAnonymous: true }),
      params(),
    );
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ newAchievementNotices: [] });
    expect(mockSubmitCourseReview).toHaveBeenCalledWith(
      "CSCI3150",
      {
        score: 4,
        content: "Good course",
        academicYear: "2025-26",
        term: "Term 1",
        professorIds: ["p1"],
        isAnonymous: true,
      },
      { id: "user-1", nickname: "N" },
    );
  });

  it("maps an unknown-course error to 404", async () => {
    mockSubmitCourseReview.mockRejectedValue(new Error("课程不存在"));
    const res = await POST(makeRequest(VALID_BODY), params());
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "NOT_FOUND" });
  });

  it("maps contributor setup errors to 403 ACCOUNT_SETUP_REQUIRED", async () => {
    mockSubmitCourseReview.mockRejectedValue(
      Object.assign(new Error("ACCOUNT_SETUP_REQUIRED"), {
        code: "ACCOUNT_SETUP_REQUIRED",
      }),
    );
    const res = await POST(makeRequest(VALID_BODY), params());
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "ACCOUNT_SETUP_REQUIRED" });
  });

  it("maps other lib validation errors to 400 with the message", async () => {
    mockSubmitCourseReview.mockRejectedValue(new Error("评论内容过长"));
    const res = await POST(makeRequest(VALID_BODY), params());
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: "INVALID_PARAMS",
      message: "评论内容过长",
    });
  });
});
