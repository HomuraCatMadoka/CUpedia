import { describe, it, expect } from "vitest";

import {
  parseSearchQuery,
  parseCourseListQuery,
  parseReviewBody,
  parseCollegePickBody,
  parseVoteBody,
  parseMessageBody,
} from "@/lib/cli-api/schemas";

describe("parseSearchQuery", () => {
  it("accepts a plain q", () => {
    expect(parseSearchQuery({ q: "  algo  " })).toEqual({
      ok: true,
      value: { q: "algo" },
    });
  });

  it("accepts URLSearchParams input", () => {
    const params = new URLSearchParams({ q: "algo", limit: "10", type: "course" });
    expect(parseSearchQuery(params)).toEqual({
      ok: true,
      value: { q: "algo", limit: 10, type: "course" },
    });
  });

  it("rejects a missing or blank q", () => {
    expect(parseSearchQuery({})).toEqual({ ok: false, error: "INVALID_PARAMS" });
    expect(parseSearchQuery({ q: "   " })).toEqual({
      ok: false,
      error: "INVALID_PARAMS",
    });
    expect(parseSearchQuery({ q: 42 })).toEqual({
      ok: false,
      error: "INVALID_PARAMS",
    });
  });

  it("rejects an out-of-range limit", () => {
    expect(parseSearchQuery({ q: "algo", limit: "0" })).toEqual({
      ok: false,
      error: "INVALID_PARAMS",
    });
    expect(parseSearchQuery({ q: "algo", limit: "51" })).toEqual({
      ok: false,
      error: "INVALID_PARAMS",
    });
  });

  it("rejects an unknown type", () => {
    expect(parseSearchQuery({ q: "algo", type: "video" })).toEqual({
      ok: false,
      error: "INVALID_PARAMS",
    });
  });
});

describe("parseCourseListQuery", () => {
  it("accepts an empty query", () => {
    expect(parseCourseListQuery({})).toEqual({ ok: true, value: {} });
  });

  it("parses all supported filters", () => {
    expect(
      parseCourseListQuery({
        query: "  algorithm  ",
        subject: "CSCI",
        level: "3000",
        sort: "rating-count",
        page: "2",
      }),
    ).toEqual({
      ok: true,
      value: {
        query: "algorithm",
        subject: "CSCI",
        level: "3000",
        sort: "rating-count",
        page: 2,
      },
    });
  });

  it("rejects a blank query/subject and bad level/sort/page", () => {
    expect(parseCourseListQuery({ query: "  " })).toEqual({
      ok: false,
      error: "INVALID_PARAMS",
    });
    expect(parseCourseListQuery({ subject: "" })).toEqual({
      ok: false,
      error: "INVALID_PARAMS",
    });
    expect(parseCourseListQuery({ level: "9999" })).toEqual({
      ok: false,
      error: "INVALID_PARAMS",
    });
    expect(parseCourseListQuery({ sort: "popular" })).toEqual({
      ok: false,
      error: "INVALID_PARAMS",
    });
    expect(parseCourseListQuery({ page: "0" })).toEqual({
      ok: false,
      error: "INVALID_PARAMS",
    });
    expect(parseCourseListQuery({ page: "abc" })).toEqual({
      ok: false,
      error: "INVALID_PARAMS",
    });
  });
});

describe("parseReviewBody", () => {
  const valid = { rating: 4, content: "Great course" };

  it("accepts a valid body", () => {
    expect(parseReviewBody(valid)).toEqual({
      ok: true,
      value: { rating: 4, content: "Great course" },
    });
  });

  it("trims content and keeps an optional professorId", () => {
    expect(
      parseReviewBody({ ...valid, content: "  nice  ", professorId: "p-1" }),
    ).toEqual({
      ok: true,
      value: { rating: 4, content: "nice", professorId: "p-1" },
    });
  });

  it("rejects non-object input as INVALID_JSON", () => {
    expect(parseReviewBody(null)).toEqual({ ok: false, error: "INVALID_JSON" });
    expect(parseReviewBody("text")).toEqual({ ok: false, error: "INVALID_JSON" });
    expect(parseReviewBody([1, 2])).toEqual({ ok: false, error: "INVALID_JSON" });
  });

  it("rejects out-of-range or non-integer ratings", () => {
    expect(parseReviewBody({ ...valid, rating: 0 })).toEqual({
      ok: false,
      error: "INVALID_PARAMS",
    });
    expect(parseReviewBody({ ...valid, rating: 6 })).toEqual({
      ok: false,
      error: "INVALID_PARAMS",
    });
    expect(parseReviewBody({ ...valid, rating: 3.5 })).toEqual({
      ok: false,
      error: "INVALID_PARAMS",
    });
    expect(parseReviewBody({ ...valid, rating: "4" })).toEqual({
      ok: false,
      error: "INVALID_PARAMS",
    });
  });

  it("rejects missing/blank content", () => {
    expect(parseReviewBody({ ...valid, content: "" })).toEqual({
      ok: false,
      error: "INVALID_PARAMS",
    });
    expect(parseReviewBody({ rating: 4 })).toEqual({
      ok: false,
      error: "INVALID_PARAMS",
    });
  });
});

