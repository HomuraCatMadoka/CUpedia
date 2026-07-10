// 树画布(#235):layoutCanvas 把 computeTree 的分类树摊成「按拓扑层分列 + 先修边列表」,
// 供画布渲染分列 + SVG 连线。纯函数,不碰 DOM。

import { describe, it, expect } from "vitest";

import { layoutCanvas } from "@/lib/course-tree/layout-canvas";
import type { CourseNode, MajorTree } from "@/lib/course-tree/types";

function node(
  code: string,
  level: number,
  prereqCodes: string[] = [],
): CourseNode {
  return {
    code,
    title: code,
    units: 3,
    description: "",
    terms: [],
    level,
    missing: false,
    prereqCodes,
    prereqNote: null,
  };
}

function tree(groups: { id: string; nodes: CourseNode[] }[]): MajorTree {
  return {
    majorId: "m1",
    name: "测试主修",
    handbookYear: "2024",
    totalUnits: null,
    groups: groups.map((g) => ({
      id: g.id,
      name: g.id,
      kind: "required",
      unitsRequired: null,
      pickN: null,
      nodes: g.nodes,
    })),
  };
}

describe("layoutCanvas (#235)", () => {
  it("按 level 升序分列,先修边从 prereqCode 指向本课", () => {
    const t = tree([
      {
        id: "core",
        nodes: [node("CSCI1130", 1), node("CSCI2100", 2, ["CSCI1130"])],
      },
    ]);
    const layout = layoutCanvas(t);

    expect(layout.columns.map((c) => c.level)).toEqual([1, 2]);
    expect(layout.columns[0].nodes.map((n) => n.code)).toEqual(["CSCI1130"]);
    expect(layout.columns[1].nodes.map((n) => n.code)).toEqual(["CSCI2100"]);
    expect(layout.edges).toEqual([{ from: "CSCI1130", to: "CSCI2100" }]);
  });

  it("跨类目同课号去重:画布上只出现一个节点", () => {
    const shared = node("MATH1510", 1);
    const t = tree([
      { id: "core", nodes: [shared] },
      { id: "math", nodes: [node("MATH1510", 1)] }, // 同码,另一类目也列
    ]);
    const layout = layoutCanvas(t);
    const all = layout.columns.flatMap((c) => c.nodes.map((n) => n.code));
    expect(all).toEqual(["MATH1510"]);
  });

  it("missing 节点仍进列,不静默隐藏", () => {
    const miss: CourseNode = { ...node("ENGG2020", 2), missing: true };
    const t = tree([{ id: "elect", nodes: [miss] }]);
    const layout = layoutCanvas(t);
    expect(layout.columns[0].nodes[0]).toMatchObject({
      code: "ENGG2020",
      missing: true,
    });
  });

  it("多先修(AND-of-OR 摊平)扇入:每个 prereqCode 一条边", () => {
    const t = tree([
      {
        id: "core",
        nodes: [
          node("CSCI2100", 2),
          node("CSCI2110", 2),
          node("CSCI3160", 3, ["CSCI2100", "CSCI2110"]),
        ],
      },
    ]);
    const layout = layoutCanvas(t);
    expect(layout.edges).toEqual([
      { from: "CSCI2100", to: "CSCI3160" },
      { from: "CSCI2110", to: "CSCI3160" },
    ]);
  });
});
