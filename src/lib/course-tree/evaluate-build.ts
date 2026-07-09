// 课程技能树 S3(#163)自由模式软进度:给已点亮课号集,算总学分与每类「还差 N / 已满」。
// 自由模式 = 不校验先修、不排学期(#166 严格逐学期另做)。纯模块,无 IO。

import type { BuildProgress, CategoryProgress, MajorTree } from "./types";

export function evaluateBuild(
  tree: MajorTree,
  litCodes: Set<string>,
): BuildProgress {
  // 一门课可能落在多个类目(如同时是必修与某篮子成员),总学分按课号去重只计一次。
  const countedForTotal = new Set<string>();
  let totalLitUnits = 0;

  const categories: CategoryProgress[] = tree.groups.map((g) => {
    let litCount = 0;
    let litUnits = 0;
    for (const node of g.nodes) {
      if (!litCodes.has(node.code)) continue;
      litCount++;
      litUnits += node.units;
      if (!countedForTotal.has(node.code)) {
        countedForTotal.add(node.code);
        totalLitUnits += node.units;
      }
    }

    // 进度语义:one-of/pickN 按门数,其余(required/basket)按学分。
    let remaining: number | null = null;
    let remainingKind: CategoryProgress["remainingKind"] = null;
    let satisfied = false;
    if (g.pickN != null) {
      remaining = Math.max(0, g.pickN - litCount);
      remainingKind = "courses";
      satisfied = litCount >= g.pickN;
    } else if (g.unitsRequired != null) {
      remaining = Math.max(0, g.unitsRequired - litUnits);
      remainingKind = "units";
      satisfied = litUnits >= g.unitsRequired;
    }

    return {
      id: g.id,
      name: g.name,
      kind: g.kind,
      litCount,
      litUnits,
      requiredUnits: g.unitsRequired,
      pickN: g.pickN,
      remaining,
      remainingKind,
      satisfied,
    };
  });

  return {
    totalLitUnits,
    totalUnits: tree.totalUnits,
    categories,
  };
}
