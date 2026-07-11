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

  it("先修边(#164):本树内先修落 prereqCodes,节点沉到先修的下一层", () => {
    const cs: CourseInfo[] = [
      { code: "CSCI1130", title: "A", units: 3, description: "", terms: [] },
      {
        code: "CSCI2100",
        title: "B",
        units: 3,
        description: "",
        terms: [],
        prerequisites: [{ codes: ["CSCI1130"] }],
      },
    ];
    const cats: CategoryInput[] = [
      {
        id: "c",
        name: "C",
        kind: "required",
        unitsRequired: 6,
        pickN: null,
        members: [
          { courseCode: "CSCI1130", missing: false },
          { courseCode: "CSCI2100", missing: false },
        ],
      },
    ];
    const t = computeTree(major, cats, cs);
    const a = t.groups[0].nodes.find((n) => n.code === "CSCI1130")!;
    const b = t.groups[0].nodes.find((n) => n.code === "CSCI2100")!;
    expect(a.prereqCodes).toEqual([]);
    expect(b.prereqCodes).toEqual(["CSCI1130"]);
    expect(b.level).toBe(a.level + 1);
  });

  it("拓扑压过码位(#164):同为 2 字头,被先修者更深", () => {
    // CSCI2720 先修 CSCI2100(都 2 字头);拓扑要让 2720 落到 2100 之下,而非并列码位 2
    const cs: CourseInfo[] = [
      { code: "CSCI2100", title: "A", units: 3, description: "", terms: [] },
      {
        code: "CSCI2720",
        title: "B",
        units: 3,
        description: "",
        terms: [],
        prerequisites: [{ codes: ["CSCI2100"] }],
      },
    ];
    const cats: CategoryInput[] = [
      {
        id: "c",
        name: "C",
        kind: "required",
        unitsRequired: 6,
        pickN: null,
        members: [
          { courseCode: "CSCI2100", missing: false },
          { courseCode: "CSCI2720", missing: false },
        ],
      },
    ];
    const t = computeTree(major, cats, cs);
    const a = t.groups[0].nodes.find((n) => n.code === "CSCI2100")!;
    const b = t.groups[0].nodes.find((n) => n.code === "CSCI2720")!;
    expect(a.level).toBe(2); // 根课回退码位
    expect(b.level).toBe(3); // 拓扑:落到先修下一层,深于码位 2
  });

  it("出树先修(#164):跨学科/不在本树 → 不连边,落文字提示,不建幽灵节点", () => {
    // CSCI3130 先修 CSCI2110/ENGG2440 均不在本树 → prereqCodes 空、提示里点名、层回退码位
    const cs: CourseInfo[] = [
      {
        code: "CSCI3130",
        title: "Formal Languages",
        units: 3,
        description: "",
        terms: [],
        prerequisites: [{ codes: ["CSCI2110", "ENGG2440"] }],
      },
    ];
    const cats: CategoryInput[] = [
      {
        id: "c",
        name: "C",
        kind: "required",
        unitsRequired: 3,
        pickN: null,
        members: [{ courseCode: "CSCI3130", missing: false }],
      },
    ];
    const t = computeTree(major, cats, cs);
    const n = t.groups[0].nodes[0];
    expect(n.prereqCodes).toEqual([]); // 出树不连边
    expect(n.level).toBe(3); // 无本树内先修 → 回退码位
    expect(n.prereqNote).toContain("CSCI2110");
    expect(n.prereqNote).toContain("ENGG2440");
    // 幽灵节点检查:本树仍只有 1 个节点(没凭空生出先修课)
    expect(t.groups[0].nodes).toHaveLength(1);
  });

  it("混合 OR 组(#164):组内有本树内课时,出树备选是可替代项、不进提示", () => {
    // CSCI3230 先修「CSCI2100 或 2520 或 ESTR2102」:2100 在树 → 连边;2520/ESTR2102
    // 只是 OR 备选,已被 2100 这条边覆盖,不能列成「另需」误导用户
    const cs: CourseInfo[] = [
      { code: "CSCI2100", title: "A", units: 3, description: "", terms: [] },
      {
        code: "CSCI3230",
        title: "AI",
        units: 3,
        description: "",
        terms: [],
        prerequisites: [{ codes: ["CSCI2100", "CSCI2520", "ESTR2102"] }],
      },
    ];
    const cats: CategoryInput[] = [
      {
        id: "c",
        name: "C",
        kind: "required",
        unitsRequired: 6,
        pickN: null,
        members: [
          { courseCode: "CSCI2100", missing: false },
          { courseCode: "CSCI3230", missing: false },
        ],
      },
    ];
    const t = computeTree(major, cats, cs);
    const n = t.groups[0].nodes.find((x) => x.code === "CSCI3230")!;
    expect(n.prereqCodes).toEqual(["CSCI2100"]);
    expect(n.prereqNote).toBeNull();
    expect(n.level).toBe(3);
  });

  it("同修入提示(#164):同修不连边,但汇入文字提示、不静默丢", () => {
    // CSCI4180 同修「CSCI3150 或 ESTR3102」:#164 不为同修建先修边,落文字提示即可
    const cs: CourseInfo[] = [
      {
        code: "CSCI4180",
        title: "Cloud",
        units: 3,
        description: "",
        terms: [],
        corequisites: [{ codes: ["CSCI3150", "ESTR3102"] }],
      },
    ];
    const cats: CategoryInput[] = [
      {
        id: "c",
        name: "C",
        kind: "required",
        unitsRequired: 3,
        pickN: null,
        members: [{ courseCode: "CSCI4180", missing: false }],
      },
    ];
    const t = computeTree(major, cats, cs);
    const n = t.groups[0].nodes[0];
    expect(n.prereqCodes).toEqual([]); // 同修不是先修边
    expect(n.prereqNote).toContain("同修");
    expect(n.prereqNote).toContain("CSCI3150");
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
