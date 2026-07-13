// 课程技能树 S3(#163)自由模式软进度:给已点亮课号集,算总学分与每类「还差 N / 已满」。
// 自由模式 = 不校验先修、不排学期(#166 严格逐学期另做)。纯模块,无 IO。

import type {
  BuildEvaluation,
  BuildItem,
  CategoryProgress,
  MajorTree,
} from "./types";

export function evaluateBuild(
  tree: MajorTree,
  build: Set<string> | BuildItem[],
  mode: "free" | "strict" = "free",
  { termUnitCap = 18 }: { termUnitCap?: number } = {},
): BuildEvaluation {
  const litCodes =
    build instanceof Set ? build : new Set(build.map((item) => item.code));
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

  const violations: BuildEvaluation["violations"] = [];
  const warnings: BuildEvaluation["warnings"] = [];
  if (mode === "strict" && Array.isArray(build)) {
    const nodes = new Map(
      tree.groups.flatMap((group) =>
        group.nodes.map((node) => [node.code, node] as const),
      ),
    );
    const termByCode = new Map(build.map((item) => [item.code, item.term]));
    const unitsByTerm = new Map<number, number>();
    for (const item of build) {
      const node = nodes.get(item.code);
      unitsByTerm.set(
        item.term,
        (unitsByTerm.get(item.term) ?? 0) + (node?.units ?? 0),
      );
      const terms = node?.terms ?? [];
      const expected = item.term % 2 === 1 ? "T1" : "T2";
      if (terms.length && !terms.includes(expected)) {
        violations.push({ type: "season", code: item.code, term: item.term });
      }
      if (node?.prerequisiteWarning) {
        warnings.push({
          type: "prerequisite-bypass",
          code: item.code,
          message: node.prerequisiteWarning,
        });
        continue;
      }
      for (const group of node?.prereqGroups ?? []) {
        if (
          !group.codes.some(
            (code) => (termByCode.get(code) ?? Infinity) < item.term,
          )
        ) {
          violations.push({
            type: "prerequisite",
            code: item.code,
            term: item.term,
            required: group.codes,
          });
        }
      }
    }
    for (const [term, units] of unitsByTerm) {
      if (units > termUnitCap) {
        violations.push({ type: "term-cap", term, units, cap: termUnitCap });
      }
    }
    for (const group of tree.equivalenceGroups) {
      const selected = group.codes.filter((code) => litCodes.has(code));
      if (selected.length > 1) {
        violations.push({ type: "equivalence", codes: selected });
      }
    }
  }

  return {
    totalLitUnits,
    totalUnits: tree.totalUnits,
    categories,
    complete:
      mode === "strict" &&
      categories.every((category) => category.satisfied) &&
      violations.length === 0,
    violations,
    warnings,
  };
}
