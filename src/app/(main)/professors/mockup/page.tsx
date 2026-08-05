import Link from "next/link";
import type { Metadata } from "next";

import { ProfessorPortrait } from "@/components/professors/professor-portrait";
import { selectProfessorProfile } from "@/lib/professor-card-source";

export const metadata: Metadata = {
  title: "LIU Shengchao | 教授测评",
  robots: { index: false, follow: false },
};

const scoreFormat = new Intl.NumberFormat("zh-HK", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});
const countFormat = new Intl.NumberFormat("zh-HK");

const professor = {
  name: "LIU Shengchao",
  title: "Assistant Professor",
  department: "Department of Computer Science and Engineering",
  imageUrl: "https://www.cse.cuhk.edu.hk/wp-content/uploads/people/sclui_s.png",
  departmentUrl: "https://www.cse.cuhk.edu.hk/people/faculty/shengchao-liu/",
  researchPortalUrl: "https://research.cuhk.edu.hk/en/persons/shengchao-liu/",
  rating: 3,
  ratingCount: 2,
  reviewCount: 2,
} as const;

const reviews = [
  {
    id: "2992359a-7b90-448a-be75-732ffd7da2a7",
    score: 5,
    content: "牢刘人美心善",
  },
  {
    id: "28925cca-fa6c-4f5e-9099-3903c0609a8c",
    score: 1,
    content: "牢刘闹麻了",
  },
] as const;

const primaryProfile = selectProfessorProfile(professor.researchPortalUrl, [
  {
    source: "cuhk_department:cse-faculty",
    sourceKey: professor.departmentUrl,
    profileUrl: professor.departmentUrl,
    profileVerifiedAt: "2026-08-05T00:00:00Z",
    appointmentKind: "regular",
    isCurrent: true,
  },
]);

function ExternalArrow() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      className="size-3.5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
    >
      <path d="M5.25 3.25h7.5v7.5M12.5 3.5l-9 9" />
    </svg>
  );
}

function ScoreBar({ score, count }: { score: number; count: number }) {
  return (
    <div
      aria-label={`${score} 分：${countFormat.format(count)} 次评分`}
      className="grid grid-cols-[12px_1fr_20px] items-center gap-2 text-xs"
    >
      <span className="text-muted-foreground tabular-nums">{score}</span>
      <div
        aria-hidden="true"
        className="h-1.5 overflow-hidden rounded-full bg-secondary"
      >
        <div
          className="h-full rounded-full bg-foreground/75"
          style={{
            width: `${(count / Math.max(professor.ratingCount, 1)) * 100}%`,
          }}
        />
      </div>
      <span className="text-right text-muted-foreground tabular-nums">
        {count}
      </span>
    </div>
  );
}

