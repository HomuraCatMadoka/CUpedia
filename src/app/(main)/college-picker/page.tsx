import type { Metadata } from "next";

import { CollegePickerForm } from "./college-picker-form";

export const metadata: Metadata = {
  title: "分院帽 · 书院志愿推荐 | CUpedia",
  description:
    "给中大新生的书院志愿推荐器：按你最看重的因素排出九所书院的志愿顺序。非官方，仅供参考。",
};

export default function CollegePickerPage() {
  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 px-4 py-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-bold">分院帽</h1>
        <p className="text-muted-foreground">
          选专业大类、挑三个最看重的因素、勾掉想避开的项，帮你把九所书院排成一份志愿顺序。
        </p>
      </header>

      <CollegePickerForm />

      <footer className="border-t pt-4 text-xs text-muted-foreground">
        非官方 ·
        仅供参考：本工具由学生整理的相对经验数据驱动，不代表书院或大学立场，
        结果仅供选择志愿时参考。暂不含医科 / 跨学科等专业。
      </footer>
    </div>
  );
}
