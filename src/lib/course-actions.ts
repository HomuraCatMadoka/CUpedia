"use server";

// 课程技能树 S3(#163)只读 server actions。匿名可用、不落库。
// 承接 #199 的课程数据底座(courses/majors/majorCategories/categoryCourses)。
// 读路径失败一律降级(空列表 / null),不让辅助数据拖垮页面(同 discussion-actions)。

import { eq, inArray } from "drizzle-orm";

import { db } from "@/db";
import { courses, majors } from "@/db/schema";
import { computeTree } from "@/lib/course-tree/compute-tree";
import { parseRequirements } from "@/lib/course-tree/parse-requirements";
import type {
  CategoryInput,
  CategoryKind,
  CourseInfo,
  MajorListItem,
  MajorTree,
} from "@/lib/course-tree/types";

// numeric 列在 drizzle 里是字符串,统一转 number(空值透传)。
const toNum = (v: string | null): number | null =>
  v == null ? null : Number(v);

export async function listMajors(): Promise<MajorListItem[]> {
  const rows = await db.query.majors
    .findMany({
      columns: { id: true, name: true, handbookYear: true, totalUnits: true },
      orderBy: (m, { asc }) => [asc(m.name)],
    })
    .catch((error: unknown) => {
      console.error("listMajors: query failed", error);
      return [];
    });
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    handbookYear: r.handbookYear,
    totalUnits: toNum(r.totalUnits),
  }));
}

export async function getMajorTree(majorId: string): Promise<MajorTree | null> {
  try {
    // 一跳拿主修 + 类目 + 成员课号(categoryCourses 无到 courses 的 FK,详情另查)。
    const major = await db.query.majors.findFirst({
      where: eq(majors.id, majorId),
      with: { categories: { with: { courses: true } } },
    });
    if (!major) return null;

    const categories: CategoryInput[] = major.categories.map((c) => ({
      id: c.id,
      name: c.name,
      kind: c.kind as CategoryKind,
      unitsRequired: toNum(c.unitsRequired),
      pickN: c.pickN,
      members: c.courses.map((m) => ({
        courseCode: m.courseCode,
        missing: m.missing,
      })),
    }));

    const codes = [
      ...new Set(categories.flatMap((c) => c.members.map((m) => m.courseCode))),
    ];
    const courseRows = codes.length
      ? await db.query.courses.findMany({
          where: inArray(courses.code, codes),
          columns: {
            code: true,
            title: true,
            units: true,
            description: true,
            terms: true,
            requirementsRaw: true,
          },
        })
      : [];

    const courseInfos: CourseInfo[] = courseRows.map((c) => {
      // subjectHint = 课号前四位学科码,供裸数字简写补全(CSCI2100 or 1130 → CSCI1130)。
      const parsed = parseRequirements(
        c.requirementsRaw ?? "",
        c.code.slice(0, 4),
      );
      return {
        code: c.code,
        title: c.title,
        units: Number(c.units),
        description: c.description,
        terms: c.terms ?? [],
        prerequisites: parsed.prerequisites,
        corequisites: parsed.corequisites,
        // 豁免 / 旁路 warning / 非课号限制等合并为一串备注,供 computeTree 汇入提示。
        requirementNotes: [...parsed.notes, ...parsed.warnings],
      };
    });

    return computeTree(
      {
        id: major.id,
        name: major.name,
        handbookYear: major.handbookYear,
        totalUnits: toNum(major.totalUnits),
      },
      categories,
      courseInfos,
    );
  } catch (error) {
    console.error("getMajorTree: query failed", error);
    return null;
  }
}
