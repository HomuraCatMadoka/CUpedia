import { describe, expect, it } from "vitest";
import {
  TARGET_TERMS,
  buildTeachingStaffIndex,
  extractInstructorsForTerm,
  formatFullCourseCode,
  isUndergraduateCourseCode,
  normalizeInstructor,
  splitInstructors,
  toTeachingStaffDatabase,
  type PlannerSubjectFile,
} from "../../scripts/crawl-teaching-staff-lib";

const sampleCsci: PlannerSubjectFile = {
  metadata: { subject: "CSCI" },
  courses: [
    {
      subject: "CSCI",
      course_code: "1130",
      terms: [
        {
          term_name: "2025-26 Term 1",
          schedule: [
            {
              meetings: [{ instructor: "Dr. LAW Yat Chiu" }],
            },
          ],
        },
      ],
    },
    {
      subject: "CSCI",
      course_code: "2100",
      terms: [
        {
          term_name: "2025-26 Term 1",
          schedule: [
            {
              meetings: [{ instructor: "Dr. LAW Yat Chiu" }],
            },
          ],
        },
        {
          term_name: "2025-26 Term 2",
          schedule: [
            {
              meetings: [{ instructor: "Prof. CHAN Wing Kai" }],
            },
          ],
        },
      ],
    },
    {
      subject: "CSCI",
      course_code: "5100",
      terms: [
        {
          term_name: "2025-26 Term 1",
          schedule: [
            {
              meetings: [{ instructor: "Dr. POSTGRAD Only" }],
            },
          ],
        },
      ],
    },
    {
      subject: "CSCI",
      course_code: "1030",
      terms: [
        {
          term_name: "2025-26 Term 1",
          schedule: [
            {
              meetings: [{ instructor: "-" }, { instructor: "Mr. FUNG Ping Fu" }],
            },
          ],
        },
      ],
    },
  ],
};

describe("crawl-teaching-staff-lib", () => {
  it("skips postgraduate course numbers (>= 5000)", () => {
    expect(isUndergraduateCourseCode("4999")).toBe(true);
    expect(isUndergraduateCourseCode("5000")).toBe(false);
    expect(isUndergraduateCourseCode("5100")).toBe(false);
  });

  it("formats full course codes", () => {
    expect(formatFullCourseCode("CSCI", "1130")).toBe("CSCI1130");
  });

  it("filters invalid instructor placeholders", () => {
    expect(normalizeInstructor("Dr. LAW Yat Chiu")).toBe("Dr. LAW Yat Chiu");
    expect(normalizeInstructor("-")).toBeNull();
    expect(normalizeInstructor("  ")).toBeNull();
  });

  it("splits multi-instructor fields from IND sections", () => {
    const names = splitInstructors(
      "Dr. CHAN Hoi Kei Gloria, \nDr. FOK Hung Kit, \nProfessor ZHAO Jingjing",
    );
    expect(names).toEqual([
      "Dr. CHAN Hoi Kei Gloria",
      "Dr. FOK Hung Kit",
      "Professor ZHAO Jingjing",
    ]);
  });

  it("extracts unique instructors for a term", () => {
    expect(
      extractInstructorsForTerm(sampleCsci.courses[3]!, "2025-26 Term 1"),
    ).toEqual(["Mr. FUNG Ping Fu"]);
  });

  it("aggregates staff across terms and merges duplicate courses", () => {
    const index = buildTeachingStaffIndex([sampleCsci], TARGET_TERMS);
    expect(index.get("Dr. LAW Yat Chiu")).toEqual(
      new Set(["CSCI1130", "CSCI2100"]),
    );
    expect(index.get("Prof. CHAN Wing Kai")).toEqual(new Set(["CSCI2100"]));
    expect(index.get("Dr. POSTGRAD Only")).toBeUndefined();
    expect(index.get("Mr. FUNG Ping Fu")).toEqual(new Set(["CSCI1030"]));
  });

  it("serializes to the Teaching Staff JSON contract", () => {
    const index = buildTeachingStaffIndex([sampleCsci], TARGET_TERMS);
    const db = toTeachingStaffDatabase(index, {
      source: "test",
      subjectCount: 1,
      scrapedAt: "2026-06-17T00:00:00.000Z",
    });

    expect(db.metadata.staff_count).toBe(3);
    expect(db.staff[0]).toEqual({
      "Teaching Staff": "Dr. LAW Yat Chiu",
      "Teaching Courses": ["CSCI1130", "CSCI2100"],
    });
  });
});
