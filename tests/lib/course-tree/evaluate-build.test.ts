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
  {
    code: "CSCI1130",
    title: "A",
    units: 3,
    description: "",
    terms: ["T1"],
  },
  {
    code: "CSCI3130",
    title: "B",
    units: 3,
    description: "",
    terms: [],
    prerequisites: [{ codes: ["CSCI1130"] }],
  },
  {
    code: "MATH1010",
    title: "C",
    units: 3,
    description: "",
    terms: [],
    exclusions: ["MATH1510"],
  },
  {
    code: "MATH1510",
    title: "D",
    units: 3,
    description: "",
    terms: [],
    exclusions: ["MATH1010"],
  },
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
  it("严格模式报告开课季节不匹配", () => {
    const result = evaluateBuild(
      tree,
      [{ code: "CSCI1130", term: 2 }],
      "strict",
    );

    expect(result.violations).toContainEqual({
      type: "season",
      code: "CSCI1130",
      term: 2,
    });
  });

  it("严格模式报告每学期学分超限", () => {
    const result = evaluateBuild(
      tree,
      [
        { code: "CSCI1130", term: 1 },
        { code: "CSCI3130", term: 1 },
        { code: "MATH1010", term: 1 },
        { code: "STAT2001", term: 1 },
      ],
      "strict",
      { termUnitCap: 9 },
    );

    expect(result.violations).toContainEqual({
      type: "term-cap",
      term: 1,
      units: 12,
      cap: 9,
    });
  });

  it("严格模式报告排在先修之前的课程", () => {
    const result = evaluateBuild(
      tree,
      [
        { code: "CSCI3130", term: 1 },
        { code: "CSCI1130", term: 2 },
      ],
      "strict",
    );

    expect(result.violations).toContainEqual({
      type: "prerequisite",
      code: "CSCI3130",
      term: 1,
      required: ["CSCI1130"],
    });
  });

  it("严格模式报告同一等价组被选中多门", () => {
    const result = evaluateBuild(
      tree,
      [
        { code: "MATH1010", term: 1 },
        { code: "MATH1510", term: 2 },
      ],
      "strict",
    );

    expect(result.violations).toContainEqual({
      type: "equivalence",
      codes: ["MATH1010", "MATH1510"],
    });
  });

  it("含旁路条款的先修只警告而不硬拦", () => {
    const bypassTree = computeTree(major, categories, [
      ...courses.filter((course) => course.code !== "CSCI3130"),
      {
        ...courses.find((course) => course.code === "CSCI3130")!,
        prerequisiteWarning: "or equivalent / by permission",
      },
    ]);
    const result = evaluateBuild(
      bypassTree,
      [{ code: "CSCI3130", term: 1 }],
      "strict",
    );

    expect(result.violations).toEqual([]);
    expect(result.warnings).toContainEqual({
      type: "prerequisite-bypass",
      code: "CSCI3130",
      message: "or equivalent / by permission",
    });
  });

  it("严格构筑满足全部软要求且无违规时整树点亮", () => {
    const completableTree = computeTree(
      major,
      categories.map((category) =>
        category.id === "c3" ? { ...category, unitsRequired: 3 } : category,
      ),
      courses,
    );
    const result = evaluateBuild(
      completableTree,
      [
        { code: "CSCI1130", term: 1 },
        { code: "CSCI3130", term: 2 },
        { code: "MATH1010", term: 1 },
        { code: "STAT2001", term: 1 },
      ],
      "strict",
      { termUnitCap: 18 },
    );

    expect(result.complete).toBe(true);
  });

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
