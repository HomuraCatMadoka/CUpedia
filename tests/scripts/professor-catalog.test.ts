import { describe, expect, it } from "vitest";
import {
  buildProfessorCatalog,
  normalizeProfessorName,
  professorId,
} from "../../scripts/professor-catalog";

describe("professor catalog", () => {
  it("normalizes titles and whitespace to one stable identity", () => {
    expect(normalizeProfessorName(" Prof.  CHAN Wing Kai, ")).toBe(
      "Professor CHAN Wing Kai",
    );
    expect(professorId("Prof. CHAN Wing Kai")).toBe(
      professorId("Professor CHAN Wing Kai"),
    );
    expect(professorId("Professor SHAO Baihao<")).toBe(
      professorId("Professor SHAO Baihao"),
    );
  });

  it("merges courses from a trailing-angle-bracket timetable typo", () => {
    const records = buildProfessorCatalog([
      { name: "Professor SHAO Baihao", courses: ["BMEG3100"] },
      { name: "Professor SHAO Baihao<", courses: ["BMEG4450"] },
    ]);
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      name: "Professor SHAO Baihao",
      courses: ["BMEG3100", "BMEG4450"],
    });
  });

  it("splits same-name instructors only for reviewed course identity overrides", () => {
    const records = buildProfessorCatalog(
      [
        {
          name: "Professor CHEN Yue",
          courses: ["ACCT2121", "EEEN4050", "GEUC4011"],
        },
      ],
      [
        {
          coursePrefix: "ACCT",
          instructorName: "Professor CHEN Yue",
          profileUrl: "https://example.test/accountancy/",
          evidenceUrl: "https://example.test/accountancy/evidence",
        },
        {
          coursePrefix: "EEEN",
          instructorName: "Professor CHEN Yue",
          profileUrl: "https://example.test/engineering/",
          evidenceUrl: "https://example.test/engineering/evidence",
        },
      ],
    );

    expect(records).toHaveLength(3);
    expect(records.map((record) => record.id)).toHaveLength(
      new Set(records.map((record) => record.id)).size,
    );
    expect(records).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          courses: ["ACCT2121"],
          identityProfileUrl: "https://example.test/accountancy/",
        }),
        expect.objectContaining({
          courses: ["EEEN4050"],
          identityProfileUrl: "https://example.test/engineering/",
        }),
        expect.objectContaining({ courses: ["GEUC4011"] }),
      ]),
    );
    expect(
      records.find((record) => record.courses.includes("GEUC4011")),
    ).not.toHaveProperty("identityProfileUrl");
  });

  it("deduplicates staff and course assignments", () => {
    const [record] = buildProfessorCatalog([
      { name: "Prof. CHAN Wing Kai", courses: ["csci 2100"] },
      {
        name: "Professor CHAN Wing Kai",
        courses: ["CSCI2100", "CSCI3100"],
      },
    ]);
    expect(record).toMatchObject({
      name: "Professor CHAN Wing Kai",
      courses: ["CSCI2100", "CSCI3100"],
    });
    expect(record?.searchText).toBe("professor chan wing kai");
  });
});
