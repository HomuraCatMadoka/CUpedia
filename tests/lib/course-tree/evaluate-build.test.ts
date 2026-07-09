import { describe, it, expect } from "vitest";

import { computeTree } from "@/lib/course-tree/compute-tree";
import { evaluateBuild } from "@/lib/course-tree/evaluate-build";
import type {
  CategoryInput,
  CourseInfo,
  MajorMeta,
} from "@/lib/course-tree/types";

const major: MajorMeta = {
  id: "m1",
  name: "CS",
  handbookYear: "2023-24",
  totalUnits: 18,
};

const courses: CourseInfo[] = [
  { code: "CSCI1130", title: "A", units: 3, description: "", terms: [] },
  { code: "CSCI3130", title: "B", units: 3, description: "", terms: [] },
  { code: "MATH1010", title: "C", units: 3, description: "", terms: [] },
  { code: "MATH1510", title: "D", units: 3, description: "", terms: [] },
  { code: "STAT2001", title: "E", units: 3, description: "", terms: [] },
];

const categories: CategoryInput[] = [
  {
    id: "c1",
    name: "Required",
    kind: "required",
    unitsRequired: 6,
    pickN: null,
    members: [
      { courseCode: "CSCI1130", missing: false },
      { courseCode: "CSCI3130", missing: false },
    ],
  },
  {
    id: "c2",
    name: "Pick one math",
    kind: "one-of",
    unitsRequired: null,
    pickN: 1,
    members: [
      { courseCode: "MATH1010", missing: false },
      { courseCode: "MATH1510", missing: false },
    ],
  },
  {
    id: "c3",
    name: "Electives",
    kind: "basket",
    unitsRequired: 9,
    pickN: null,
    members: [{ courseCode: "STAT2001", missing: false }],
  },
];

const tree = computeTree(major, categories, courses);

describe("evaluateBuild", () => {
  it("空点亮集:总学分 0,每类 litCount 0、未满足", () => {
    const p = evaluateBuild(tree, new Set());
    expect(p.totalLitUnits).toBe(0);
    expect(p.totalUnits).toBe(18);
    expect(p.categories.every((c) => c.litCount === 0 && !c.satisfied)).toBe(
      true,
    );
  });

  it("总学分 = 已点亮课学分之和", () => {
    const p = evaluateBuild(tree, new Set(["CSCI1130", "MATH1010"]));
    expect(p.totalLitUnits).toBe(6);
  });

  it("required/basket 按学分算「还差 N 学分」", () => {
    const p = evaluateBuild(tree, new Set(["CSCI1130"]));
    const required = p.categories.find((c) => c.id === "c1")!;
    expect(required.litUnits).toBe(3);
    expect(required.remaining).toBe(3);
    expect(required.remainingKind).toBe("units");
    expect(required.satisfied).toBe(false);
  });

  it("required 学分满则 satisfied、remaining 0", () => {
    const p = evaluateBuild(tree, new Set(["CSCI1130", "CSCI3130"]));
    const required = p.categories.find((c) => c.id === "c1")!;
    expect(required.remaining).toBe(0);
    expect(required.satisfied).toBe(true);
  });

  it("one-of 按门数算,点满 pickN 即 satisfied", () => {
    const p = evaluateBuild(tree, new Set(["MATH1010"]));
    const oneOf = p.categories.find((c) => c.id === "c2")!;
    expect(oneOf.litCount).toBe(1);
    expect(oneOf.remaining).toBe(0);
    expect(oneOf.remainingKind).toBe("courses");
    expect(oneOf.satisfied).toBe(true);
  });

  it("总学分跨类目按课号去重(同课出现在两类只计一次)", () => {
    const dup: CategoryInput[] = [
      {
        id: "a",
        name: "A",
        kind: "required",
        unitsRequired: 3,
        pickN: null,
        members: [{ courseCode: "CSCI1130", missing: false }],
      },
      {
        id: "b",
        name: "B",
        kind: "basket",
        unitsRequired: 3,
        pickN: null,
        members: [{ courseCode: "CSCI1130", missing: false }],
      },
    ];
    const t = computeTree(major, dup, courses);
    const p = evaluateBuild(t, new Set(["CSCI1130"]));
    expect(p.totalLitUnits).toBe(3); // 不是 6
    expect(p.categories[0].litUnits).toBe(3);
    expect(p.categories[1].litUnits).toBe(3);
  });

  it("无明确要求(pickN 与 unitsRequired 皆空)时 remaining 为 null、不判满足", () => {
    const cats: CategoryInput[] = [
      {
        id: "free",
        name: "Free",
        kind: "basket",
        unitsRequired: null,
        pickN: null,
        members: [{ courseCode: "STAT2001", missing: false }],
      },
    ];
    const t = computeTree(major, cats, courses);
    const p = evaluateBuild(t, new Set(["STAT2001"]));
    expect(p.categories[0].remaining).toBeNull();
    expect(p.categories[0].remainingKind).toBeNull();
    expect(p.categories[0].satisfied).toBe(false);
    expect(p.categories[0].litCount).toBe(1);
  });
});
