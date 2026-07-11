import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockMajorsFindMany, mockMajorsFindFirst, mockCoursesFindMany } =
  vi.hoisted(() => ({
    mockMajorsFindMany: vi.fn(),
    mockMajorsFindFirst: vi.fn(),
    mockCoursesFindMany: vi.fn(),
  }));

vi.mock("@/db", () => ({
  db: {
    query: {
      majors: { findMany: mockMajorsFindMany, findFirst: mockMajorsFindFirst },
      courses: { findMany: mockCoursesFindMany },
    },
  },
}));

import { listMajors, getMajorTree } from "@/lib/course-actions";

beforeEach(() => {
  mockMajorsFindMany.mockReset();
  mockMajorsFindFirst.mockReset();
  mockCoursesFindMany.mockReset();
  // 降级路径会 console.error,静音以免污染测试输出。
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("listMajors", () => {
  it("返回主修列表并把 numeric totalUnits 转 number(null 透传)", async () => {
    mockMajorsFindMany.mockResolvedValue([
      { id: "m1", name: "CS", handbookYear: "2023-24", totalUnits: "99" },
      { id: "m2", name: "Math", handbookYear: "2023-24", totalUnits: null },
    ]);
    expect(await listMajors()).toEqual([
      { id: "m1", name: "CS", handbookYear: "2023-24", totalUnits: 99 },
      { id: "m2", name: "Math", handbookYear: "2023-24", totalUnits: null },
    ]);
  });

  it("查询失败降级为空列表", async () => {
    mockMajorsFindMany.mockRejectedValue(new Error("db down"));
    expect(await listMajors()).toEqual([]);
  });
});

describe("getMajorTree", () => {
  it("组装主修 → 类目分组树,units 从 courses 填入并转 number", async () => {
    mockMajorsFindFirst.mockResolvedValue({
      id: "m1",
      name: "CS",
      handbookYear: "2023-24",
      totalUnits: "18",
      categories: [
        {
          id: "c1",
          name: "Required",
          kind: "required",
          unitsRequired: "6",
          pickN: null,
          courses: [
            { courseCode: "CSCI1130", missing: false },
            { courseCode: "GESC1000", missing: false }, // courses 表没有 → 占位
          ],
        },
      ],
    });
    mockCoursesFindMany.mockResolvedValue([
      {
        code: "CSCI1130",
        title: "Intro",
        units: "3",
        description: "d",
        terms: ["T1"],
      },
    ]);

    const tree = await getMajorTree("m1");
    expect(tree).not.toBeNull();
    expect(tree!.name).toBe("CS");
    expect(tree!.totalUnits).toBe(18);
    expect(tree!.groups).toHaveLength(1);

    const g = tree!.groups[0];
    expect(g.unitsRequired).toBe(6);
    const known = g.nodes.find((n) => n.code === "CSCI1130")!;
    expect(known.units).toBe(3);
    expect(known.missing).toBe(false);
    const placeholder = g.nodes.find((n) => n.code === "GESC1000")!;
    expect(placeholder.missing).toBe(true);
    expect(placeholder.units).toBe(0);
    expect(mockCoursesFindMany).toHaveBeenCalledTimes(1);
  });

  it("解析 requirements_raw 派生先修边(#164):本树内先修落 prereqCodes 并拓扑分层", async () => {
    mockMajorsFindFirst.mockResolvedValue({
      id: "m1",
      name: "CS",
      handbookYear: "2023-24",
      totalUnits: null,
      categories: [
        {
          id: "c1",
          name: "Required",
          kind: "required",
          unitsRequired: "6",
          pickN: null,
          courses: [
            { courseCode: "CSCI1130", missing: false },
            { courseCode: "CSCI2100", missing: false },
          ],
        },
      ],
    });
    mockCoursesFindMany.mockResolvedValue([
      {
        code: "CSCI1130",
        title: "Intro",
        units: "3",
        description: "d",
        terms: ["T1"],
        requirementsRaw: null,
      },
      {
        code: "CSCI2100",
        title: "Data Structures",
        units: "3",
        description: "d",
        terms: ["T1"],
        // 真实简写:'1130' 继承 CSCI 前缀 → 本树内先修 CSCI1130
        requirementsRaw: "Prerequisite: CSCI1120 or 1130.",
      },
    ]);

    const tree = await getMajorTree("m1");
    const nodes = tree!.groups[0].nodes;
    const a = nodes.find((n) => n.code === "CSCI1130")!;
    const b = nodes.find((n) => n.code === "CSCI2100")!;
    expect(b.prereqCodes).toEqual(["CSCI1130"]);
    expect(b.level).toBe(a.level + 1);
  });

  it("主修不存在返回 null,且不查 courses", async () => {
    mockMajorsFindFirst.mockResolvedValue(undefined);
    expect(await getMajorTree("nope")).toBeNull();
    expect(mockCoursesFindMany).not.toHaveBeenCalled();
  });

  it("类目无成员时不查 courses", async () => {
    mockMajorsFindFirst.mockResolvedValue({
      id: "m1",
      name: "CS",
      handbookYear: "2023-24",
      totalUnits: null,
      categories: [
        {
          id: "c1",
          name: "Empty",
          kind: "basket",
          unitsRequired: null,
          pickN: null,
          courses: [],
        },
      ],
    });
    const tree = await getMajorTree("m1");
    expect(tree!.groups[0].nodes).toEqual([]);
    expect(mockCoursesFindMany).not.toHaveBeenCalled();
  });

  it("查询抛错降级为 null", async () => {
    mockMajorsFindFirst.mockRejectedValue(new Error("boom"));
    expect(await getMajorTree("m1")).toBeNull();
  });
});
