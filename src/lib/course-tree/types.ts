// 课程技能树 S3(#163)类型。承接 #199 的课程数据底座(courses 五表)。
// 复用 parseHandbookLeaf 的 CategoryKind,与骨架摄取保持同一套形态词汇。

import type { CategoryKind } from "@/lib/parseHandbookLeaf";
import type { PrereqGroup } from "@/lib/course-tree/parse-requirements";

export type { CategoryKind };
export type { PrereqGroup };

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
  /** requirements_raw 经 parseRequirements 得到的先修 AND-of-OR 组(#164;缺省无先修)。 */
  prerequisites?: PrereqGroup[];
  /** 同修组(#164 只作提示,不建先修边)。 */
  corequisites?: PrereqGroup[];
  /** 备注 + 旁路 warning 合并的自由文本(#164 供 UI 原样展示)。 */
  requirementNotes?: string[];
};

// ── computeTree 输出 ──

/**
 * 技能树的一个课程节点。#164 起 `level` 为拓扑层:有本树内先修则落在其最深先修的下一层,
 * 否则回退到课号首位数字。先修边只连不拦(自由模式点亮不受先修约束,硬门在 #166)。
 */
export type CourseNode = {
  code: string;
  title: string;
  units: number;
  description: string;
  terms: string[];
  /** 拓扑层:见类型注释。无法解析记 0。 */
  level: number;
  /** courses 表无此课(骨架成员缺详情):灰显占位,不静默隐藏。 */
  missing: boolean;
  /** 本树内的先修课号(去重、驱动先修边与拓扑分层);出树/无先修则为空。 */
  prereqCodes: string[];
  /** 出树先修 / 同修 / 旁路等无法连边的信息,汇成一行文字提示;无则 null。 */
  prereqNote: string | null;
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