export default function ProfessorCardMockupPage() {
  return (
    <div className="min-w-0 flex-1">
      <div className="mx-auto max-w-4xl px-5 py-8 sm:px-8 sm:py-12">
        <div className="flex items-center justify-between gap-4">
          <Link
            href="/courses"
            className="rounded-sm text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            ← 返回课程
          </Link>
          <Link
            href="/professors/mockup/search"
            className="rounded-sm text-sm font-medium underline decoration-border underline-offset-4 transition-colors hover:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            查找教授
          </Link>
        </div>

        <section className="mt-6 overflow-hidden rounded-xl border bg-card">
          <div className="grid gap-6 p-5 sm:grid-cols-[128px_1fr] sm:p-7">
            <ProfessorPortrait
              imageUrl={professor.imageUrl}
              name={professor.name}
            />

            <div className="min-w-0">
              <h1 className="text-3xl font-semibold tracking-[-0.035em] text-balance sm:text-4xl">
                {professor.name}
              </h1>
              <p className="mt-2 text-sm font-medium">{professor.title}</p>
              <p className="mt-1 max-w-xl text-sm leading-6 text-muted-foreground">
                {professor.department}
              </p>

              <div className="mt-5 flex flex-wrap gap-2">
                {primaryProfile ? (
                  <a
                    href={primaryProfile.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex min-h-10 items-center gap-2 rounded-md bg-foreground px-3.5 text-sm font-medium text-background transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  >
                    {primaryProfile.kind === "department"
                      ? "院系主页"
                      : "Research Portal"}
                    <ExternalArrow />
                  </a>
                ) : null}
                {primaryProfile?.kind === "department" ? (
                  <a
                    href={professor.researchPortalUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex min-h-10 items-center gap-2 rounded-md px-2 text-sm text-muted-foreground underline decoration-border underline-offset-4 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  >
                    <span translate="no">研究资料 · Research Portal</span>
                    <ExternalArrow />
                  </a>
                ) : null}
              </div>
            </div>
          </div>

          <div className="grid border-t sm:grid-cols-[1fr_1.35fr]">
            <div className="border-b p-5 sm:border-r sm:border-b-0 sm:p-7">
              <p className="text-[11px] font-medium tracking-[0.08em] text-muted-foreground uppercase">
                课程测评平均分
              </p>
              <div className="mt-3 flex items-end gap-2">
                <span className="text-5xl font-light tracking-[-0.06em] tabular-nums">
                  {scoreFormat.format(professor.rating)}
                </span>
                <span className="pb-1 text-sm text-muted-foreground">/ 5</span>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                {countFormat.format(professor.ratingCount)} 份课程测评 · 来自 1
                门课程
              </p>
            </div>
            <div className="p-5 sm:p-7">
              {professor.ratingCount >= 5 ? (
                <div className="space-y-2">
                  <p className="mb-3 text-[11px] font-medium tracking-[0.08em] text-muted-foreground uppercase">
                    评分分布
                  </p>
                  {[5, 4, 3, 2, 1].map((score) => (
                    <ScoreBar
                      key={score}
                      score={score}
                      count={score === 5 || score === 1 ? 1 : 0}
                    />
                  ))}
                </div>
              ) : (
                <div className="rounded-lg bg-[#fbf3db] p-4 text-[#6f5308] dark:bg-amber-950/30 dark:text-amber-200">
                  <p className="text-sm font-medium">样本较少</p>
                  <p className="mt-1 text-xs leading-5 opacity-80">
                    暂不展示评分分布。更多同学提交课程测评后，结果会更有参考价值。
                  </p>
                </div>
              )}
            </div>
          </div>
        </section>

        <section className="mt-8">
          <div className="flex items-end justify-between gap-4 border-b pb-3">
            <div>
              <p className="text-[11px] font-medium tracking-[0.08em] text-muted-foreground uppercase">
                课程表现
              </p>
              <h2 className="mt-1 text-xl font-semibold tracking-tight">
                相关课程
              </h2>
            </div>
            <span className="text-xs text-muted-foreground">
              1 门有评分课程
            </span>
          </div>
          <Link
            href="/courses/CSCI2100"
            className="mt-4 grid gap-4 rounded-lg border p-5 transition-colors hover:bg-secondary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:grid-cols-[1fr_auto] sm:items-center"
          >
            <div>
              <p
                translate="no"
                className="font-mono text-xs text-muted-foreground"
              >
                CSCI 2100
              </p>
              <h3 className="mt-1 font-medium">Data Structures</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                2025–26 · Term 2 · 2 条评论
              </p>
            </div>
            <div className="flex items-baseline gap-1 sm:text-right">
              <span className="text-2xl font-light tracking-[-0.04em] tabular-nums">
                {scoreFormat.format(professor.rating)}
              </span>
              <span className="text-xs text-muted-foreground">/ 5</span>
            </div>
          </Link>
        </section>

        <section className="mt-10">
          <div className="border-b pb-3">
            <p className="text-[11px] font-medium tracking-[0.08em] text-muted-foreground uppercase">
              课程测评
            </p>
            <h2 className="mt-1 text-xl font-semibold tracking-tight">
              同学测评
            </h2>
          </div>
          <ul className="divide-y">
            {reviews.map((review) => (
              <li key={review.id} className="py-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium">匿名同学</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      CSCI 2100 · 2025–26 Term 2
                    </p>
                  </div>
                  <span className="rounded-full bg-[#fbf3db] px-2.5 py-1 text-xs font-medium text-[#956400] dark:bg-amber-950/40 dark:text-amber-300">
                    {scoreFormat.format(review.score)} / 5
                  </span>
                </div>
                <p className="mt-4 break-words text-sm leading-6">
                  {review.content}
                </p>
                <Link
                  href={`/courses/CSCI2100?tab=reviews&review=${review.id}#course-review-${review.id}`}
                  className="mt-3 inline-block rounded-sm text-xs text-muted-foreground underline decoration-border underline-offset-4 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  回到原课程查看讨论
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
