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
    level: courseLevel(member.courseCode),
    missing,
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
  const groups: CategoryGroup[] = categories.map((cat) => ({
    id: cat.id,
    name: cat.name,
    kind: cat.kind,
    unitsRequired: cat.unitsRequired,
    pickN: cat.pickN,
    nodes: cat.members
      .map((m) => toNode(m, coursesByCode))
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
