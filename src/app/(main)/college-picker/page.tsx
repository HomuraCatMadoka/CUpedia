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

      <section className="space-y-4 rounded-md border p-4 text-sm">
        <div className="space-y-2">
          <h2 className="font-semibold">各因素备注</h2>
          <dl className="grid gap-1.5 sm:grid-cols-2">
            <div className="flex gap-2">
              <dt className="shrink-0 font-medium text-foreground">保宿机会</dt>
              <dd className="text-muted-foreground">
                能加宿分的活动多不多、容不容易做、整体保宿难度
              </dd>
            </div>
            <div className="flex gap-2">
              <dt className="shrink-0 font-medium text-foreground">通勤时间</dt>
              <dd className="text-muted-foreground">
                距离对应专业大部分教学楼位置
              </dd>
            </div>
            <div className="flex gap-2">
              <dt className="shrink-0 font-medium text-foreground">住宿环境</dt>
              <dd className="text-muted-foreground">
                海景、设施新旧、有没有小冰箱或可调温空调等
              </dd>
            </div>
            <div className="flex gap-2">
              <dt className="shrink-0 font-medium text-foreground">fyp</dt>
              <dd className="text-muted-foreground">
                Final year project（一门三分课）
              </dd>
            </div>
            <div className="flex gap-2">
              <dt className="shrink-0 font-medium text-foreground">宗教因素</dt>
              <dd className="text-muted-foreground">周会有祈祷</dd>
            </div>
            <div className="flex gap-2">
              <dt className="shrink-0 font-medium text-foreground">入学面试</dt>
              <dd className="text-muted-foreground">网上面试/线下面试</dd>
            </div>
            <div className="flex gap-2">
              <dt className="shrink-0 font-medium text-foreground">入学笔试</dt>
              <dd className="text-muted-foreground">填表格、写作文等等</dd>
            </div>
          </dl>
        </div>

        <div className="space-y-3">
          <h2 className="font-semibold">书院 Capture</h2>
          <div className="space-y-3">
            <div className="space-y-1">
              <p className="font-medium text-foreground">联合书院（UC）</p>
              <ul className="list-inside list-disc space-y-0.5 text-muted-foreground">
                <li>书通水</li>
                <li>奖学金多</li>
                <li>短期交换项目很香</li>
                <li>有 fyp</li>
                <li>保宿卷</li>
                <li>有概率被分到恒生楼（交通不便）</li>
              </ul>
            </div>
            <div className="space-y-1">
              <p className="font-medium text-foreground">和声书院（LWS）</p>
              <ul className="list-inside list-disc space-y-0.5 text-muted-foreground">
                <li>有小冰箱</li>
                <li>有海景</li>
                <li>著名甜品店</li>
                <li>书通 workload 大</li>
                <li>能加宿分的活动少</li>
                <li>下山较远</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      <footer className="border-t pt-4 text-xs text-muted-foreground">
        非官方 ·
        仅供参考：本工具由学生整理的相对经验数据驱动，不代表书院或大学立场，
        结果仅供选择志愿时参考。暂不含医科 / 跨学科等专业。
      </footer>
    </div>
  );
}
