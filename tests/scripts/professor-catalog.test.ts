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
