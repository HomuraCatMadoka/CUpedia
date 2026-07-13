// 树画布(#235):把 computeTree 的分类树摊成画布布局——按拓扑层 `level` 分列 +
// 从 `prereqCodes` 派生先修边列表。纯函数,不碰 DOM;渲染层(course-tree-view)按此
// 摆列并用 SVG 画连线。用 level(而非课号首位)分列,保证先修边永远左→右不打结。

import type { CourseNode, MajorTree } from "./types";

/** 画布的一列:同一拓扑层的节点。 */
export type CanvasColumn = { level: number; nodes: CourseNode[] };
/** 一条先修边:from(先修课)→ to(本课)。 */
export type CanvasEdge = { from: string; to: string };
export type CanvasLayout = { columns: CanvasColumn[]; edges: CanvasEdge[] };

export function layoutCanvas(tree: MajorTree): CanvasLayout {
  // 跨类目按课号去重:一门课在画布上只是一个节点(可能被多个类目列为成员)。
  const byCode = new Map<string, CourseNode>();
  for (const g of tree.groups) {
    for (const n of g.nodes) if (!byCode.has(n.code)) byCode.set(n.code, n);
  }
  const nodes = [...byCode.values()];

  // 分列:按 level 升序;同列按课号字母序(与 computeTree 的组内排序一致)。
  const levels = [...new Set(nodes.map((n) => n.level))].sort((a, b) => a - b);
  const columns: CanvasColumn[] = levels.map((level) => ({
    level,
    nodes: nodes
      .filter((n) => n.level === level)
      .sort((a, b) => a.code.localeCompare(b.code)),
  }));

  // 边:prereqCodes 已由 computeTree 过滤成本树内、去重;这里去重 (from,to) 对即可。
  const edges: CanvasEdge[] = [];
  const seen = new Set<string>();
  for (const n of nodes) {
    for (const from of n.prereqCodes) {
      const key = from + "→" + n.code;
      if (seen.has(key)) continue;
      seen.add(key);
      edges.push({ from, to: n.code });
    }
  }

  return { columns, edges };
}
