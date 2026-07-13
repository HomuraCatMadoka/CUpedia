// 等价组(#165):从 exclusions 推「多选一」互斥课集。护栏——仅当**双向**互斥且**同一类目**
// (类目 kind = 角色)才并组;单向不并、跨类目/不同角色不并;超大组打标待复核。纯函数,无 IO。

import { describe, it, expect } from "vitest";

import { buildEquivalenceGroups } from "@/lib/course-tree/equivalence-groups";
import type { CategoryInput, CourseInfo } from "@/lib/course-tree/types";

function course(code: string, exclusions: string[] = []): CourseInfo {
  return {
    code,
    title: code,
    units: 3,
    description: "",
    terms: [],
    exclusions,
  };
}

function cat(
  id: string,
  codes: string[],
  kind: CategoryInput["kind"] = "required",
): CategoryInput {
  return {
    id,
    name: id,
    kind,
    unitsRequired: null,
    pickN: null,
    members: codes.map((code) => ({ courseCode: code, missing: false })),
  };
}

describe("buildEquivalenceGroups (#165)", () => {
  it("同类目内双向互斥 → 并成一个多选一组", () => {
    const courses = [
      course("CSCI1120", ["CSCI1130"]),
      course("CSCI1130", ["CSCI1120"]),
    ];
    const categories = [cat("core", ["CSCI1120", "CSCI1130"])];

    const groups = buildEquivalenceGroups(courses, categories);

    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({
      categoryId: "core",
      kind: "required",
      codes: ["CSCI1120", "CSCI1130"],
      oversized: false,
    });
  });

  it("单向互斥不并组:A 排 B 但 B 不排 A", () => {
    const courses = [
      course("CSCI1120", ["CSCI1130"]),
      course("CSCI1130", []), // 未回排,非双向
    ];
    const categories = [cat("core", ["CSCI1120", "CSCI1130"])];
    expect(buildEquivalenceGroups(courses, categories)).toEqual([]);
  });

  it("跨类目不并组:双向互斥但不同类目(不同角色)各自独立", () => {
    const courses = [
      course("CSCI1120", ["CSCI1130"]),
      course("CSCI1130", ["CSCI1120"]),
    ];
    const categories = [
      cat("core", ["CSCI1120"], "required"),
      cat("elective", ["CSCI1130"], "basket"),
    ];
    expect(buildEquivalenceGroups(courses, categories)).toEqual([]);
  });

  it("传递闭包:A↔B、B↔C(A、C 未直接互斥)仍并成一组", () => {
    const courses = [
      course("MATH1010", ["MATH1510"]),
      course("MATH1510", ["MATH1010", "MATH1520"]),
      course("MATH1520", ["MATH1510"]),
    ];
    const categories = [cat("calc", ["MATH1010", "MATH1510", "MATH1520"])];
    const groups = buildEquivalenceGroups(courses, categories);
    expect(groups).toHaveLength(1);
    expect(groups[0].codes).toEqual(["MATH1010", "MATH1510", "MATH1520"]);
  });

  it("超大组打标待复核:成员数超阈值 oversized=true", () => {
    const codes = ["C1", "C2", "C3", "C4", "C5", "C6"]; // 6 门,两两互斥
    const courses = codes.map((c) =>
      course(
        c,
        codes.filter((o) => o !== c),
      ),
    );
    const categories = [cat("big", codes)];
    const groups = buildEquivalenceGroups(courses, categories);
    expect(groups).toHaveLength(1);
    expect(groups[0].codes).toHaveLength(6);
    expect(groups[0].oversized).toBe(true);
  });
});
