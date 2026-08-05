import { describe, expect, it } from "vitest";

import { filterProfessorDirectoryPreview } from "@/lib/professor-mockup-data";

describe("filterProfessorDirectoryPreview", () => {
  it("searches names and departments, then applies the faculty filter", () => {
    expect(
      filterProfessorDirectoryPreview("LIU", undefined).map((p) => p.slug),
    ).toEqual(["liu-shengchao"]);
    expect(
      filterProfessorDirectoryPreview("物理", undefined).map((p) => p.slug),
    ).toEqual(["flores-castillo-luis-roberto"]);
    expect(
      filterProfessorDirectoryPreview(undefined, "社会科学院").map(
        (p) => p.slug,
      ),
    ).toEqual(["lin-shu", "he-qian"]);
  });
});
