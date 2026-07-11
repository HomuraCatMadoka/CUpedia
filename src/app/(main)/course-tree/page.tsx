import type { Metadata } from "next";

import { listMajors } from "@/lib/course-actions";
import { getOptionalUser } from "@/lib/auth-guard";

import { CourseTreeView } from "./course-tree-view";

export const metadata: Metadata = {
  title: "选课技能树 · 课程加点模拟器 | CUpedia",
  description:
    "选一个主修,把它的课程按类目铺成一棵技能树,自由点亮课程、实时看总学分与每类进度。非官方,仅供参考。",
};

export default async function CourseTreePage() {
  const [majors, user] = await Promise.all([listMajors(), getOptionalUser()]);

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 px-4 py-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-bold">选课技能树</h1>
        <p className="text-muted-foreground">
          选一个主修,把课程按类目铺成技能树;点亮想修的课,实时看总学分与每类「还差多少」。
          自由探索、随点随算,不保存。
        </p>
      </header>

      <CourseTreeView majors={majors} isAuthenticated={!!user} />

      <footer className="border-t pt-4 text-xs text-muted-foreground">
        非官方 ·
        仅供参考:课程与主修要求数据来自公开目录整理,可能滞后或有误,选课请以学系正式手册为准。
      </footer>
    </div>
  );
}
