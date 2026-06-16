import { describe, it, expect } from "vitest";
import { normalizeCourse } from "@/lib/normalizeCourse";

describe("normalizeCourse", () => {
  const base = {
    subject: "CSCI",
    code: "1130",
    title: "Introduction to Computing Using Java",
    units: "3.00",
    description: "  Basics of programming.  ",
    requirements: "Pre-requisite: CSCI1020",
    career: "Undergraduate",
    terms: ["2025-26 Term 1", "2025-26 Term 2"],
  };

  it("filters out non-undergraduate courses", () => {
    expect(normalizeCourse({ ...base, career: "Postgraduate" })).toBeNull();
    expect(normalizeCourse({ ...base, career: "Research" })).toBeNull();
  });

  it("keeps undergraduate (and missing career defaults to UG)", () => {
    expect(normalizeCourse(base)?.code).toBe("CSCI1130");
    expect(normalizeCourse({ ...base, career: undefined })?.code).toBe(
      "CSCI1130",
    );
  });

  it("converts units string to number", () => {
    expect(normalizeCourse(base)?.units).toBe(3);
    expect(normalizeCourse({ ...base, units: "1.5" })?.units).toBe(1.5);
    expect(normalizeCourse({ ...base, units: 2 })?.units).toBe(2);
    expect(normalizeCourse({ ...base, units: "n/a" })?.units).toBe(0);
  });

  it("builds a stable full code, prefixing subject and stripping noise", () => {
    expect(normalizeCourse({ ...base, code: "1130" })?.code).toBe("CSCI1130");
    expect(normalizeCourse({ ...base, code: "csci 1130" })?.code).toBe(
      "CSCI1130",
    );
    expect(normalizeCourse({ ...base, code: "(1370)" })?.code).toBe("CSCI1370");
  });

  it("strips list-page remark from title and trims description", () => {
    const c = normalizeCourse({
      ...base,
      title: "Archery ** available as of 2026-07-01",
      description: "  Learn archery.  ",
    });
    expect(c?.title).toBe("Archery");
    expect(c?.description).toBe("Learn archery.");
  });

  it("maps term names to season codes, ignoring summer and year", () => {
    expect(normalizeCourse(base)?.terms).toEqual(["T1", "T2"]);
    expect(
      normalizeCourse({ ...base, terms: ["2025-26 Term 1"] })?.terms,
    ).toEqual(["T1"]);
    expect(
      normalizeCourse({ ...base, terms: ["Summer Session"] })?.terms,
    ).toEqual([]);
    // 同一季节去重
    expect(
      normalizeCourse({ ...base, terms: ["Term 1", "First Term"] })?.terms,
    ).toEqual(["T1"]);
  });

  it("returns null when no course code is present", () => {
    expect(normalizeCourse({ ...base, code: "", courseCode: "" })).toBeNull();
  });

  it("prefers requirementsRaw, falling back to requirements", () => {
    expect(normalizeCourse(base)?.requirementsRaw).toBe(
      "Pre-requisite: CSCI1020",
    );
    expect(
      normalizeCourse({ ...base, requirementsRaw: "Not for ENGG students" })
        ?.requirementsRaw,
    ).toBe("Not for ENGG students");
  });
});
