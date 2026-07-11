import { describe, expect, it } from "vitest";

import { parseHandbookConstraints } from "@/lib/handbook-constraints";

describe("parseHandbookConstraints", () => {
  it("extracts only explicit course and unit bounds", () => {
    expect(
      parseHandbookConstraints(
        "Choose any three courses, with at least 6 units at 3000 level and a maximum of two courses from Group B",
      ),
    ).toEqual([
      { dimension: "units", minimum: 6, maximum: null },
      { dimension: "courses", minimum: null, maximum: 2 },
      { dimension: "courses", minimum: 3, maximum: 3 },
    ]);
  });

  it("recognizes a one-of rule but ignores unrelated numbers", () => {
    expect(
      parseHandbookConstraints(
        "Choose one course from the following at 3000 level for one academic term",
      ),
    ).toEqual([{ dimension: "courses", minimum: 1, maximum: 1 }]);
  });
});
