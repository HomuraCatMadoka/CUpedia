import { describe, expect, it } from "vitest";

import {
  type HandbookSnapshotEntry,
  snapshotMajorName,
  validateHandbookSnapshot,
} from "@/lib/handbook-snapshot";

function entry(
  title: string,
  handbookYear: string,
  overrides: Partial<HandbookSnapshotEntry["leaf"]> = {},
): HandbookSnapshotEntry {
  return {
    meta: {
      file: `${title}.html`,
      programme: title,
      programmeKind: "major",
      handbookYear,
    },
    leaf: {
      title,
      programmeKind: "major",
      totalUnits: 3,
      categories: [
        {
          name: "Required",
          kind: "required",
          unitsRequired: 3,
          pickN: null,
          members: ["TEST1000"],
        },
      ],
      courseList: [],
      ...overrides,
    },
  };
}

describe("validateHandbookSnapshot", () => {
  it("accepts one complete four-year Major snapshot", () => {
    const result = validateHandbookSnapshot([
      entry("Computer Science", "2022-23"),
      entry("Computer Science", "2023-24"),
      entry("Computer Science", "2024-25"),
      entry("Computer Science", "2025-26"),
    ]);
    expect(result.errors).toEqual([]);
    expect(result.years).toEqual(["2022-23", "2023-24", "2024-25", "2025-26"]);
  });

  it("uses the official programme name only to disambiguate same-title degrees", () => {
    const ba = entry("Early Childhood Education", "2025-26");
    ba.meta.programme = "B.A. in Early Childhood Education";
    const bed = entry("Early Childhood Education", "2025-26");
    bed.meta.programme = "B.Ed. in Early Childhood Education";
    expect(snapshotMajorName(ba, [ba, bed])).toBe(
      "B.A. in Early Childhood Education",
    );
    expect(snapshotMajorName(entry("Computer Science", "2025-26"), [ba])).toBe(
      "Computer Science",
    );
  });

  it("uses navigation metadata instead of a duplicated Word heading", () => {
    const gerontology = entry(
      "Community Health Practice Gerontology",
      "2025-26",
    );
    gerontology.meta.programme = "B.Sc. in Gerontology";
    expect(snapshotMajorName(gerontology, [gerontology])).toBe("Gerontology");
  });

  it("rejects duplicate, Minor, empty, and partial snapshots before writes", () => {
    const duplicate = entry("Computer Science", "2025-26");
    const minor = entry("Entrepreneurship", "2025-26", {
      programmeKind: "minor",
      categories: [],
    });
    const { errors } = validateHandbookSnapshot([duplicate, duplicate, minor]);
    expect(errors).toEqual(
      expect.arrayContaining([
        "duplicate: Computer Science (2025-26)",
        "not a Major Programme: Entrepreneurship.html",
        "empty categories: Entrepreneurship.html",
        "expected 4 admission years, got 1",
      ]),
    );
  });
});
