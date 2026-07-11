// 课程技能树 S3(#163):把主修骨架(类目 + 成员课号)与课程详情组织成
// 「按类目分组的扁平节点」。S3 只做扁平分组 + 按课号首位分层,无先修边(#164 才有)、
// 不落库。纯模块,无 IO。

import type {
  CategoryGroup,
  CategoryInput,
  CourseInfo,
  CourseNode,
  MajorMeta,
  MajorTree,
} from "./types";

/** 课号首位数字 = 年级层(CSCI1130 → 1)。无法解析(占位/异常)记 0,排在最前。 */
export function courseLevel(code: string): number {
  const m = code.match(/\d/);
  return m ? Number(m[0]) : 0;
}

function toNode(
  member: CategoryInput["members"][number],
  coursesByCode: Map<string, CourseInfo>,
  prereqCodes: string[],
  level: number,
  prereqNote: string | null,
): CourseNode {
  const info = coursesByCode.get(member.courseCode);
  // 骨架标记的 missing,或 courses 表根本查不到,都算占位。
  const missing = member.missing || !info;
  return {
    code: member.courseCode,
    title: info?.title ?? member.courseCode,
    units: info?.units ?? 0,
    description: info?.description ?? "",
    terms: info?.terms ?? [],
    level,
    missing,
    prereqCodes,
    prereqNote,
  };
}

/** 组内排序:先按年级层升序,同层按课号字母序。 */
function byLevelThenCode(a: CourseNode, b: CourseNode): number {
  return a.level - b.level || a.code.localeCompare(b.code);
}

export function computeTree(
  major: MajorMeta,
  categories: CategoryInput[],
  courses: CourseInfo[],
): MajorTree {
  const coursesByCode = new Map(courses.map((c) => [c.code, c]));
  // 全树课号集合:先修边只连本树内的课,跨学科/出树先修退化为文字提示(#164)。
  const treeCodes = new Set(
    categories.flatMap((c) => c.members.map((m) => m.courseCode)),
  );

  // 某课的本树内先修码(去重保序,排除自指)——驱动先修边与拓扑分层。
  const inTreePrereqs = (code: string): string[] => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const g of coursesByCode.get(code)?.prerequisites ?? []) {
      for (const c of g.codes) {
        if (c !== code && treeCodes.has(c) && !seen.has(c)) {
          seen.add(c);
          out.push(c);
        }
      }
    }
    return out;
  };

  // 拓扑层:有本树内先修则落在最深先修的下一层,否则回退课号首位数字(根课)。
  // 记忆化 + 环保护(数据异常成环时退回码位,绝不无限递归)。
  const levelCache = new Map<string, number>();
  const inProgress = new Set<string>();
  const levelOf = (code: string): number => {
    const cached = levelCache.get(code);
    if (cached !== undefined) return cached;
    if (inProgress.has(code)) return courseLevel(code); // 环:退回码位,不缓存
    const pre = inTreePrereqs(code);
    if (pre.length === 0) {
      const l = courseLevel(code);
      levelCache.set(code, l);
      return l;
    }
    inProgress.add(code);
    const l = Math.max(...pre.map(levelOf)) + 1;
    inProgress.delete(code);
    levelCache.set(code, l);
    return l;
  };

  // 文字提示:把不能连成先修边的信息汇成一行,不静默丢。含三段——
  //   1) 整组落在树外的先修组(真·需在树外满足;组内含本树内课的出树备选是可替代项,
  //      已被本树内先修边覆盖,不重复列出以免误导);
  //   2) 同修组(#164 不为同修连边);
  //   3) requirementNotes(豁免 / 旁路 warning / 非课号限制等原样备注)。
  const noteFor = (code: string): string | null => {
    const info = coursesByCode.get(code);
    const parts: string[] = [];

    const outGroups = (info?.prerequisites ?? []).filter(
      (g) => !g.codes.some((c) => treeCodes.has(c)),
    );
    if (outGroups.length > 0) {
      parts.push(
        "另需先修:" + outGroups.map((g) => g.codes.join(" 或 ")).join(" + "),
      );
    }

    const coreq = info?.corequisites ?? [];
    if (coreq.length > 0) {
      parts.push("同修:" + coreq.map((g) => g.codes.join(" 或 ")).join(" + "));
    }

    for (const n of info?.requirementNotes ?? []) {
      if (n.trim()) parts.push(n.trim());
    }

    return parts.length ? parts.join(";") : null;
  };

  const groups: CategoryGroup[] = categories.map((cat) => ({
    id: cat.id,
    name: cat.name,
    kind: cat.kind,
    unitsRequired: cat.unitsRequired,
    pickN: cat.pickN,
    nodes: cat.members
      .map((m) =>
        toNode(
          m,
          coursesByCode,
          inTreePrereqs(m.courseCode),
          levelOf(m.courseCode),
          noteFor(m.courseCode),
        ),
      )
      .sort(byLevelThenCode),
  }));
  return {
    majorId: major.id,
    name: major.name,
    handbookYear: major.handbookYear,
    totalUnits: major.totalUnits,
    groups,
  };
}