describe("parseCollegePickBody", () => {
  const valid = {
    majorGroup: "engineering",
    priorities: ["Commute_Time", "Hostel_Guarantee", ""],
    avoids: ["College_FYP"],
  };

  it("accepts a minimal valid input", () => {
    expect(parseCollegePickBody(valid)).toEqual({
      ok: true,
      value: {
        majorGroup: "engineering",
        priorities: ["Commute_Time", "Hostel_Guarantee", ""],
        avoids: ["College_FYP"],
      },
    });
  });

  it("accepts optional fields", () => {
    expect(
      parseCollegePickBody({
        ...valid,
        smallCollegePreference: "aim",
        bonusFactors: ["MTR_Distance"],
        smallCollegeAnswers: { q1: "A", q2: "C", q3: "B", q4: "A" },
      }),
    ).toEqual({
      ok: true,
      value: {
        majorGroup: "engineering",
        priorities: ["Commute_Time", "Hostel_Guarantee", ""],
        avoids: ["College_FYP"],
        smallCollegePreference: "aim",
        bonusFactors: ["MTR_Distance"],
        smallCollegeAnswers: { q1: "A", q2: "C", q3: "B", q4: "A" },
      },
    });
  });

  it("rejects a bad majorGroup", () => {
    expect(parseCollegePickBody({ ...valid, majorGroup: "law" })).toEqual({
      ok: false,
      error: "INVALID_PARAMS",
    });
  });

  it("rejects wrong-shaped priorities", () => {
    expect(parseCollegePickBody({ ...valid, priorities: ["Commute_Time"] })).toEqual({
      ok: false,
      error: "INVALID_PARAMS",
    });
    expect(
      parseCollegePickBody({ ...valid, priorities: ["NotAFactor", "", ""] }),
    ).toEqual({ ok: false, error: "INVALID_PARAMS" });
  });

  it("rejects skipped slots (position 2 empty but position 3 filled)", () => {
    expect(
      parseCollegePickBody({
        ...valid,
        priorities: ["Commute_Time", "", "Hostel_Guarantee"],
      }),
    ).toEqual({ ok: false, error: "INVALID_PARAMS" });
  });

  it("rejects duplicated priorities", () => {
    expect(
      parseCollegePickBody({
        ...valid,
        priorities: ["Commute_Time", "Commute_Time", ""],
      }),
    ).toEqual({ ok: false, error: "INVALID_PARAMS" });
  });

  it("rejects unknown avoid/bonus factors and bad small-college answers", () => {
    expect(parseCollegePickBody({ ...valid, avoids: ["NotAvoid"] })).toEqual({
      ok: false,
      error: "INVALID_PARAMS",
    });
    expect(
      parseCollegePickBody({ ...valid, bonusFactors: ["NotBonus"] }),
    ).toEqual({ ok: false, error: "INVALID_PARAMS" });
    expect(
      parseCollegePickBody({
        ...valid,
        smallCollegeAnswers: { q1: "C", q2: "A", q3: "A", q4: "A" },
      }),
    ).toEqual({ ok: false, error: "INVALID_PARAMS" });
  });

  it("rejects non-object input", () => {
    expect(parseCollegePickBody(undefined)).toEqual({
      ok: false,
      error: "INVALID_JSON",
    });
  });
});

describe("parseVoteBody", () => {
  it("accepts like/dislike votes", () => {
    expect(parseVoteBody({ dishId: "dish-1", vote: "like" })).toEqual({
      ok: true,
      value: { dishId: "dish-1", vote: "like" },
    });
    expect(parseVoteBody({ dishId: " dish-1 ", vote: "dislike" })).toEqual({
      ok: true,
      value: { dishId: "dish-1", vote: "dislike" },
    });
  });

  it("rejects an empty vote (null)", () => {
    expect(parseVoteBody({ dishId: "dish-1", vote: null })).toEqual({
      ok: false,
      error: "INVALID_VOTE",
    });
  });

  it("rejects an unknown vote value", () => {
    expect(parseVoteBody({ dishId: "dish-1", vote: "up" })).toEqual({
      ok: false,
      error: "INVALID_VOTE",
    });
  });

  it("rejects a missing or blank dishId", () => {
    expect(parseVoteBody({ vote: "like" })).toEqual({
      ok: false,
      error: "INVALID_PARAMS",
    });
    expect(parseVoteBody({ dishId: "", vote: "like" })).toEqual({
      ok: false,
      error: "INVALID_PARAMS",
    });
  });
});

describe("parseMessageBody", () => {
  it("accepts valid content and trims it", () => {
    expect(parseMessageBody({ content: "  hello  " })).toEqual({
      ok: true,
      value: { content: "hello" },
    });
  });

  it("rejects blank content", () => {
    expect(parseMessageBody({ content: "" })).toEqual({
      ok: false,
      error: "INVALID_DANMAKU",
    });
  });

  it("rejects over-long content", () => {
    expect(parseMessageBody({ content: "x".repeat(101) })).toEqual({
      ok: false,
      error: "INVALID_DANMAKU",
    });
  });

  it("rejects HTML tags", () => {
    expect(parseMessageBody({ content: "hi <b>bold</b>" })).toEqual({
      ok: false,
      error: "INVALID_DANMAKU",
    });
  });

  it("rejects non-object input", () => {
    expect(parseMessageBody("hello")).toEqual({
      ok: false,
      error: "INVALID_JSON",
    });
  });
});
