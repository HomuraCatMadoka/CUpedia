import { describe, expect, it } from "vitest";

import {
  formatProfessorNameText,
  getProfessorInitials,
  parseProfessorName,
  toTitleCaseFamilyName,
} from "@/lib/professor-name-format";

describe("parseProfessorName", () => {
  it("parses title + all-caps family name + given name", () => {
    expect(parseProfessorName("Dr. SUN Li")).toEqual({
      title: "Dr.",
      givenNames: "Li",
      familyName: "SUN",
    });
  });

  it("abbreviates Professor to Prof.", () => {
    expect(parseProfessorName("Professor CHAN Tai Man")).toEqual({
      title: "Prof.",
      givenNames: "Tai Man",
      familyName: "CHAN",
    });
  });

  it("keeps Prof. as-is", () => {
    expect(parseProfessorName("Prof. WONG Ka Ming")).toEqual({
      title: "Prof.",
      givenNames: "Ka Ming",
      familyName: "WONG",
    });
  });

  it("abbreviates Doctor to Dr.", () => {
    expect(parseProfessorName("Doctor LIU Shengchao")).toEqual({
      title: "Dr.",
      givenNames: "Shengchao",
      familyName: "LIU",
    });
  });

  it("keeps Mr. as-is", () => {
    expect(parseProfessorName("Mr. LEE")).toEqual({
      title: "Mr.",
      givenNames: null,
      familyName: "LEE",
    });
  });

  it("parses names without a title", () => {
    expect(parseProfessorName("CHAN Tai Man")).toEqual({
      title: null,
      givenNames: "Tai Man",
      familyName: "CHAN",
    });
  });

  it("supports multi-word all-caps family names", () => {
    expect(parseProfessorName("Dr. VAN DER MEER Jan")).toEqual({
      title: "Dr.",
      givenNames: "Jan",
      familyName: "VAN DER MEER",
    });
  });

  it("treats an all-caps string as family name only", () => {
    expect(parseProfessorName("TAI MAN")).toEqual({
      title: null,
      givenNames: null,
      familyName: "TAI MAN",
    });
  });

  it("treats a non-all-caps string as family name fallback", () => {
    expect(parseProfessorName("Dr. chan Tai Man")).toEqual({
      title: "Dr.",
      givenNames: null,
      familyName: "chan Tai Man",
    });
  });

  it("handles empty and whitespace-only names", () => {
    expect(parseProfessorName("")).toEqual({
      title: null,
      givenNames: null,
      familyName: "",
    });
    expect(parseProfessorName("   ")).toEqual({
      title: null,
      givenNames: null,
      familyName: "",
    });
  });

  it("keeps the original word order", () => {
    const parsed = parseProfessorName("Dr. SUN Li");
    expect([parsed.title, parsed.familyName, parsed.givenNames].join(" ")).toBe(
      "Dr. SUN Li",
    );
  });
});

describe("toTitleCaseFamilyName", () => {
  it("title-cases a single all-caps word", () => {
    expect(toTitleCaseFamilyName("SUN")).toBe("Sun");
  });

  it("title-cases each word of a multi-word family name", () => {
    expect(toTitleCaseFamilyName("VAN DER MEER")).toBe("Van Der Meer");
  });

  it("title-cases hyphenated family names", () => {
    expect(toTitleCaseFamilyName("WONG-KA")).toBe("Wong-Ka");
  });

  it("handles empty input", () => {
    expect(toTitleCaseFamilyName("")).toBe("");
  });
});

describe("formatProfessorNameText", () => {
  it("formats title + family name + given name in original order", () => {
    expect(formatProfessorNameText("Dr. SUN Li")).toBe("Dr. Sun Li");
  });

  it("abbreviates Professor and title-cases the family name", () => {
    expect(formatProfessorNameText("Professor CHAN Tai Man")).toBe(
      "Prof. Chan Tai Man",
    );
  });

  it("handles family-name-only names", () => {
    expect(formatProfessorNameText("Mr. LEE")).toBe("Mr. Lee");
  });

  it("handles multi-word family names", () => {
    expect(formatProfessorNameText("Dr. VAN DER MEER Jan")).toBe(
      "Dr. Van Der Meer Jan",
    );
  });

  it("handles empty names", () => {
    expect(formatProfessorNameText("")).toBe("");
  });
});

describe("getProfessorInitials", () => {
  it("excludes the title from initials", () => {
    expect(getProfessorInitials("Dr. SUN Li")).toBe("SL");
  });

  it("uses family name + first given name initial", () => {
    expect(getProfessorInitials("Professor CHAN Tai Man")).toBe("CT");
    expect(getProfessorInitials("Prof. WONG Ka Ming")).toBe("WK");
  });

  it("returns a single letter for family-name-only names", () => {
    expect(getProfessorInitials("Mr. LEE")).toBe("L");
  });

  it("handles multi-word family names", () => {
    expect(getProfessorInitials("Dr. VAN DER MEER Jan")).toBe("VJ");
  });

  it("handles names without a title", () => {
    expect(getProfessorInitials("CHAN Tai Man")).toBe("CT");
  });

  it("handles all-caps family-name-only names", () => {
    expect(getProfessorInitials("TAI MAN")).toBe("T");
  });

  it("handles empty names", () => {
    expect(getProfessorInitials("")).toBe("");
  });
});
