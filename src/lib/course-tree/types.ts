// 课程技能树 S3(#163)类型。承接 #199 的课程数据底座(courses 五表)。
// 复用 parseHandbookLeaf 的 CategoryKind,与骨架摄取保持同一套形态词汇。

import type { CategoryKind } from "@/lib/parseHandbookLeaf";

export type { CategoryKind };

// ── computeTree 输入 ──

/** 主修元信息(来自 majors 表)。 */
export type MajorMeta = {
  id: string;
  name: string;
  handbookYear: string;
  totalUnits: number | null;
};

/** 一个类目(来自 majorCategories)+ 它的成员课号(来自 categoryCourses)。 */
export type CategoryInput = {
  id: string;
  name: string;
  kind: CategoryKind;
  unitsRequired: number | null;
  pickN: number | null;
  members: { courseCode: string; missing: boolean }[];
};

/** 课程详情(来自 courses 表;units 已由 server action 从 numeric string 转 number)。 */
export type CourseInfo = {
  code: string;
  title: string;
  units: number;
  description: string;
  terms: string[];
};

// ── computeTree 输出 ──

/** 技能树的一个课程节点。S3 无先修边,`level` 仅按课号首位数字分层。 */
export type CourseNode = {
  code: string;
  title: string;
  units: number;
  description: string;
  terms: string[];
  /** 年级层:课号首位数字(CSCI1130 → 1);无法解析记 0。 */
  level: number;
  /** courses 表无此课(骨架成员缺详情):灰显占位,不静默隐藏。 */
  missing: boolean;
};

/** 一个类目分组及其扁平节点。 */
export type CategoryGroup = {
  id: string;
  name: string;
  kind: CategoryKind;
  unitsRequired: number | null;
  pickN: number | null;
  nodes: CourseNode[];
};

/** 一个主修的完整技能树。 */
export type MajorTree = {
  majorId: string;
  name: string;
  handbookYear: string;
  totalUnits: number | null;
  groups: CategoryGroup[];
};

// ── evaluateBuild 输出(自由模式软进度)──

export type CategoryProgress = {
  id: string;
  name: string;
  kind: CategoryKind;
  /** 本类已点亮门数。 */
  litCount: number;
  /** 本类已点亮学分。 */
  litUnits: number;
  requiredUnits: number | null;
  pickN: number | null;
  /** 还差多少(one-of 按门数、其余按学分);已满或无明确要求为 0/null。 */
  remaining: number | null;
  /** remaining 的量纲,供 UI 措辞「还差 N 门」/「还差 N 学分」。 */
  remainingKind: "courses" | "units" | null;
  /** 是否已满足本类要求。 */
  satisfied: boolean;
};

export type BuildProgress = {
  /** 全部已点亮课学分(跨类目按课号去重)。 */
  totalLitUnits: number;
  /** 主修要求总学分。 */
  totalUnits: number | null;
  categories: CategoryProgress[];
};

// ── server action 返回类型 ──

/** listMajors() 返回项(主修下拉用)。 */
export type MajorListItem = {
  id: string;
  name: string;
  handbookYear: string;
  totalUnits: number | null;
};
