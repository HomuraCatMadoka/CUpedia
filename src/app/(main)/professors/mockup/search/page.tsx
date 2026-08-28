import type { Metadata } from "next";
import Link from "next/link";
import { SearchIcon } from "lucide-react";

import { ProfessorPortrait } from "@/components/professors/professor-portrait";
import {
  filterProfessorDirectoryPreview,
  professorDirectoryPreview,
} from "@/lib/professor-mockup-data";

export const metadata: Metadata = {
  title: "查找教授",
  robots: { index: false, follow: false },
};

const faculties = [
  ...new Set(professorDirectoryPreview.map((item) => item.faculty)),
];
const scoreFormat = new Intl.NumberFormat("zh-HK", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

export default async function ProfessorSearchMockupPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; faculty?: string }>;
}) {
  const { q, faculty } = await searchParams;
  const professors = filterProfessorDirectoryPreview(q, faculty);

  return (
    <div className="min-w-0 flex-1 overflow-y-auto">
      <div className="mx-auto max-w-6xl px-6 py-10">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm text-muted-foreground">课程测评</p>
            <h1 className="mt-1 text-3xl font-semibold tracking-[-0.035em]">
              查找教授
            </h1>
          </div>
          <Link
            href="/courses"
            className="rounded-sm text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            浏览课程 →
          </Link>
        </div>

        <form className="mt-8 grid gap-3 sm:grid-cols-[1fr_220px_auto]">
          <label className="relative">
            <span className="sr-only">搜索教授</span>
            <SearchIcon
              aria-hidden="true"
              className="absolute top-1/2 left-4 size-5 -translate-y-1/2 text-muted-foreground"
            />
            <input
              type="search"
              name="q"
              defaultValue={q}
              placeholder="搜索教授姓名、学系或职衔..."
              className="min-h-12 w-full rounded-xl border bg-background pr-4 pl-11 text-sm placeholder:text-muted-foreground focus:border-foreground focus:outline-none"
            />
          </label>
          <label>
            <span className="sr-only">按学院筛选</span>
            <select
              name="faculty"
              defaultValue={faculty ?? ""}
              className="min-h-12 w-full rounded-xl border bg-background px-4 text-sm focus:border-foreground focus:outline-none"
            >
              <option value="">全部学院</option>
              {faculties.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>
          <button
            type="submit"
            className="min-h-12 rounded-xl bg-foreground px-5 text-sm font-medium text-background transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            搜索
          </button>
        </form>

        <div className="mt-5 flex items-center justify-between gap-4">
          <p className="text-sm text-muted-foreground">
            {q || faculty ? `找到 ${professors.length} 位教授` : "教授目录预览"}
          </p>
          {q || faculty ? (
            <Link
              href="/professors/mockup/search"
              className="rounded-sm text-sm text-muted-foreground underline decoration-border underline-offset-4 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              清除筛选
            </Link>
          ) : null}
        </div>

        {professors.length === 0 ? (
          <div className="mt-4 rounded-2xl border border-dashed p-12 text-center text-sm text-muted-foreground">
            没有符合条件的教授，试试姓名拼音或调整学院筛选。
          </div>
        ) : (
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {professors.map((professor) => (
              <article
                key={professor.slug}
                className="flex min-w-0 gap-4 rounded-xl border bg-card p-4"
              >
                <ProfessorPortrait
                  variant="icon"
                  portrait={null}
                  name={professor.name}
                />
                <div className="min-w-0 flex-1">
                  <h2 className="truncate font-medium">{professor.name}</h2>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {professor.department}
                  </p>
                  <div className="mt-3 flex items-center justify-between gap-3">
                    <span className="text-xs text-muted-foreground">
                      {professor.rating === null
                        ? "暂无评分"
                        : `${scoreFormat.format(professor.rating)} · ${professor.ratingCount} 份`}
                    </span>
                    {professor.slug === "liu-shengchao" ? (
                      <Link
                        href="/professors/mockup"
                        aria-label={`查看 ${professor.name} 的教授测评`}
                        className="rounded-sm text-xs font-medium underline decoration-border underline-offset-4 hover:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                      >
                        查看
                      </Link>
                    ) : (
                      <a
                        href={professor.profileUrl}
                        target="_blank"
                        rel="noreferrer"
                        aria-label={`打开 ${professor.name} 的院系主页（新标签）`}
                        className="rounded-sm text-xs font-medium underline decoration-border underline-offset-4 hover:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                      >
                        主页
                      </a>
                    )}
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
