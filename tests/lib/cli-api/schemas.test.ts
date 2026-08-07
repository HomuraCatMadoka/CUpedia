import { describe, it, expect } from "vitest";

import {
  parseCourseListQuery,
  parseCollegePickBody,
} from "@/lib/cli-api/schemas";

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
