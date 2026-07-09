import { describe, it, expect } from "vitest";

import { computeTree, courseLevel } from "@/lib/course-tree/compute-tree";
import type {
  CategoryInput,
  CourseInfo,
  MajorMeta,
} from "@/lib/course-tree/types";

const major: MajorMeta = {
  id: "m1",
  name: "Computer Science",
  handbookYear: "2023-24",
  totalUnits: 99,
};

const courses: CourseInfo[] = [
  {
    code: "CSCI1130",
    title: "Intro to Computing",
    units: 3,
    description: "基础",
    terms: ["T1"],
  },
  {
    code: "CSCI3130",
    title: "Formal Languages",
    units: 3,
    description: "",
    terms: ["T2"],
  },
  {
    code: "MATH1010",
    title: "Calculus I",
    units: 3,
    description: "",
    terms: ["T1"],
  },
  {
    code: "MATH1510",
    title: "Calculus II",
    units: 3,
    description: "",
    terms: ["T2"],
  },
  {
    code: "STAT2001",
    title: "Probability",
    units: 3,
    description: "",
    terms: ["T1"],
  },
];

const categories: CategoryInput[] = [
  {
    id: "c1",
    name: "Required",
    kind: "required",
    unitsRequired: 6,
    pickN: null,
    // 故意乱序:3 字头在前,验证 computeTree 会按年级层重排
    members: [
      { courseCode: "CSCI3130", missing: false },
      { courseCode: "CSCI1130", missing: false },
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
    members: [
      { courseCode: "STAT2001", missing: false },
      // courses 表里没有这门 → 应作占位灰显
      { courseCode: "GESC1000", missing: false },
    ],
  },
];

describe("courseLevel", () => {
  it("取课号首位数字作年级层", () => {
    expect(courseLevel("CSCI1130")).toBe(1);
    expect(courseLevel("ENGG2020")).toBe(2);
    expect(courseLevel("CSCI3130")).toBe(3);
  });

  it("无法解析(无数字)的记 0", () => {
    expect(courseLevel("LAWS2XXX")).toBe(2); // 仍取到首位 2
    expect(courseLevel("NODIGIT")).toBe(0);
  });
});

describe("computeTree", () => {
  const tree = computeTree(major, categories, courses);

  it("保留主修元信息", () => {
    expect(tree.majorId).toBe("m1");
    expect(tree.name).toBe("Computer Science");
    expect(tree.totalUnits).toBe(99);
  });

  it("每个类目产出一个分组", () => {
    expect(tree.groups.map((g) => g.id)).toEqual(["c1", "c2", "c3"]);
    expect(tree.groups[0].kind).toBe("required");
    expect(tree.groups[1].pickN).toBe(1);
    expect(tree.groups[2].unitsRequired).toBe(9);
  });

  it("组内按年级层升序排列(1 字头在 3 字头前)", () => {
    expect(tree.groups[0].nodes.map((n) => n.code)).toEqual([
      "CSCI1130",
      "CSCI3130",
    ]);
    expect(tree.groups[0].nodes[0].level).toBe(1);
    expect(tree.groups[0].nodes[1].level).toBe(3);
  });

  it("从 courses 填入 title/units/description/terms", () => {
    const node = tree.groups[0].nodes[0];
    expect(node.title).toBe("Intro to Computing");
    expect(node.units).toBe(3);
    expect(node.terms).toEqual(["T1"]);
    expect(node.missing).toBe(false);
  });

  it("courses 表缺失的成员作占位灰显(title 退回课号、学分 0)", () => {
    const placeholder = tree.groups[2].nodes.find((n) => n.code === "GESC1000");
    expect(placeholder).toBeDefined();
    expect(placeholder!.missing).toBe(true);
    expect(placeholder!.title).toBe("GESC1000");
    expect(placeholder!.units).toBe(0);
  });

  it("骨架已标 missing 的成员即使 courses 有详情也灰显", () => {
    const cats: CategoryInput[] = [
      {
        id: "x",
        name: "X",
        kind: "required",
        unitsRequired: 3,
        pickN: null,
        members: [{ courseCode: "CSCI1130", missing: true }],
      },
    ];
    const t = computeTree(major, cats, courses);
    expect(t.groups[0].nodes[0].missing).toBe(true);
  });
});
